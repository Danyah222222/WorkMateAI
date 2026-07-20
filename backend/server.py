from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
from pathlib import Path
import os, uuid, io, csv, logging, jwt, bcrypt, json
import pypdf
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = os.environ['JWT_ALGORITHM']
JWT_EXPIRE_HOURS = int(os.environ['JWT_EXPIRE_HOURS'])

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="WorkMate AI API")
api = APIRouter(prefix="/api")
security = HTTPBearer()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("workmate")


# ---------------- Models ----------------
class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: Literal["admin", "employee"]
    company_id: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class SettingsPayload(BaseModel):
    assistant_name: str = "WorkMate"
    language: Literal["en", "ar"] = "en"
    personality: Literal["professional", "friendly"] = "professional"


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None


class EmployeeIn(BaseModel):
    name: str
    department: str
    position: str
    email: EmailStr


# ---------------- Auth helpers ----------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(401, "User not found")
    return user


async def require_admin(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    return user


def user_to_out(u: dict) -> UserOut:
    return UserOut(id=u["id"], email=u["email"], name=u["name"], role=u["role"], company_id=u["company_id"])


# ---------------- Seed ----------------
async def seed_technova():
    existing = await db.companies.find_one({"slug": "technova"})
    if existing:
        return
    company_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.companies.insert_one({
        "id": company_id,
        "slug": "technova",
        "name": "TechNova",
        "created_at": now,
    })
    await db.settings.insert_one({
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "assistant_name": "Nova",
        "language": "en",
        "personality": "professional",
    })

    # Users: 1 admin + 4 employees (all have login credentials)
    users = [
        {"email": "admin@technova.com", "name": "Admin", "role": "admin", "password": "admin123"},
        {"email": "sarah@technova.com", "name": "Sarah Ahmed", "role": "employee", "password": "employee123"},
        {"email": "ahmed@technova.com", "name": "Ahmed Ali", "role": "employee", "password": "employee123"},
        {"email": "nora@technova.com", "name": "Nora Hassan", "role": "employee", "password": "employee123"},
        {"email": "khalid@technova.com", "name": "Khalid Omar", "role": "employee", "password": "employee123"},
    ]
    for u in users:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": u["email"],
            "name": u["name"],
            "role": u["role"],
            "company_id": company_id,
            "password_hash": hash_password(u["password"]),
            "created_at": now,
        })

    # Employees directory
    employees = [
        {"name": "Sarah Ahmed", "department": "HR", "position": "HR Manager", "email": "sarah@technova.com"},
        {"name": "Ahmed Ali", "department": "IT", "position": "Software Engineer", "email": "ahmed@technova.com"},
        {"name": "Nora Hassan", "department": "Marketing", "position": "Marketing Specialist", "email": "nora@technova.com"},
        {"name": "Khalid Omar", "department": "Security", "position": "Cybersecurity Manager", "email": "khalid@technova.com"},
    ]
    for e in employees:
        await db.employees.insert_one({"id": str(uuid.uuid4()), "company_id": company_id, **e, "created_at": now})

    # Documents (as extracted text)
    docs = [
        {
            "filename": "employees.csv",
            "file_type": "csv",
            "content": "name,department,position,email\nSarah Ahmed,HR,HR Manager,sarah@technova.com\nAhmed Ali,IT,Software Engineer,ahmed@technova.com\nNora Hassan,Marketing,Marketing Specialist,nora@technova.com\nKhalid Omar,Security,Cybersecurity Manager,khalid@technova.com",
        },
        {
            "filename": "remote_work_policy.pdf",
            "file_type": "pdf",
            "content": "TechNova Remote Work Policy\n\nEmployees may work remotely up to 3 days per week with manager approval. Core hours are 10 AM - 3 PM local time. Employees must maintain reliable internet and a dedicated workspace. All remote workers must attend the weekly Monday standup in person or via video. Requests for full-remote arrangements must be approved by HR (Sarah Ahmed).",
        },
        {
            "filename": "leave_policy.pdf",
            "file_type": "pdf",
            "content": "TechNova Leave Policy\n\nAnnual leave: 21 working days per year. Sick leave: 10 days per year (medical certificate required after 2 consecutive days). Parental leave: 12 weeks paid. Public holidays follow the local calendar. Leave requests must be submitted at least 7 days in advance via HR portal to Sarah Ahmed.",
        },
        {
            "filename": "it_security_guidelines.pdf",
            "file_type": "pdf",
            "content": "TechNova IT Security Guidelines\n\nAll employees must use strong passwords (min 12 chars, mixed case, numbers, symbols) and enable MFA on all corporate accounts. Do not share credentials. Report phishing attempts to security@technova.com. Company laptops must be locked when unattended. Report incidents to Khalid Omar, Cybersecurity Manager. VPN required for remote access to internal systems.",
        },
    ]
    for d in docs:
        await db.documents.insert_one({
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "filename": d["filename"],
            "file_type": d["file_type"],
            "content": d["content"],
            "size": len(d["content"]),
            "uploaded_at": now,
        })

    logger.info("Seeded TechNova demo data")


# ---------------- Auth Routes ----------------
@api.post("/auth/login", response_model=TokenResponse)
async def login(payload: LoginRequest):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    token = create_token(user["id"])
    return TokenResponse(access_token=token, user=user_to_out(user))


@api.get("/auth/me", response_model=UserOut)
async def me(user=Depends(get_current_user)):
    return user_to_out(user)


# ---------------- Company / Settings ----------------
@api.get("/settings")
async def get_settings(user=Depends(get_current_user)):
    s = await db.settings.find_one({"company_id": user["company_id"]}, {"_id": 0})
    return s


@api.put("/settings")
async def update_settings(payload: SettingsPayload, user=Depends(require_admin)):
    await db.settings.update_one(
        {"company_id": user["company_id"]},
        {"$set": payload.model_dump()},
    )
    return await db.settings.find_one({"company_id": user["company_id"]}, {"_id": 0})


# ---------------- Employees ----------------
@api.get("/employees")
async def list_employees(user=Depends(get_current_user)):
    docs = await db.employees.find({"company_id": user["company_id"]}, {"_id": 0}).to_list(1000)
    return docs


@api.post("/employees")
async def add_employee(payload: EmployeeIn, user=Depends(require_admin)):
    doc = {
        "id": str(uuid.uuid4()),
        "company_id": user["company_id"],
        **payload.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.employees.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/employees/{emp_id}")
async def delete_employee(emp_id: str, user=Depends(require_admin)):
    await db.employees.delete_one({"id": emp_id, "company_id": user["company_id"]})
    return {"ok": True}


# ---------------- Documents ----------------
def extract_pdf(data: bytes) -> str:
    reader = pypdf.PdfReader(io.BytesIO(data))
    return "\n".join((p.extract_text() or "") for p in reader.pages)


@api.get("/documents")
async def list_documents(user=Depends(get_current_user)):
    docs = await db.documents.find(
        {"company_id": user["company_id"]},
        {"_id": 0, "content": 0},
    ).to_list(1000)
    return docs


@api.post("/documents/upload")
async def upload_document(file: UploadFile = File(...), user=Depends(require_admin)):
    data = await file.read()
    filename = file.filename or "file"
    ext = filename.split(".")[-1].lower()
    if ext == "pdf":
        try:
            content = extract_pdf(data)
        except Exception as e:
            raise HTTPException(400, f"Failed to parse PDF: {e}")
        file_type = "pdf"
    elif ext == "csv":
        content = data.decode("utf-8", errors="ignore")
        file_type = "csv"
        # Auto-import employees from CSV
        try:
            reader = csv.DictReader(io.StringIO(content))
            now = datetime.now(timezone.utc).isoformat()
            for row in reader:
                # normalize keys
                row_l = {k.strip().lower(): (v.strip() if isinstance(v, str) else v) for k, v in row.items() if k}
                if not row_l.get("email"):
                    continue
                await db.employees.update_one(
                    {"company_id": user["company_id"], "email": row_l["email"]},
                    {"$set": {
                        "id": str(uuid.uuid4()),
                        "company_id": user["company_id"],
                        "name": row_l.get("name", ""),
                        "department": row_l.get("department", ""),
                        "position": row_l.get("position", ""),
                        "email": row_l["email"],
                        "created_at": now,
                    }},
                    upsert=True,
                )
        except Exception as e:
            logger.warning(f"CSV employee import warning: {e}")
    else:
        raise HTTPException(400, "Only PDF and CSV files are supported")

    doc = {
        "id": str(uuid.uuid4()),
        "company_id": user["company_id"],
        "filename": filename,
        "file_type": file_type,
        "content": content,
        "size": len(data),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.documents.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("content", None)
    return doc


@api.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user=Depends(require_admin)):
    await db.documents.delete_one({"id": doc_id, "company_id": user["company_id"]})
    return {"ok": True}


# ---------------- Chat ----------------
async def build_context(company_id: str) -> str:
    employees = await db.employees.find({"company_id": company_id}, {"_id": 0, "company_id": 0}).to_list(500)
    documents = await db.documents.find({"company_id": company_id}, {"_id": 0}).to_list(200)

    parts = ["=== EMPLOYEE DIRECTORY ==="]
    for e in employees:
        parts.append(f"- {e.get('name')} — {e.get('position')} — {e.get('department')} — {e.get('email')}")
    parts.append("")
    for d in documents:
        parts.append(f"=== DOCUMENT: {d['filename']} ===")
        content = d.get("content", "")[:6000]
        parts.append(content)
        parts.append("")
    return "\n".join(parts)


def build_system_prompt(assistant_name: str, language: str, personality: str) -> str:
    lang_instr = "Respond in English." if language == "en" else "أجب باللغة العربية."
    tone = "Warm, friendly, and conversational." if personality == "friendly" else "Concise, professional, and precise."
    return (
        f"You are {assistant_name}, a private AI assistant for the company. "
        f"Tone: {tone}\n{lang_instr}\n\n"
        "You have access to the company's employee directory and internal policy documents (provided as CONTEXT).\n"
        "Answer questions ONLY using the CONTEXT below. If information is not in the context, say you don't have that information.\n"
        "ALWAYS end your response with a 'Source:' line listing the file name(s) you used (e.g. Source: employees.csv, leave_policy.pdf).\n"
        "Keep answers short, structured, and use bullet points or bold labels when helpful."
    )


@api.get("/conversations")
async def list_conversations(user=Depends(get_current_user)):
    convs = await db.conversations.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("updated_at", -1).to_list(100)
    return convs


@api.get("/conversations/{conv_id}/messages")
async def get_messages(conv_id: str, user=Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": conv_id, "user_id": user["id"]})
    if not conv:
        raise HTTPException(404, "Not found")
    msgs = await db.messages.find({"conversation_id": conv_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return msgs


@api.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: str, user=Depends(get_current_user)):
    await db.conversations.delete_one({"id": conv_id, "user_id": user["id"]})
    await db.messages.delete_many({"conversation_id": conv_id})
    return {"ok": True}


@api.post("/chat/stream")
async def chat_stream(payload: ChatRequest, user=Depends(get_current_user)):
    settings = await db.settings.find_one({"company_id": user["company_id"]}) or {}
    assistant_name = settings.get("assistant_name", "WorkMate")
    language = settings.get("language", "en")
    personality = settings.get("personality", "professional")

    # Get or create conversation
    conv_id = payload.conversation_id
    now = datetime.now(timezone.utc).isoformat()
    if not conv_id:
        conv_id = str(uuid.uuid4())
        title = payload.message[:60]
        await db.conversations.insert_one({
            "id": conv_id,
            "user_id": user["id"],
            "company_id": user["company_id"],
            "title": title,
            "created_at": now,
            "updated_at": now,
        })
    else:
        await db.conversations.update_one({"id": conv_id}, {"$set": {"updated_at": now}})

    # Save user message
    await db.messages.insert_one({
        "id": str(uuid.uuid4()),
        "conversation_id": conv_id,
        "role": "user",
        "content": payload.message,
        "created_at": now,
    })

    context = await build_context(user["company_id"])
    system_prompt = build_system_prompt(assistant_name, language, personality) + "\n\nCONTEXT:\n" + context

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=conv_id,
        system_message=system_prompt,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    async def event_gen():
        # Emit conv id first
        yield f"data: {json.dumps({'type': 'meta', 'conversation_id': conv_id})}\n\n"
        full = []
        try:
            async for ev in chat.stream_message(UserMessage(text=payload.message)):
                if isinstance(ev, TextDelta):
                    full.append(ev.content)
                    yield f"data: {json.dumps({'type': 'delta', 'content': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:
            logger.exception("LLM error")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

        assistant_text = "".join(full)
        await db.messages.insert_one({
            "id": str(uuid.uuid4()),
            "conversation_id": conv_id,
            "role": "assistant",
            "content": assistant_text,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------- Automations (placeholder) ----------------
@api.get("/automations")
async def get_automations(user=Depends(get_current_user)):
    return [
        {"id": "leave-request", "name": "Leave Request Automation", "description": "Auto-route leave requests to HR via n8n workflow.", "status": "ready", "icon": "calendar"},
        {"id": "it-support", "name": "IT Support Ticket Automation", "description": "Create Jira tickets from Slack messages automatically.", "status": "ready", "icon": "life-buoy"},
    ]


@api.get("/stats")
async def stats(user=Depends(require_admin)):
    emp = await db.employees.count_documents({"company_id": user["company_id"]})
    docs = await db.documents.count_documents({"company_id": user["company_id"]})
    convs = await db.conversations.count_documents({"company_id": user["company_id"]})
    msgs_agg = await db.messages.count_documents({})
    return {"employees": emp, "documents": docs, "conversations": convs, "messages": msgs_agg}


@api.get("/")
async def root():
    return {"service": "WorkMate AI", "status": "ok"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await seed_technova()


@app.on_event("shutdown")
async def shutdown():
    client.close()
