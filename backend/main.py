import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from database import init_db

# ── Startup guard: encryption key check ──────────────────────────────────────
# Store key validation result as module-level state so the health endpoint
# can surface it to the UI without crashing the server.
_ENCRYPTION_ERROR: str | None = None

def _validate_encryption_key():
    global _ENCRYPTION_ERROR
    import os
    raw = os.getenv("ENCRYPTION_SECRET_KEY", "").strip()
    if not raw:
        _ENCRYPTION_ERROR = (
            "ENCRYPTION_SECRET_KEY is not set. "
            "All stored credentials are encrypted and cannot be read. "
            "Generate a key with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\" "
            "and add it to your .env or docker run -e ENCRYPTION_SECRET_KEY=<key>."
        )
        return
    try:
        from cryptography.fernet import Fernet
        Fernet(raw.encode())
    except Exception as e:
        _ENCRYPTION_ERROR = (
            f"ENCRYPTION_SECRET_KEY is set but is not a valid Fernet key: {e}. "
            "Generate a fresh key with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )

_validate_encryption_key()

# Initialize/Verify database tables on startup
init_db()

from routers.auth import router as auth_router
from routers.tenants import router as tenants_router
from routers.skills import router as skills_router
from routers.apps import router as apps_router
from routers.logs import router as logs_router
from routers.system import router as system_router
from routers.files import router as files_router
from routers.chat import router as chat_router
from routers.mcp import router as mcp_router
from routers.user_data import router as user_data_router
from routers.generator import router as generator_router

app = FastAPI(
    title="Skill Manager Enterprise Server",
    description="Enterprise server for running custom skills and tools for chatbots without OpenAI Agents SDK",
    version="1.0.0"
)

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(tenants_router, prefix="/api/v1/tenant", tags=["tenants"])
app.include_router(skills_router, prefix="/api/v1/skills", tags=["skills"])
app.include_router(apps_router, prefix="/api/v1/apps", tags=["apps"])
app.include_router(logs_router, prefix="/api/v1/logs", tags=["logs"])
app.include_router(system_router, prefix="/api/v1", tags=["system"])
app.include_router(files_router, prefix="/api/v1/files", tags=["files"])
app.include_router(chat_router, prefix="/api/v1", tags=["chat"])
app.include_router(mcp_router, prefix="/api/v1/mcp_servers", tags=["mcp"])
app.include_router(user_data_router, prefix="/api/v1/user_data_templates", tags=["user_data"])
app.include_router(generator_router, prefix="/api/v1/generator", tags=["generator"])

# Mount static files & SPA Fallback for clean HTML5 paths (/playground, /apps, /skills, etc.)
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.exists(frontend_dist):
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="static_assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        target = os.path.join(frontend_dist, full_path)
        if os.path.isfile(target):
            return FileResponse(target)
        return FileResponse(os.path.join(frontend_dist, "index.html"))
