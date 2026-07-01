import os
import sqlite3
import json
import io
import zipfile
from xml.sax.saxutils import escape
from datetime import datetime
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

DB_PATH = os.path.join(os.path.dirname(__file__), 'database.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Clean up legacy tables to avoid conflicts
        cursor.execute("DROP TABLE IF EXISTS discussion_points")
        cursor.execute("DROP TABLE IF EXISTS action_items")
        
        # Create meetings table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS meetings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                forum_type TEXT NOT NULL,
                date TEXT NOT NULL,
                department TEXT NOT NULL,
                facilitator TEXT NOT NULL,
                num_participants INTEGER NOT NULL,
                participants_list TEXT
            )
        ''')
        
        # Create meeting_logs table (Combined 1:1 discussion & action)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS meeting_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id INTEGER NOT NULL,
                discussion_point TEXT NOT NULL,
                category TEXT NOT NULL,
                priority TEXT NOT NULL,
                action_description TEXT NOT NULL,
                contact_person TEXT NOT NULL,
                contact_email TEXT NOT NULL,
                owner_remarks TEXT DEFAULT '',
                owner_remarks_date TEXT DEFAULT '',
                hr_remarks TEXT DEFAULT '',
                hr_remarks_date TEXT DEFAULT '',
                FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE
            )
        ''')

        # Keep every owner/HR response instead of only the latest value.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS remark_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                log_id INTEGER NOT NULL,
                author_type TEXT NOT NULL,
                remark TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (log_id) REFERENCES meeting_logs (id) ON DELETE CASCADE
            )
        ''')
        # Seed history once for remarks saved before conversation tracking existed.
        cursor.execute('''
            INSERT INTO remark_history (log_id, author_type, remark, created_at)
            SELECT l.id, 'Action Owner', l.owner_remarks,
                   COALESCE(NULLIF(l.owner_remarks_date, ''), 'Imported from existing record')
            FROM meeting_logs l
            WHERE l.owner_remarks <> ''
              AND NOT EXISTS (SELECT 1 FROM remark_history h WHERE h.log_id = l.id AND h.author_type = 'Action Owner')
        ''')
        cursor.execute('''
            INSERT INTO remark_history (log_id, author_type, remark, created_at)
            SELECT l.id, 'HR', l.hr_remarks,
                   COALESCE(NULLIF(l.hr_remarks_date, ''), 'Imported from existing record')
            FROM meeting_logs l
            WHERE l.hr_remarks <> ''
              AND NOT EXISTS (SELECT 1 FROM remark_history h WHERE h.log_id = l.id AND h.author_type = 'HR')
        ''')
        conn.commit()

# Initialize DB on import/startup
init_db()

# --- API Endpoints ---

# Root Endpoint
@app.route('/', methods=['GET'])
def index():
    return jsonify({
        'status': 'healthy',
        'message': 'OneVoice Portal REST API is running. Access the user interface via your React development server (usually at http://localhost:5173).'
    })

# Create new meeting
@app.route('/api/meetings', methods=['POST'])
def create_meeting():
    data = request.json
    forum_type = data.get('forum_type')
    date = data.get('date')
    department = data.get('department')
    facilitator = data.get('facilitator')
    num_participants = data.get('num_participants')
    participants_list = data.get('participants_list', []) # optional list of {name, empid}
    
    if not (forum_type and date and department and facilitator and num_participants is not None):
        return jsonify({'error': 'Missing required fields'}), 400

    if not isinstance(participants_list, list) or any(
        not isinstance(p, dict) or not (str(p.get('name', '')).strip() or str(p.get('empid', '')).strip())
        for p in participants_list
    ):
        return jsonify({'error': 'Each participant needs either a name or an employee ID'}), 400
        
    participants_str = json.dumps(participants_list)
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO meetings (forum_type, date, department, facilitator, num_participants, participants_list)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (forum_type, date, department, facilitator, num_participants, participants_str))
        meeting_id = cursor.lastrowid
        conn.commit()
        
    return jsonify({
        'id': meeting_id,
        'forum_type': forum_type,
        'date': date,
        'department': department,
        'facilitator': facilitator,
        'num_participants': num_participants,
        'participants_list': participants_list
    }), 201

# List all meetings
@app.route('/api/meetings', methods=['GET'])
def list_meetings():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM meetings ORDER BY date DESC, id DESC')
        rows = cursor.fetchall()
        
    meetings = []
    for row in rows:
        meeting_dict = dict(row)
        try:
            meeting_dict['participants_list'] = json.loads(row['participants_list']) if row['participants_list'] else []
        except Exception:
            meeting_dict['participants_list'] = []
        meetings.append(meeting_dict)
        
    return jsonify(meetings)

# Get one meeting + combined logs
@app.route('/api/meetings/<int:meeting_id>', methods=['GET'])
def get_meeting(meeting_id):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Get meeting details
        cursor.execute('SELECT * FROM meetings WHERE id = ?', (meeting_id,))
        meeting_row = cursor.fetchone()
        if not meeting_row:
            return jsonify({'error': 'Meeting not found'}), 404
            
        meeting = dict(meeting_row)
        try:
            meeting['participants_list'] = json.loads(meeting_row['participants_list']) if meeting_row['participants_list'] else []
        except Exception:
            meeting['participants_list'] = []
        
        # Get combined logs
        cursor.execute('SELECT * FROM meeting_logs WHERE meeting_id = ? ORDER BY id ASC', (meeting_id,))
        log_rows = cursor.fetchall()
        meeting['logs'] = [dict(row) for row in log_rows]
        
    return jsonify(meeting)

# Get one uncluttered discussion/action detail, including its full conversation.
@app.route('/api/logs/<int:log_id>', methods=['GET'])
def get_log(log_id):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT l.*, m.forum_type, m.date AS meeting_date, m.department
            FROM meeting_logs l JOIN meetings m ON m.id = l.meeting_id
            WHERE l.id = ?
        ''', (log_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'Log entry not found'}), 404
        result = dict(row)
        cursor.execute('SELECT * FROM remark_history WHERE log_id = ? ORDER BY id', (log_id,))
        result['history'] = [dict(item) for item in cursor.fetchall()]
    return jsonify(result)

# Add a combined discussion-action log item to a meeting
@app.route('/api/meetings/<int:meeting_id>/logs', methods=['POST'])
def add_meeting_log(meeting_id):
    data = request.json
    discussion_point = data.get('discussion_point')
    category = data.get('category')
    priority = data.get('priority')
    action_description = data.get('action_description')
    contact_person = data.get('contact_person')
    contact_email = data.get('contact_email', '')
    
    if not (discussion_point and category and priority and action_description and contact_person):
        return jsonify({'error': 'Missing required fields'}), 400
        
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM meetings WHERE id = ?', (meeting_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Meeting not found'}), 404
            
        cursor.execute('''
            INSERT INTO meeting_logs (
                meeting_id, discussion_point, category, priority, 
                action_description, contact_person, contact_email
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (meeting_id, discussion_point, category, priority, action_description, contact_person, contact_email))
        log_id = cursor.lastrowid
        conn.commit()
        
    return jsonify({
        'id': log_id,
        'meeting_id': meeting_id,
        'discussion_point': discussion_point,
        'category': category,
        'priority': priority,
        'action_description': action_description,
        'contact_person': contact_person,
        'contact_email': contact_email,
        'owner_remarks': '',
        'owner_remarks_date': '',
        'hr_remarks': '',
        'hr_remarks_date': ''
    }), 201

# Update remarks for a log item
@app.route('/api/logs/<int:log_id>', methods=['PATCH'])
def update_remarks(log_id):
    data = request.json
    owner_remarks = data.get('owner_remarks')
    hr_remarks = data.get('hr_remarks')
    
    current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    update_fields = []
    params = []
    
    if owner_remarks is not None:
        update_fields.append("owner_remarks = ?")
        params.append(owner_remarks)
        update_fields.append("owner_remarks_date = ?")
        params.append(current_time)
        
    if hr_remarks is not None:
        update_fields.append("hr_remarks = ?")
        params.append(hr_remarks)
        update_fields.append("hr_remarks_date = ?")
        params.append(current_time)
        
    if not update_fields:
        return jsonify({'error': 'No remarks provided for update'}), 400
        
    params.append(log_id)
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM meeting_logs WHERE id = ?', (log_id,))
        existing = cursor.fetchone()
        if not existing:
            return jsonify({'error': 'Log entry not found'}), 404
            
        cursor.execute(f'''
            UPDATE meeting_logs 
            SET {", ".join(update_fields)}
            WHERE id = ?
        ''', params)

        if owner_remarks is not None and owner_remarks.strip() and owner_remarks != existing['owner_remarks']:
            cursor.execute('INSERT INTO remark_history (log_id, author_type, remark, created_at) VALUES (?, ?, ?, ?)',
                           (log_id, 'Action Owner', owner_remarks.strip(), current_time))
        if hr_remarks is not None and hr_remarks.strip() and hr_remarks != existing['hr_remarks']:
            cursor.execute('INSERT INTO remark_history (log_id, author_type, remark, created_at) VALUES (?, ?, ?, ?)',
                           (log_id, 'HR', hr_remarks.strip(), current_time))
        conn.commit()
        
        # Get updated row
        cursor.execute('SELECT * FROM meeting_logs WHERE id = ?', (log_id,))
        updated_row = cursor.fetchone()
        
    return jsonify(dict(updated_row))

# Advanced Search by Forum Type (Category) and Date range
@app.route('/api/reports/search', methods=['GET'])
def reports_search():
    category = request.args.get('category')  # Maps to forum_type in meetings
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    query = 'SELECT * FROM meetings WHERE 1=1'
    params = []
    
    if category:
        query += ' AND forum_type = ?'
        params.append(category)
    if start_date:
        query += ' AND date >= ?'
        params.append(start_date)
    if end_date:
        query += ' AND date <= ?'
        params.append(end_date)
        
    query += ' ORDER BY date DESC, id DESC'
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        meeting_rows = cursor.fetchall()
        
        meetings = []
        for m_row in meeting_rows:
            m_dict = dict(m_row)
            try:
                m_dict['participants_list'] = json.loads(m_row['participants_list']) if m_row['participants_list'] else []
            except Exception:
                m_dict['participants_list'] = []
                
            # Get logs for this meeting
            cursor.execute('SELECT * FROM meeting_logs WHERE meeting_id = ?', (m_dict['id'],))
            m_dict['logs'] = [dict(row) for row in cursor.fetchall()]
            meetings.append(m_dict)
            
    return jsonify(meetings)

def _excel_column(number):
    result = ''
    while number:
        number, remainder = divmod(number - 1, 26)
        result = chr(65 + remainder) + result
    return result


def _make_xlsx(headers, rows):
    """Build a small, valid XLSX with the standard library (no openpyxl dependency)."""
    def cell(reference, value, style=''):
        safe = escape('' if value is None else str(value)).replace('\n', '&#10;')
        style_attr = f' s="{style}"' if style else ''
        return f'<c r="{reference}" t="inlineStr"{style_attr}><is><t xml:space="preserve">{safe}</t></is></c>'

    sheet_rows = []
    for row_number, values in enumerate([headers] + rows, 1):
        cells = ''.join(cell(f'{_excel_column(i)}{row_number}', value, '1' if row_number == 1 else '')
                        for i, value in enumerate(values, 1))
        sheet_rows.append(f'<row r="{row_number}">{cells}</row>')
    last_column = _excel_column(max(1, len(headers)))
    sheet = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
             f'<dimension ref="A1:{last_column}{max(1, len(rows) + 1)}"/>'
             '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
             f'<sheetData>{"".join(sheet_rows)}</sheetData><autoFilter ref="A1:{last_column}{max(1, len(rows) + 1)}"/></worksheet>')
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>')
        archive.writestr('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        archive.writestr('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Meetings" sheetId="1" r:id="rId1"/></sheets></workbook>')
        archive.writestr('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
        archive.writestr('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font/><font><b/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>')
        archive.writestr('xl/worksheets/sheet1.xml', sheet)
    output.seek(0)
    return output


# Export one row per meeting; repeated points and conversation become numbered columns.
@app.route('/api/reports/export', methods=['GET'])
def export_db():
    try:
        with get_db() as conn:
            meetings = conn.execute('SELECT * FROM meetings ORDER BY date DESC, id DESC').fetchall()
            records = []
            max_logs = 0
            max_history = {}
            for meeting in meetings:
                logs = []
                for log in conn.execute('SELECT * FROM meeting_logs WHERE meeting_id = ? ORDER BY id', (meeting['id'],)).fetchall():
                    item = dict(log)
                    item['history'] = [dict(h) for h in conn.execute('SELECT * FROM remark_history WHERE log_id = ? ORDER BY id', (log['id'],)).fetchall()]
                    logs.append(item)
                max_logs = max(max_logs, len(logs))
                for index, log in enumerate(logs, 1):
                    max_history[index] = max(max_history.get(index, 0), len(log['history']))
                records.append((dict(meeting), logs))

        headers = ['Meeting ID', 'Forum Type', 'Date', 'Department / Unit', 'Facilitator', 'Number of Participants', 'Participants (Name / Employee ID)']
        log_fields = ['Discussion Point', 'Action Item / Follow-up', 'Category', 'Priority', 'Person to Contact']
        for index in range(1, max_logs + 1):
            headers.extend([f'Point {index} - {field}' for field in log_fields])
            for history_index in range(1, max_history.get(index, 0) + 1):
                headers.extend([f'Point {index} - Update {history_index} Author', f'Point {index} - Update {history_index} Remark', f'Point {index} - Update {history_index} Date'])

        rows = []
        for meeting, logs in records:
            try:
                participants = json.loads(meeting.get('participants_list') or '[]')
            except (TypeError, json.JSONDecodeError):
                participants = []
            participant_text = '; '.join(f"{p.get('name') or '(no name)'} / {p.get('empid') or '(no ID)'}" for p in participants)
            row = [meeting['id'], meeting['forum_type'], meeting['date'], meeting['department'], meeting['facilitator'], meeting['num_participants'], participant_text]
            for index in range(1, max_logs + 1):
                log = logs[index - 1] if index <= len(logs) else None
                if log:
                    row.extend([log['discussion_point'], log['action_description'], log['category'], log['priority'], log['contact_person']])
                    for history_index in range(max_history.get(index, 0)):
                        history = log['history'][history_index] if history_index < len(log['history']) else None
                        row.extend([history['author_type'], history['remark'], history['created_at']] if history else ['', '', ''])
                else:
                    row.extend([''] * (len(log_fields) + 3 * max_history.get(index, 0)))
            rows.append(row)
        output = _make_xlsx(headers, rows)
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name='OneVoice_Portal_Database.xlsx'
        )
    except Exception as e:
        print(f"Export database error: {e}")
        return jsonify({'error': f'Failed to export database: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)
