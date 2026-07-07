from fastapi import FastAPI, BackgroundTasks, HTTPException, UploadFile, File, Depends, Request, Response
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, APIKeyHeader
from typing import List, Optional
from pydantic import BaseModel
import jwt
import datetime
import bcrypt
import logging
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("dmarc_manager")



import sys
import os
import shutil
from pathlib import Path
import datetime

# Ensure project root is in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from backend.dmarc_lib.parser import parse_report
from backend.dmarc_lib.db import (
    init_db, save_report, get_stats, get_reports_list, 
    get_report_detail, delete_reports, get_domain_stats, 
    get_user_profile, update_user_profile, get_user_by_username,
    list_users, create_user, delete_user,
    create_api_key, get_api_keys_for_user, delete_api_key,
    get_user_by_api_key, get_api_key_owner,
    get_setting, set_setting
)
from backend.dmarc_lib.enrichment import batch_enrich_ips
from backend.dmarc_lib.pdf_gen import generate_summary_pdf
from backend.dmarc_lib.alerts import check_for_spikes
from backend.dmarc_lib.email_monitor import (
    configure_email_monitor,
    disable_email_monitor,
    get_email_monitor_status,
    restart_email_monitor,
    run_email_monitor_once,
    start_email_monitor,
    stop_email_monitor,
)
import backend.web.config as config

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    await configure_email_monitor(process_single_file)
    yield
    await stop_email_monitor()

# Rate Limiting
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="DMARC Report Manager", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# CONFIG
UPLOAD_DIR = Path("backend/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

from backend.web import config

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


# Enable CORS for Frontend
# Note: allow_credentials must be False if allow_origins is ["*"]
allow_all = "*" in config.CORS_ALLOWED_ORIGINS
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ALLOWED_ORIGINS,
    allow_credentials=not allow_all,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Total-Count"],
)



# Pydantic models
class UserProfile(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    username: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str

class UserCreate(UserProfile):
    username: str
    password: str
    role: str = "user"

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class ApiKeyCreate(BaseModel):
    name: str  # Label/description for the key

class ApiKeyResponse(BaseModel):
    id: int
    name: str
    created_at: str
    last_used_at: Optional[str] = None
    active: int

class ApiKeyCreatedResponse(BaseModel):
    id: int
    name: str
    key: str  # The raw key - only returned once at creation!


# Auth Helper
async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    api_key: Optional[str] = Depends(api_key_header),
):
    # Check API key first (from X-API-Key header)
    if api_key:
        # Try per-user API keys from database first
        user = get_user_by_api_key(api_key)
        if user:
            return user
        
        # Fallback to legacy shared API key from env var (if configured)
        if config.DMARC_API_KEY and api_key == config.DMARC_API_KEY:
            return {"username": "api", "role": "admin", "id": 0}
        
        # API key provided but not valid
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Fall back to JWT
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, config.SECRET_KEY, algorithms=[config.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = get_user_by_username(username)
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_admin_user(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return current_user

@app.post("/api/login")
@limiter.limit("10/minute")
async def login(req: LoginRequest, request: Request):
    user = get_user_by_username(req.username)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Verify password using bcrypt
    password_bytes = req.password.encode('utf-8')
    password_hash_bytes = user['password_hash'].encode('utf-8')
    
    if not bcrypt.checkpw(password_bytes, password_hash_bytes):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    expires = datetime.datetime.now(datetime.UTC) + datetime.timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode = {"sub": user['username'], "exp": expires, "role": user['role']}
    token = jwt.encode(to_encode, config.SECRET_KEY, algorithm=config.ALGORITHM)
    
    return {
        "access_token": token, 
        "token_type": "bearer",
        "user": {
            "username": user['username'],
            "first_name": user['first_name'],
            "last_name": user['last_name'],
            "role": user['role']
        }
    }

@app.post("/api/refresh")
async def refresh_token(current_user: dict = Depends(get_current_user)):
    expires = datetime.datetime.now(datetime.UTC) + datetime.timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"sub": current_user['username'], "exp": expires, "role": current_user['role']}
    token = jwt.encode(to_encode, config.SECRET_KEY, algorithm=config.ALGORITHM)
    return {"access_token": token, "token_type": "bearer"}

@app.put("/api/user/password")
@limiter.limit("5/minute")
async def change_password(req: PasswordChange, request: Request, current_user: dict = Depends(get_current_user)):
    if not current_user.get('password_hash'):
        raise HTTPException(status_code=400, detail="Password change not supported for API key users")
    if not bcrypt.checkpw(req.current_password.encode('utf-8'), current_user['password_hash'].encode('utf-8')):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    new_hash = bcrypt.hashpw(req.new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    update_user_profile(current_user['id'], {"password_hash": new_hash})
    return {"message": "Password updated successfully"}


# ============================================================================
# API Key Management - User Endpoints
# ============================================================================

@app.post("/api/user/api-keys", response_model=ApiKeyCreatedResponse)
async def create_user_api_key(req: ApiKeyCreate, current_user: dict = Depends(get_current_user)):
    """Create a new API key for the current user. The raw key is only returned once!"""
    if current_user.get('id') == 0:
        raise HTTPException(status_code=400, detail="Cannot create API keys for legacy API user")
    
    key_id, raw_key = create_api_key(current_user['id'], req.name)
    return {"id": key_id, "name": req.name, "key": raw_key}


@app.get("/api/user/api-keys", response_model=List[ApiKeyResponse])
async def list_user_api_keys(current_user: dict = Depends(get_current_user)):
    """List all API keys for the current user (without revealing the actual keys)."""
    if current_user.get('id') == 0:
        return []
    
    return get_api_keys_for_user(current_user['id'])


@app.delete("/api/user/api-keys/{key_id}")
async def revoke_user_api_key(key_id: int, current_user: dict = Depends(get_current_user)):
    """Revoke (delete) an API key belonging to the current user."""
    if current_user.get('id') == 0:
        raise HTTPException(status_code=400, detail="Cannot manage API keys for legacy API user")
    
    deleted = delete_api_key(key_id, user_id=current_user['id'])
    if not deleted:
        raise HTTPException(status_code=404, detail="API key not found or does not belong to you")
    
    return {"message": "API key revoked successfully"}


# ============================================================================
# API Key Management - Admin Endpoints
# ============================================================================

@app.get("/api/users/{user_id}/api-keys", response_model=List[ApiKeyResponse])
async def admin_list_user_api_keys(user_id: int, admin: dict = Depends(get_admin_user)):
    """Admin: List all API keys for a specific user."""
    user = get_user_profile(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return get_api_keys_for_user(user_id)


@app.delete("/api/users/{user_id}/api-keys/{key_id}")
async def admin_revoke_user_api_key(user_id: int, key_id: int, admin: dict = Depends(get_admin_user)):
    """Admin: Revoke (delete) an API key belonging to a specific user."""
    # Verify the key belongs to the specified user
    key_owner = get_api_key_owner(key_id)
    if key_owner is None:
        raise HTTPException(status_code=404, detail="API key not found")
    if key_owner != user_id:
        raise HTTPException(status_code=400, detail="API key does not belong to this user")
    
    delete_api_key(key_id)
    return {"message": "API key revoked successfully"}

@app.get("/")
async def root():
    return {"message": "DMARC Report Manager Backend is running"}


@app.get("/api/version")
async def get_version():
    try:
        with open("version.txt", "r") as f:
            return {"version": f.read().strip()}
    except Exception:
        return {"version": "0.0.0"}


async def process_single_file(file_path: Path):
    try:
        logger.info(f"Processing uploaded file: {file_path}")
        data = parse_report(file_path)
        report_id = save_report(data)
        logger.info(f"Successfully processed {file_path}")
        # Check for alerts
        await check_for_spikes(report_id)
    except Exception as e:
        logger.error(f"Error processing {file_path}: {e}")

def _sanitize_filename(filename: str) -> str:
    safe_name = Path(filename).name
    if not safe_name or safe_name != filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    return safe_name

@app.get("/api/files")
async def list_files(current_user: dict = Depends(get_current_user)):
    files = []
    for f in UPLOAD_DIR.glob("*"):
        if f.is_file():
            stat = f.stat()
            files.append({
                "name": f.name,
                "size": stat.st_size,
                "created": datetime.datetime.fromtimestamp(stat.st_ctime).isoformat(),
                "processed": True # TODO: track processed state in DB or simple check
            })
    # Sort by created desc
    files.sort(key=lambda x: x['created'], reverse=True)
    return files

@app.delete("/api/files/{filename}")
async def delete_file(filename: str, current_user: dict = Depends(get_current_user)):
    safe_name = _sanitize_filename(filename)
    file_path = UPLOAD_DIR / safe_name
    if not file_path.exists():
        raise HTTPException(status_code=404, message="File not found")
    try:
        file_path.unlink()
        return {"message": f"Deleted {safe_name}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stats")
async def stats(start: Optional[int] = None, end: Optional[int] = None, request: Request = None):
    # Check if user is logged in to decide visibility
    user = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        try:
            token = auth_header.split(" ")[1]
            payload = jwt.decode(token, config.SECRET_KEY, algorithms=[config.ALGORITHM])
            user = get_user_by_username(payload.get("sub"))
        except:
            pass

    data = get_stats(start_date=start, end_date=end)
    
    # If not logged in, strip sensitive data
    if not user:
        # User requested: Dashboard should only show the domain if you are logged in, otherwise leave the column out.
        # This applied to recent_activity items.
        if "recent_activity" in data:
            for item in data["recent_activity"]:
                if "domain" in item:
                    del item["domain"]
    
    return data

@app.get("/api/stats/pdf")
async def stats_pdf(start: Optional[int] = None, end: Optional[int] = None, current_user: dict = Depends(get_current_user)):
    data = get_stats(start_date=start, end_date=end)
    
    date_range = "All Time"
    if start and end:
        s = datetime.datetime.fromtimestamp(start).strftime('%Y-%m-%d')
        e = datetime.datetime.fromtimestamp(end).strftime('%Y-%m-%d')
        date_range = f"{s} to {e}"
    elif start:
        s = datetime.datetime.fromtimestamp(start).strftime('%Y-%m-%d')
        date_range = f"Since {s}"
    elif end:
        e = datetime.datetime.fromtimestamp(end).strftime('%Y-%m-%d')
        date_range = f"Until {e}"
        
    pdf_bytes = bytes(generate_summary_pdf(data, date_range))
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=dmarc-summary-{datetime.datetime.now().strftime('%Y%m%d')}.pdf"
        }
    )

@app.get("/api/reports")
async def reports_list(page: int = 1, limit: int = 50, search: Optional[str] = None, domain: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    return get_reports_list(page=page, page_size=limit, search=search, domain=domain)

@app.get("/api/reports/{id}")
async def report_detail(id: str, current_user: dict = Depends(get_current_user)):
    report = get_report_detail(id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Enrichment
    ips = [r['source_ip'] for r in report['records']]
    if ips:
        enrichment = await batch_enrich_ips(ips)
        for r in report['records']:
            r['enrichment'] = enrichment.get(r['source_ip'])
            
    return report

@app.post("/api/upload")
@limiter.limit("20/minute")
async def upload_files(
    request: Request,
    files: List[UploadFile] = File(...),
    background_tasks: BackgroundTasks = None,
    current_user: dict = Depends(get_current_user),
):
    uploaded_files = []
    for file in files:
        safe_name = _sanitize_filename(file.filename)
        file_path = UPLOAD_DIR / safe_name
        try:
            with file_path.open("wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            uploaded_files.append(safe_name)
            if background_tasks:
                background_tasks.add_task(process_single_file, file_path)
            else:
                await process_single_file(file_path)
        except Exception as e:
            return JSONResponse(status_code=500, content={"message": f"Failed to save {safe_name}"})
    return {"message": f"Uploaded {len(uploaded_files)} files", "files": uploaded_files}

@app.post("/api/fetch-email")
async def fetch_email_reports(background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Trigger email fetch and process new reports."""
    result = await run_email_monitor_once()
    if not result["success"]:
        raise HTTPException(status_code=502, detail=result["message"])
    return result

@app.get("/api/email-monitor")
async def email_monitor_status(current_user: dict = Depends(get_current_user)):
    return get_email_monitor_status()

@app.post("/api/email-monitor/run")
async def email_monitor_run_now(current_user: dict = Depends(get_current_user)):
    result = await run_email_monitor_once()
    if not result["success"]:
        raise HTTPException(status_code=502, detail=result["message"])
    return result

@app.post("/api/email-monitor/start")
async def email_monitor_start(admin: dict = Depends(get_admin_user)):
    await start_email_monitor(process_single_file)
    return get_email_monitor_status()

@app.post("/api/email-monitor/stop")
async def email_monitor_stop(admin: dict = Depends(get_admin_user)):
    await disable_email_monitor()
    return get_email_monitor_status()

@app.delete("/api/reports")
async def delete_reports_endpoint(start: Optional[int] = None, end: Optional[int] = None, domain: Optional[str] = None, org_name: Optional[str] = None, days: Optional[int] = None, current_user: dict = Depends(get_current_user)):
    deleted = delete_reports(start_date=start, end_date=end, domain=domain, org_name=org_name, days=days)
    return {"deleted": deleted}

@app.get("/api/domains")
async def domains_list(current_user: dict = Depends(get_current_user)):
    return get_domain_stats()


@app.get("/api/user/profile")
async def user_profile(current_user: dict = Depends(get_current_user)):
    """Get the profile of the current user."""
    return current_user

@app.put("/api/user/profile")
async def update_profile(profile: UserProfile, current_user: dict = Depends(get_current_user)):
    """Update the profile of the current user."""
    success = update_user_profile(current_user['id'], profile.dict())
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update profile")
    return {"message": "Profile updated successfully"}

# User Management (Admin Only)
@app.get("/api/users")
async def get_users(admin: dict = Depends(get_admin_user)):
    return list_users()

@app.post("/api/users")
async def add_user(user: UserCreate, admin: dict = Depends(get_admin_user)):
    new_id = create_user(user.dict())
    if not new_id:
        raise HTTPException(status_code=400, detail="Username or email already exists")
    return {"id": new_id, "message": "User created successfully"}

class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None

@app.put("/api/users/{id}")
async def update_user(id: int, user: UserUpdate, admin: dict = Depends(get_admin_user)):
    updates = {k: v for k, v in user.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "role" in updates and updates["role"] not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")
    success = update_user_profile(id, updates)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User updated successfully"}

@app.delete("/api/users/{id}")
async def remove_user(id: int, admin: dict = Depends(get_admin_user)):
    delete_user(id)
    return {"message": "User deleted successfully"}

class SettingsUpdate(BaseModel):
    slack_webhook_url: Optional[str] = None
    email_protocol: Optional[str] = None
    email_mailbox: Optional[str] = None
    email_only_unread: Optional[bool] = None
    email_delete_after_fetch: Optional[bool] = None
    email_monitor_enabled: Optional[bool] = None
    email_check_interval_minutes: Optional[int] = None
    imap_host: Optional[str] = None
    imap_port: Optional[int] = None
    imap_user: Optional[str] = None
    imap_pass: Optional[str] = None
    imap_use_ssl: Optional[bool] = None

@app.get("/api/settings")
async def get_all_settings(admin: dict = Depends(get_admin_user)):
    return {
        "slack_webhook_url": get_setting("slack_webhook_url", ""),
        "email_protocol": get_setting("email_protocol", "imap"),
        "email_mailbox": get_setting("email_mailbox", "inbox"),
        "email_only_unread": get_setting("email_only_unread", True),
        "email_delete_after_fetch": get_setting("email_delete_after_fetch", False),
        "email_monitor_enabled": get_setting("email_monitor_enabled", False),
        "email_check_interval_minutes": get_setting("email_check_interval_minutes", 60),
        "imap_host": get_setting("imap_host", ""),
        "imap_port": get_setting("imap_port", 993),
        "imap_user": get_setting("imap_user", ""),
        "imap_pass": get_setting("imap_pass", ""),
        "imap_use_ssl": get_setting("imap_use_ssl", True)
    }

@app.put("/api/settings")
async def update_settings(settings: SettingsUpdate, admin: dict = Depends(get_admin_user)):
    changed_fields = settings.model_fields_set
    if settings.slack_webhook_url is not None:
        set_setting("slack_webhook_url", settings.slack_webhook_url)
    if settings.email_protocol is not None:
        protocol = settings.email_protocol.lower()
        if protocol not in ("imap", "pop3"):
            raise HTTPException(status_code=400, detail="email_protocol must be 'imap' or 'pop3'")
        set_setting("email_protocol", protocol)
    if settings.email_mailbox is not None:
        set_setting("email_mailbox", settings.email_mailbox)
    if settings.email_only_unread is not None:
        set_setting("email_only_unread", settings.email_only_unread)
    if settings.email_delete_after_fetch is not None:
        set_setting("email_delete_after_fetch", settings.email_delete_after_fetch)
    if settings.email_monitor_enabled is not None:
        set_setting("email_monitor_enabled", settings.email_monitor_enabled)
    if settings.email_check_interval_minutes is not None:
        if settings.email_check_interval_minutes < 1:
            raise HTTPException(status_code=400, detail="email_check_interval_minutes must be at least 1")
        set_setting("email_check_interval_minutes", settings.email_check_interval_minutes)
    if settings.imap_host is not None:
        set_setting("imap_host", settings.imap_host)
    if settings.imap_port is not None:
        set_setting("imap_port", settings.imap_port)
    if settings.imap_user is not None:
        set_setting("imap_user", settings.imap_user)
    if settings.imap_pass is not None:
        set_setting("imap_pass", settings.imap_pass)
    if settings.imap_use_ssl is not None:
        set_setting("imap_use_ssl", settings.imap_use_ssl)
    if (
        "imap_port" not in changed_fields
        and ("email_protocol" in changed_fields or "imap_use_ssl" in changed_fields)
    ):
        protocol = get_setting("email_protocol", "imap")
        use_ssl = get_setting("imap_use_ssl", True)
        default_port = 995 if protocol == "pop3" and use_ssl else 110 if protocol == "pop3" else 993 if use_ssl else 143
        set_setting("imap_port", default_port)
    await restart_email_monitor()
    return {"message": "Settings updated"}
