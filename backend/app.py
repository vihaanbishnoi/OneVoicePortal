import os
import sqlite3
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

DB_PATH = os.path.join(os.path.dirname(__file__), 'database.db')
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://localhost:11434/api/generate')
OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'llama3.2')  # Default fallback model

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Create meetings table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS meetings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                forum_type TEXT NOT NULL,
                date TEXT NOT NULL,
                department TEXT NOT NULL,
                facilitator TEXT NOT NULL,
                num_participants INTEGER NOT NULL,
                mom_text TEXT
            )
        ''')
        
        # Create discussion_points table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS discussion_points (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id INTEGER NOT NULL,
                discussion_point TEXT NOT NULL,
                category TEXT NOT NULL,
                priority TEXT NOT NULL,
                sentiment TEXT,
                FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE
            )
        ''')
        
        # Create action_items table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS action_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id INTEGER NOT NULL,
                description TEXT NOT NULL,
                owner TEXT NOT NULL,
                due_date TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Open',
                FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE
            )
        ''')
        conn.commit()

# Initialize DB on import/startup
init_db()

# --- Helper to call Ollama ---
def call_ollama(prompt):
    try:
        payload = {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False
        }
        response = requests.post(OLLAMA_URL, json=payload, timeout=30)
        response.raise_for_status()
        result = response.json()
        return result.get('response', '').strip()
    except Exception as e:
        print(f"Error calling Ollama: {e}")
        return f"Error generating text from AI: {str(e)}"

# --- API Endpoints ---

# Create new meeting
@app.route('/api/meetings', methods=['POST'])
def create_meeting():
    data = request.json
    forum_type = data.get('forum_type')
    date = data.get('date')
    department = data.get('department')
    facilitator = data.get('facilitator')
    num_participants = data.get('num_participants')
    
    if not (forum_type and date and department and facilitator and num_participants is not None):
        return jsonify({'error': 'Missing required fields'}), 400
        
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO meetings (forum_type, date, department, facilitator, num_participants)
            VALUES (?, ?, ?, ?, ?)
        ''', (forum_type, date, department, facilitator, num_participants))
        meeting_id = cursor.lastrowid
        conn.commit()
        
    return jsonify({
        'id': meeting_id,
        'forum_type': forum_type,
        'date': date,
        'department': department,
        'facilitator': facilitator,
        'num_participants': num_participants
    }), 201

# List all meetings
@app.route('/api/meetings', methods=['GET'])
def list_meetings():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM meetings ORDER BY date DESC, id DESC')
        rows = cursor.fetchall()
        
    meetings = [dict(row) for row in rows]
    return jsonify(meetings)

# Get one meeting + discussion points + action items
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
        
        # Get discussion points
        cursor.execute('SELECT * FROM discussion_points WHERE meeting_id = ?', (meeting_id,))
        discussion_rows = cursor.fetchall()
        meeting['discussion_points'] = [dict(row) for row in discussion_rows]
        
        # Get action items
        cursor.execute('SELECT * FROM action_items WHERE meeting_id = ?', (meeting_id,))
        action_rows = cursor.fetchall()
        meeting['action_items'] = [dict(row) for row in action_rows]
        
    return jsonify(meeting)

# Add a discussion point
@app.route('/api/meetings/<int:meeting_id>/discussions', methods=['POST'])
def add_discussion(meeting_id):
    data = request.json
    discussion_point = data.get('discussion_point')
    category = data.get('category')
    priority = data.get('priority')
    
    if not (discussion_point and category and priority):
        return jsonify({'error': 'Missing required fields'}), 400
        
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM meetings WHERE id = ?', (meeting_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Meeting not found'}), 404
            
        cursor.execute('''
            INSERT INTO discussion_points (meeting_id, discussion_point, category, priority)
            VALUES (?, ?, ?, ?)
        ''', (meeting_id, discussion_point, category, priority))
        dp_id = cursor.lastrowid
        conn.commit()
        
    return jsonify({
        'id': dp_id,
        'meeting_id': meeting_id,
        'discussion_point': discussion_point,
        'category': category,
        'priority': priority,
        'sentiment': None
    }), 201

# Add an action item
@app.route('/api/meetings/<int:meeting_id>/actions', methods=['POST'])
def add_action(meeting_id):
    data = request.json
    description = data.get('description')
    owner = data.get('owner')
    due_date = data.get('due_date')
    
    if not (description and owner and due_date):
        return jsonify({'error': 'Missing required fields'}), 400
        
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM meetings WHERE id = ?', (meeting_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Meeting not found'}), 404
            
        cursor.execute('''
            INSERT INTO action_items (meeting_id, description, owner, due_date, status)
            VALUES (?, ?, ?, ?, 'Open')
        ''', (meeting_id, description, owner, due_date))
        ai_id = cursor.lastrowid
        conn.commit()
        
    return jsonify({
        'id': ai_id,
        'meeting_id': meeting_id,
        'description': description,
        'owner': owner,
        'due_date': due_date,
        'status': 'Open'
    }), 201

# Update action item status
@app.route('/api/actions/<int:action_id>', methods=['PATCH'])
def update_action(action_id):
    data = request.json
    status = data.get('status')
    
    if not status:
        return jsonify({'error': 'Missing status field'}), 400
        
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM action_items WHERE id = ?', (action_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Action item not found'}), 404
            
        cursor.execute('UPDATE action_items SET status = ? WHERE id = ?', (status, action_id))
        conn.commit()
        
    return jsonify({
        'id': action_id,
        'status': status
    })

# List all action items across all meetings
@app.route('/api/actions', methods=['GET'])
def list_actions():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT ai.*, m.forum_type, m.date, m.department 
            FROM action_items ai
            JOIN meetings m ON ai.meeting_id = m.id
            ORDER BY ai.due_date ASC
        ''')
        rows = cursor.fetchall()
        
    actions = [dict(row) for row in rows]
    return jsonify(actions)

# AI Generate MOM
@app.route('/api/meetings/<int:meeting_id>/generate-mom', methods=['POST'])
def generate_mom(meeting_id):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM meetings WHERE id = ?', (meeting_id,))
        meeting_row = cursor.fetchone()
        if not meeting_row:
            return jsonify({'error': 'Meeting not found'}), 404
            
        meeting = dict(meeting_row)
        
        cursor.execute('SELECT * FROM discussion_points WHERE meeting_id = ?', (meeting_id,))
        discussion_rows = cursor.fetchall()
        discussions = [dict(row) for row in discussion_rows]
        
        cursor.execute('SELECT * FROM action_items WHERE meeting_id = ?', (meeting_id,))
        action_rows = cursor.fetchall()
        actions = [dict(row) for row in action_rows]

    # Construct Prompt
    discussion_text = "\n".join([f"- [{d['category']} | Priority: {d['priority']}] {d['discussion_point']}" for d in discussions])
    action_text = "\n".join([f"- {a['description']} (Owner: {a['owner']}, Due: {a['due_date']})" for a in actions])
    
    prompt = f"""
Write a clean, formatted Minutes of Meeting (MOM) for the following meeting details:
Forum Type: {meeting['forum_type']}
Date: {meeting['date']}
Department: {meeting['department']}
Facilitator: {meeting['facilitator']}
Participants Count: {meeting['num_participants']}

Discussion Points raised:
{discussion_text if discussion_text else "No discussion points recorded."}

Action Items assigned:
{action_text if action_text else "No action items assigned."}

Write a professional, readable minutes document. Include sections for Meeting Metadata, Discussion Details, and Action Items. Keep the tone professional.
"""

    mom_text = call_ollama(prompt)
    
    # Save MOM text back to database
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('UPDATE meetings SET mom_text = ? WHERE id = ?', (mom_text, meeting_id))
        conn.commit()
        
    return jsonify({
        'meeting_id': meeting_id,
        'mom_text': mom_text
    })

# AI Generate Summary
@app.route('/api/meetings/<int:meeting_id>/generate-summary', methods=['POST'])
def generate_summary(meeting_id):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM meetings WHERE id = ?', (meeting_id,))
        meeting_row = cursor.fetchone()
        if not meeting_row:
            return jsonify({'error': 'Meeting not found'}), 404
            
        cursor.execute('SELECT * FROM discussion_points WHERE meeting_id = ?', (meeting_id,))
        discussion_rows = cursor.fetchall()
        discussions = [dict(row) for row in discussion_rows]
        
        cursor.execute('SELECT * FROM action_items WHERE meeting_id = ?', (meeting_id,))
        action_rows = cursor.fetchall()
        actions = [dict(row) for row in action_rows]

    # Prompt Ollama for concerns, feedback, open actions
    discussion_text = "\n".join([f"- {d['discussion_point']} ({d['category']})" for d in discussions])
    action_text = "\n".join([f"- {a['description']} (Owner: {a['owner']}, Status: {a['status']})" for a in actions])

    prompt = f"""
You are an HR assistant summarizing a meeting.
Based on the following meeting inputs, extract and write three separate sections:
1. Top 5 Concerns Being Raised (or fewer, if there aren't many. Focus on complaints/needs/worries)
2. Positive Feedback Being Shared (praise, accomplishments, good vibes)
3. Open Action Items Needing Attention (list items that are pending or require tracking)

Use the following exact separators to format your output:
[CONCERNS]
(Write the concerns here)
[FEEDBACK]
(Write the positive feedback here)
[ACTIONS]
(Write the open actions here)

Here is the meeting data:
Discussions:
{discussion_text if discussion_text else "None"}

Actions:
{action_text if action_text else "None"}
"""

    ai_response = call_ollama(prompt)

    # Parse response into 3 sections
    concerns = ""
    feedback = ""
    open_actions = ""
    
    parts = ai_response.split('[CONCERNS]')
    if len(parts) > 1:
        rest = parts[1]
        feedback_parts = rest.split('[FEEDBACK]')
        concerns = feedback_parts[0].strip()
        if len(feedback_parts) > 1:
            rest_fb = feedback_parts[1]
            action_parts = rest_fb.split('[ACTIONS]')
            feedback = action_parts[0].strip()
            if len(action_parts) > 1:
                open_actions = action_parts[1].strip()
    else:
        # Fallback if AI didn't format correctly
        concerns = ai_response
        feedback = "Refer to concerns section."
        open_actions = "Refer to concerns section."

    return jsonify({
        'concerns': concerns,
        'feedback': feedback,
        'actions': open_actions
    })

# AI Sentiment Analysis
@app.route('/api/discussions/<int:dp_id>/sentiment', methods=['POST'])
def analyze_sentiment(dp_id):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM discussion_points WHERE id = ?', (dp_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'Discussion point not found'}), 404
            
        dp = dict(row)

    prompt = f"""
Analyze the sentiment of this employee discussion point: "{dp['discussion_point']}".
Respond with exactly one word: Positive, Neutral, or Negative. Do not include any other text, explanation, or punctuation.
"""
    
    sentiment = call_ollama(prompt)
    # Clean up sentiment
    sentiment = sentiment.replace('.', '').strip()
    valid_sentiments = ["Positive", "Neutral", "Negative"]
    # Fallback/validation
    matched_sentiment = "Neutral"
    for s in valid_sentiments:
        if s.lower() in sentiment.lower():
            matched_sentiment = s
            break
            
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('UPDATE discussion_points SET sentiment = ? WHERE id = ?', (matched_sentiment, dp_id))
        conn.commit()
        
    return jsonify({
        'id': dp_id,
        'sentiment': matched_sentiment
    })

# AI Reports Insights
@app.route('/api/reports/insights', methods=['GET'])
def reports_insights():
    department = request.args.get('department')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    query = '''
        SELECT dp.discussion_point, dp.category, m.department, m.date 
        FROM discussion_points dp
        JOIN meetings m ON dp.meeting_id = m.id
        WHERE 1=1
    '''
    params = []
    if department:
        query += ' AND m.department = ?'
        params.append(department)
    if start_date:
        query += ' AND m.date >= ?'
        params.append(start_date)
    if end_date:
        query += ' AND m.date <= ?'
        params.append(end_date)
        
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
    discussions = [dict(row) for row in rows]
    if not discussions:
        return jsonify({'insights': 'No discussion points found matching the criteria.'})
        
    discussion_text = "\n".join([f"- {d['discussion_point']} (Dept: {d['department']})" for d in discussions])
    
    prompt = f"""
You are an HR analyst. Below is a list of discussions/complaints raised by employees in meetings.
Analyze them and identify the top 5 recurring themes or issues.
Group similar complaints together (for example, "cafeteria food", "canteen quality", and "mess food" are the same recurring issue) and rank them by frequency or severity.
Provide a clear ranked list with a description of the issue and why it is categorized together.

Discussions:
{discussion_text}
"""

    insights = call_ollama(prompt)
    return jsonify({'insights': insights})

# Plain search
@app.route('/api/reports/search', methods=['GET'])
def reports_search():
    department = request.args.get('department')
    status = request.args.get('status')
    category = request.args.get('category')
    
    # 1. Search meetings
    meeting_query = 'SELECT * FROM meetings WHERE 1=1'
    meeting_params = []
    if department:
        meeting_query += ' AND department = ?'
        meeting_params.append(department)
    meeting_query += ' ORDER BY date DESC'
        
    # 2. Search discussions
    discussion_query = '''
        SELECT dp.*, m.department, m.date, m.forum_type 
        FROM discussion_points dp
        JOIN meetings m ON dp.meeting_id = m.id
        WHERE 1=1
    '''
    discussion_params = []
    if department:
        discussion_query += ' AND m.department = ?'
        discussion_params.append(department)
    if category:
        discussion_query += ' AND dp.category = ?'
        discussion_params.append(category)
    discussion_query += ' ORDER BY m.date DESC'
        
    # 3. Search action items
    action_query = '''
        SELECT ai.*, m.department, m.date, m.forum_type 
        FROM action_items ai
        JOIN meetings m ON ai.meeting_id = m.id
        WHERE 1=1
    '''
    action_params = []
    if department:
        action_query += ' AND m.department = ?'
        action_params.append(department)
    if status:
        action_query += ' AND ai.status = ?'
        action_params.append(status)
    action_query += ' ORDER BY ai.due_date ASC'
        
    with get_db() as conn:
        cursor = conn.cursor()
        
        cursor.execute(meeting_query, meeting_params)
        meetings = [dict(row) for row in cursor.fetchall()]
        
        cursor.execute(discussion_query, discussion_params)
        discussions = [dict(row) for row in cursor.fetchall()]
        
        cursor.execute(action_query, action_params)
        actions = [dict(row) for row in cursor.fetchall()]
        
    return jsonify({
        'meetings': meetings,
        'discussions': discussions,
        'actions': actions
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)
