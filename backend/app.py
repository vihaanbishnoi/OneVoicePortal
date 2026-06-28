import os
import sqlite3
import json
import io
from datetime import datetime
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import pandas as pd

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
        cursor.execute('SELECT id FROM meeting_logs WHERE id = ?', (log_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Log entry not found'}), 404
            
        cursor.execute(f'''
            UPDATE meeting_logs 
            SET {", ".join(update_fields)}
            WHERE id = ?
        ''', params)
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

# Export the entire database as a multi-sheet Excel file
@app.route('/api/reports/export', methods=['GET'])
def export_db():
    try:
        with get_db() as conn:
            df_meetings = pd.read_sql_query("SELECT * FROM meetings", conn)
            df_logs = pd.read_sql_query("SELECT * FROM meeting_logs", conn)
            
        # Create buffer
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df_meetings.to_excel(writer, sheet_name='Meetings', index=False)
            df_logs.to_excel(writer, sheet_name='Meeting Logs', index=False)
            
        output.seek(0)
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
