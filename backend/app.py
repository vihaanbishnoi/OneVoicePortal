"""Secure PostgreSQL API for OneVoice."""
import json, os
from datetime import date, datetime, timedelta, timezone
from functools import wraps
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, create_engine, func, or_
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker
from werkzeug.security import check_password_hash, generate_password_hash
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

load_dotenv()
DATABASE_URL=os.getenv("DATABASE_URL"); SECRET_KEY=os.getenv("SECRET_KEY")
if not DATABASE_URL or not SECRET_KEY: raise RuntimeError("Set DATABASE_URL (PostgreSQL) and SECRET_KEY. SQLite is not supported.")
app=Flask(__name__); CORS(app); engine=create_engine(DATABASE_URL,pool_pre_ping=True); DB=sessionmaker(bind=engine,expire_on_commit=False); signer=URLSafeTimedSerializer(SECRET_KEY,salt="onevoice")
class Base(DeclarativeBase): pass
class User(Base):
 __tablename__="users"; id:Mapped[int]=mapped_column(primary_key=True); name:Mapped[str]=mapped_column(String(120)); email:Mapped[str]=mapped_column(String(255),unique=True); password_hash:Mapped[str]=mapped_column(String(255)); role:Mapped[str]=mapped_column(String(30),default="action_owner"); active:Mapped[bool]=mapped_column(Boolean,default=True)
class Meeting(Base):
 __tablename__="meetings"; id:Mapped[int]=mapped_column(primary_key=True); forum_type:Mapped[str]=mapped_column(String(80)); date:Mapped[date]=mapped_column(Date); department:Mapped[str]=mapped_column(String(120)); facilitator:Mapped[str]=mapped_column(String(120)); num_participants:Mapped[int]=mapped_column(Integer); participants_list:Mapped[str]=mapped_column(Text,default="[]"); logs:Mapped[list["Action"]]=relationship(back_populates="meeting",cascade="all, delete-orphan")
class Action(Base):
 __tablename__="actions"; id:Mapped[int]=mapped_column(primary_key=True); meeting_id:Mapped[int]=mapped_column(ForeignKey("meetings.id",ondelete="CASCADE")); discussion_point:Mapped[str]=mapped_column(Text); category:Mapped[str]=mapped_column(String(120)); priority:Mapped[str]=mapped_column(String(20),default="Medium"); action_description:Mapped[str]=mapped_column(Text); contact_person:Mapped[str]=mapped_column(String(120)); contact_email:Mapped[str]=mapped_column(String(255),default=""); owner_id:Mapped[int|None]=mapped_column(ForeignKey("users.id")); status:Mapped[str]=mapped_column(String(30),default="Open"); due_date:Mapped[date|None]=mapped_column(Date); last_reminded_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True)); created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=lambda:datetime.now(timezone.utc)); updated_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=lambda:datetime.now(timezone.utc),onupdate=lambda:datetime.now(timezone.utc)); meeting:Mapped[Meeting]=relationship(back_populates="logs"); owner:Mapped[User|None]=relationship(); history:Mapped[list["Remark"]]=relationship(cascade="all, delete-orphan")
class Remark(Base):
 __tablename__="remarks"; id:Mapped[int]=mapped_column(primary_key=True); action_id:Mapped[int]=mapped_column(ForeignKey("actions.id",ondelete="CASCADE")); author:Mapped[str]=mapped_column(String(50)); remark:Mapped[str]=mapped_column(Text); created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=lambda:datetime.now(timezone.utc))
class Notification(Base):
 __tablename__="notifications"; id:Mapped[int]=mapped_column(primary_key=True); user_id:Mapped[int|None]=mapped_column(ForeignKey("users.id")); action_id:Mapped[int|None]=mapped_column(ForeignKey("actions.id",ondelete="CASCADE")); title:Mapped[str]=mapped_column(String(180)); body:Mapped[str]=mapped_column(Text); read:Mapped[bool]=mapped_column(Boolean,default=False); created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=lambda:datetime.now(timezone.utc))
def iso(d): return d.isoformat() if d else None
def user_json(u): return {"id":u.id,"name":u.name,"email":u.email,"role":u.role}
def action_json(a,meeting=False):
 r={"id":a.id,"meeting_id":a.meeting_id,"discussion_point":a.discussion_point,"category":a.category,"priority":a.priority,"action_description":a.action_description,"contact_person":a.contact_person,"contact_email":a.contact_email,"owner_id":a.owner_id,"owner_name":a.owner.name if a.owner else None,"status":a.status,"due_date":iso(a.due_date),"created_at":iso(a.created_at),"updated_at":iso(a.updated_at)}
 if meeting:r["meeting"]={"id":a.meeting.id,"date":iso(a.meeting.date),"department":a.meeting.department,"forum_type":a.meeting.forum_type}
 return r
def meeting_json(m,detail=False):
 r={"id":m.id,"forum_type":m.forum_type,"date":iso(m.date),"department":m.department,"facilitator":m.facilitator,"num_participants":m.num_participants,"participants_list":json.loads(m.participants_list or "[]")}
 if detail:r["logs"]=[action_json(a) for a in m.logs]
 return r
def require(*roles):
 def dec(fn):
  @wraps(fn)
  def wrapped(*args,**kwargs):
   h=request.headers.get("Authorization","")
   if not h.startswith("Bearer "):return jsonify(error="Authentication required"),401
   try:p=signer.loads(h[7:],max_age=43200)
   except (BadSignature,SignatureExpired):return jsonify(error="Session expired or invalid"),401
   db=DB(); u=db.get(User,p.get("id")); db.close()
   if not u or not u.active:return jsonify(error="Account unavailable"),401
   if roles and u.role not in roles:return jsonify(error="Permission denied"),403
   request.user=u; return fn(*args,**kwargs)
  return wrapped
 return dec
def parsed(v): return date.fromisoformat(v) if v else None
def allowed(a): return request.user.role in ("hr_admin","hr_team") or a.owner_id==request.user.id

@app.get("/")
def home():return {"status":"healthy","database":"postgresql"}
@app.post("/api/auth/login")
def login():
 d=request.get_json() or {}; db=DB(); u=db.query(User).filter_by(email=d.get("email","").lower().strip()).first(); db.close()
 if not u or not u.active or not check_password_hash(u.password_hash,d.get("password","")):return jsonify(error="Invalid email or password"),401
 return {"token":signer.dumps({"id":u.id}),"user":user_json(u)}
@app.get("/api/auth/me")
@require()
def me():return user_json(request.user)
@app.get("/api/users")
@require("hr_admin","hr_team")
def users():
 db=DB(); x=[user_json(u) for u in db.query(User).filter_by(active=True).order_by(User.name)];db.close();return x
@app.post("/api/users")
@require("hr_admin")
def add_user():
 d=request.get_json() or {}
 if not all(d.get(x) for x in ("name","email","password","role")) or d["role"] not in ("hr_admin","hr_team","action_owner","viewer"):return jsonify(error="Enter name, email, password and a valid role"),400
 db=DB(); email=d["email"].lower().strip()
 if db.query(User).filter_by(email=email).first():db.close();return jsonify(error="Email already exists"),409
 u=User(name=d["name"].strip(),email=email,password_hash=generate_password_hash(d["password"]),role=d["role"]);db.add(u);db.commit();r=user_json(u);db.close();return r,201
@app.post("/api/meetings")
@require("hr_admin","hr_team")
def add_meeting():
 d=request.get_json() or {}
 try:m=Meeting(forum_type=d["forum_type"],date=parsed(d["date"]),department=d["department"],facilitator=d["facilitator"],num_participants=int(d["num_participants"]),participants_list=json.dumps(d.get("participants_list",[])))
 except (KeyError,ValueError,TypeError):return jsonify(error="Invalid or incomplete meeting data"),400
 db=DB();db.add(m);db.commit();r=meeting_json(m);db.close();return r,201
@app.get("/api/meetings")
@require()
def meetings():
 db=DB();r=[meeting_json(m) for m in db.query(Meeting).order_by(Meeting.date.desc()).all()];db.close();return r
@app.get("/api/meetings/<int:id>")
@require()
def get_meeting(id):
 db=DB();m=db.get(Meeting,id)
 if not m:db.close();return jsonify(error="Meeting not found"),404
 r=meeting_json(m,True);db.close();return r
@app.post("/api/meetings/<int:id>/logs")
@require("hr_admin","hr_team")
def add_action(id):
 d=request.get_json() or {}; required=("discussion_point","category","priority","action_description","contact_person")
 if any(not d.get(x) for x in required):return jsonify(error="Missing action fields"),400
 try:due=parsed(d.get("due_date"))
 except ValueError:return jsonify(error="Due date must use YYYY-MM-DD"),400
 db=DB()
 if not db.get(Meeting,id):db.close();return jsonify(error="Meeting not found"),404
 a=Action(meeting_id=id,due_date=due,owner_id=d.get("owner_id") or None,**{x:d[x] for x in required},contact_email=d.get("contact_email",""));db.add(a);db.commit();r=action_json(a);db.close();return r,201
@app.get("/api/actions")
@require()
def actions():
 db=DB();q=db.query(Action)
 if request.user.role not in ("hr_admin","hr_team"):q=q.filter(Action.owner_id==request.user.id)
 if request.args.get("status"):q=q.filter(Action.status==request.args["status"])
 r=[action_json(a,True) for a in q.order_by(Action.due_date.is_(None),Action.due_date).all()];db.close();return r
@app.get("/api/logs/<int:id>")
@require()
def get_action(id):
 db=DB();a=db.get(Action,id)
 if not a or not allowed(a):db.close();return jsonify(error="Action not found"),404
 r=action_json(a,True);r.update(forum_type=a.meeting.forum_type,meeting_date=iso(a.meeting.date),department=a.meeting.department,history=[{"id":x.id,"author_type":x.author,"remark":x.remark,"created_at":iso(x.created_at)} for x in a.history]);db.close();return r
@app.patch("/api/logs/<int:id>")
@require()
def update_action(id):
 d=request.get_json() or {};db=DB();a=db.get(Action,id)
 if not a or not allowed(a):db.close();return jsonify(error="Action not found"),404
 if request.user.role in ("hr_admin","hr_team"):
  for f in ("status","priority","contact_person","contact_email","owner_id"):
   if f in d:setattr(a,f,d[f])
  if "due_date" in d:
   try:a.due_date=parsed(d["due_date"])
   except ValueError:db.close();return jsonify(error="Due date must use YYYY-MM-DD"),400
 remark=d.get("remark") or d.get("owner_remarks") or d.get("hr_remarks")
 if remark:db.add(Remark(action_id=a.id,author="HR" if request.user.role.startswith("hr_") else "Action Owner",remark=str(remark).strip()))
 db.commit();r=action_json(a,True);db.close();return r
@app.get("/api/dashboard")
@require("hr_admin","hr_team")
def dashboard():
 db=DB();today=date.today();a=db.query(Action).all();r={"totals":{"open":sum(x.status=="Open" for x in a),"in_progress":sum(x.status=="In Progress" for x in a),"overdue":sum(x.status!="Completed" and x.due_date and x.due_date<today for x in a),"unassigned":sum(x.status!="Completed" and not x.owner_id for x in a)},"attention":[action_json(x,True) for x in a if x.status!="Completed" and (not x.owner_id or (x.due_date and x.due_date<=today+timedelta(days=7)))],"concerns":[{"category":c,"count":n} for c,n in db.query(Action.category,func.count(Action.id)).group_by(Action.category).order_by(func.count(Action.id).desc()).limit(5)]};db.close();return r
@app.get("/api/calendar")
@require()
def calendar():
 start=parsed(request.args.get("start")) or date.today().replace(day=1);end=parsed(request.args.get("end")) or start+timedelta(days=62);db=DB();events=[{"id":f"meeting-{m.id}","type":"meeting","date":iso(m.date),"title":f"{m.forum_type}: {m.department}","meeting_id":m.id} for m in db.query(Meeting).filter(Meeting.date.between(start,end))];q=db.query(Action).filter(Action.due_date.between(start,end))
 if request.user.role not in ("hr_admin","hr_team"):q=q.filter(Action.owner_id==request.user.id)
 events += [{"id":f"action-{a.id}","type":"action","date":iso(a.due_date),"title":a.action_description,"action_id":a.id,"status":a.status,"priority":a.priority} for a in q];db.close();return events
@app.get("/api/notifications")
@require()
def notifications():
 db=DB();r=[{"id":n.id,"action_id":n.action_id,"title":n.title,"body":n.body,"read":n.read,"created_at":iso(n.created_at)} for n in db.query(Notification).filter(or_(Notification.user_id==request.user.id,Notification.user_id.is_(None))).order_by(Notification.created_at.desc())];db.close();return r
@app.post("/api/notifications/<int:id>/read")
@require()
def read_notification(id):
 db=DB();n=db.get(Notification,id)
 if not n or n.user_id not in (None,request.user.id):db.close();return jsonify(error="Notification not found"),404
 n.read=True;db.commit();db.close();return {"ok":True}
@app.post("/api/jobs/reminders")
def reminders():
 if request.headers.get("X-Job-Key")!=os.getenv("JOB_KEY"):return jsonify(error="Unauthorized"),401
 db=DB();today=date.today();count=0
 for a in db.query(Action).filter(Action.status!="Completed"):
  if a.due_date and a.due_date<=today+timedelta(days=7) and (not a.last_reminded_at or a.last_reminded_at.date()!=today):db.add(Notification(user_id=a.owner_id,action_id=a.id,title="Action overdue" if a.due_date<today else "Action due soon",body=f"{a.action_description} is due {iso(a.due_date)}."));a.last_reminded_at=datetime.now(timezone.utc);count+=1
 db.commit();db.close();return {"created":count}
@app.get("/api/reports/summary")
@require("hr_admin","hr_team")
def report():
 db=DB();today=date.today();a=db.query(Action).all();r={"generated_at":iso(datetime.now(timezone.utc)),"top_concerns":[{"category":c,"count":n} for c,n in db.query(Action.category,func.count(Action.id)).group_by(Action.category).order_by(func.count(Action.id).desc()).limit(5)],"high_risk_unresolved":[action_json(x,True) for x in a if x.status!="Completed" and (x.priority=="High" or (x.due_date and x.due_date<today))],"recommended_next_actions":["Assign every unassigned action owner.","Review overdue and high-priority actions in the next HR stand-up.","Plan a preventive intervention for recurring concerns."]};db.close();return r
def bootstrap():
 Base.metadata.create_all(engine);email=os.getenv("ADMIN_EMAIL");password=os.getenv("ADMIN_PASSWORD")
 if email and password:
  db=DB()
  if not db.query(User).filter_by(email=email.lower()).first():db.add(User(name=os.getenv("ADMIN_NAME","HR Administrator"),email=email.lower(),password_hash=generate_password_hash(password),role="hr_admin"));db.commit()
  db.close()
bootstrap()
if __name__=="__main__":app.run(host="0.0.0.0",port=int(os.getenv("PORT",5000)))
