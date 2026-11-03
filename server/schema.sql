-- PostgreSQL schema compatible with the original SQLAlchemy models.
CREATE TABLE IF NOT EXISTS ai_usage (
	id SERIAL NOT NULL, 
	demo_session_id VARCHAR(36) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS demo_sessions (
	id VARCHAR(36) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS users (
	id SERIAL NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	role VARCHAR(30) NOT NULL, 
	active BOOLEAN NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS activity (
	id SERIAL NOT NULL, 
	actor_id INTEGER, 
	actor_role VARCHAR(30) NOT NULL, 
	event VARCHAR(80) NOT NULL, 
	detail VARCHAR(300) NOT NULL, 
	demo_session_id VARCHAR(36), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(actor_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS gmail_connections (
	user_id INTEGER NOT NULL, 
	mailbox VARCHAR(255) NOT NULL, 
	encrypted_credentials TEXT NOT NULL, 
	last_synced_at TIMESTAMP WITH TIME ZONE, 
	last_error VARCHAR(300), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS meetings (
	id SERIAL NOT NULL, 
	forum_type VARCHAR(80) NOT NULL, 
	date DATE NOT NULL, 
	department VARCHAR(120) NOT NULL, 
	facilitator VARCHAR(120) NOT NULL, 
	num_participants INTEGER NOT NULL, 
	participants_list TEXT NOT NULL, 
	demo_session_id VARCHAR(36), 
	created_at TIMESTAMP WITH TIME ZONE, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(demo_session_id) REFERENCES demo_sessions (id)
);

CREATE TABLE IF NOT EXISTS actions (
	id SERIAL NOT NULL, 
	meeting_id INTEGER NOT NULL, 
	discussion_point TEXT NOT NULL, 
	category VARCHAR(120) NOT NULL, 
	priority VARCHAR(20) NOT NULL, 
	action_description TEXT NOT NULL, 
	contact_person VARCHAR(120) NOT NULL, 
	contact_email VARCHAR(255) NOT NULL, 
	owner_id INTEGER, 
	owner_name VARCHAR(120) NOT NULL, 
	gmail_thread_id VARCHAR(255), 
	gmail_mailbox VARCHAR(255), 
	status VARCHAR(30) NOT NULL, 
	due_date DATE, 
	last_reminded_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(meeting_id) REFERENCES meetings (id) ON DELETE CASCADE, 
	FOREIGN KEY(owner_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS ai_results (
	id SERIAL NOT NULL, 
	action_id INTEGER NOT NULL, 
	task VARCHAR(20) NOT NULL, 
	content TEXT NOT NULL, 
	provider VARCHAR(20) NOT NULL, 
	model VARCHAR(100) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(action_id) REFERENCES actions (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversation_messages (
	id SERIAL NOT NULL, 
	action_id INTEGER NOT NULL, 
	sender VARCHAR(255) NOT NULL, 
	subject VARCHAR(500) NOT NULL, 
	body TEXT NOT NULL, 
	direction VARCHAR(20) NOT NULL, 
	source VARCHAR(20) NOT NULL, 
	external_id VARCHAR(255), 
	sent_at TIMESTAMP WITH TIME ZONE, 
	recorded_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (action_id, source, external_id), 
	FOREIGN KEY(action_id) REFERENCES actions (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
	id SERIAL NOT NULL, 
	user_id INTEGER, 
	action_id INTEGER, 
	demo_session_id VARCHAR(36), 
	title VARCHAR(180) NOT NULL, 
	body TEXT NOT NULL, 
	read BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id), 
	FOREIGN KEY(action_id) REFERENCES actions (id) ON DELETE CASCADE, 
	FOREIGN KEY(demo_session_id) REFERENCES demo_sessions (id)
);

CREATE TABLE IF NOT EXISTS remarks (
	id SERIAL NOT NULL, 
	action_id INTEGER NOT NULL, 
	author VARCHAR(50) NOT NULL, 
	remark TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(action_id) REFERENCES actions (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_ai_usage_demo_session_id ON ai_usage (demo_session_id);
CREATE INDEX IF NOT EXISTS ix_meetings_demo_session_id ON meetings (demo_session_id);
CREATE INDEX IF NOT EXISTS ix_notifications_demo_session_id ON notifications (demo_session_id);