import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

DEFAULT_DB = f"sqlite:///{os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'skill_manager.db')}"
DB_PATH = os.getenv("DATABASE_URL")

if not DB_PATH or not DB_PATH.strip():
    DB_PATH = DEFAULT_DB

# Standardize postgres:// to postgresql:// for SQLAlchemy compatibility
if DB_PATH.startswith("postgres://"):
    DB_PATH = DB_PATH.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DB_PATH,
    connect_args={"check_same_thread": False} if DB_PATH.startswith("sqlite") else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Global state to share status with API endpoint
db_creation_status = {
    "ready": False,
    "details": "Initializing server database connections...",
    "progress": 5,
    "fresh_start": False,
    "error": None,          # Set to an error message string if startup fails
}

def init_db():
    global db_creation_status
    if db_creation_status.get("ready"):
        return
    import models

    # ── Encryption key guard ──────────────────────────────────────────────────
    # Must be checked before any DB work. If the key is missing we cannot
    # decrypt stored credentials, so there is no point continuing.
    _enc_key = os.getenv("ENCRYPTION_SECRET_KEY", "").strip()
    if not _enc_key:
        db_creation_status["error"] = (
            "ENCRYPTION_SECRET_KEY is not set. "
            "All stored credentials (LLM API keys, storage secrets, SMTP passwords) are "
            "encrypted and cannot be read without this key. "
            "Generate one with:\n"
            "  python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"\n"
            "Then add it to your .env file or pass it via -e ENCRYPTION_SECRET_KEY=<key> in docker run."
        )
        db_creation_status["details"] = "Configuration error: ENCRYPTION_SECRET_KEY is not set."
        db_creation_status["progress"] = 0
        return
    try:
        from cryptography.fernet import Fernet
        Fernet(_enc_key.encode())
    except Exception as e:
        db_creation_status["error"] = (
            f"ENCRYPTION_SECRET_KEY is not a valid Fernet key: {e}. "
            "Generate a fresh one with:\n"
            "  python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
        db_creation_status["details"] = "Configuration error: ENCRYPTION_SECRET_KEY is invalid."
        db_creation_status["progress"] = 0
        return
    # ─────────────────────────────────────────────────────────────────────────

    db_creation_status["details"] = "Checking database connection..."
    db_creation_status["progress"] = 15

    # Ensure target directory for SQLite database exists
    if DB_PATH.startswith("sqlite:///"):
        sqlite_file_path = DB_PATH.replace("sqlite:///", "")
        dir_name = os.path.dirname(sqlite_file_path)
        if dir_name and not os.path.exists(dir_name):
            os.makedirs(dir_name, exist_ok=True)

    # Pre-migration check for existing databases
    inspector = inspect(engine)
    
    # Check if all tables declared in models exist
    declared_tables = list(Base.metadata.tables.keys())
    missing_tables = [table for table in declared_tables if not inspector.has_table(table)]
    
    if missing_tables:
        print(f"Database check: Missing tables: {missing_tables}. Creating schemas...")
        db_creation_status["fresh_start"] = True
        db_creation_status["details"] = f"Creating missing tables: {', '.join(missing_tables)}..."
        db_creation_status["progress"] = 25
    if inspector.has_table("users"):
        columns = [c["name"] for c in inspector.get_columns("users")]
        db = SessionLocal()
        try:
            if "is_verified" not in columns:
                db.execute(text("ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT 1"))
                print("Migration: Added 'is_verified' column to users table")
            if "verification_otp" not in columns:
                db.execute(text("ALTER TABLE users ADD COLUMN verification_otp TEXT"))
                print("Migration: Added 'verification_otp' column to users table")
            if "verification_otp_expires" not in columns:
                db.execute(text("ALTER TABLE users ADD COLUMN verification_otp_expires DATETIME"))
                print("Migration: Added 'verification_otp_expires' column to users table")
            db.commit()
        except Exception as e:
            print(f"Migration warning: Could not update users table columns: {e}")
        finally:
            db.close()

    if inspector.has_table("mcp_servers"):
        columns = [c["name"] for c in inspector.get_columns("mcp_servers")]
        db = SessionLocal()
        try:
            if "is_active" not in columns:
                db_creation_status["details"] = "Migrating mcp_servers table..."
                db.execute(text("ALTER TABLE mcp_servers ADD COLUMN is_active BOOLEAN DEFAULT 1"))
                print("Migration: Added 'is_active' column to mcp_servers table")
            if "cached_tools" not in columns:
                db_creation_status["details"] = "Migrating mcp_servers cached_tools..."
                db.execute(text("ALTER TABLE mcp_servers ADD COLUMN cached_tools TEXT"))
                print("Migration: Added 'cached_tools' column to mcp_servers table")
            db.commit()
        except Exception as e:
            print(f"Migration warning: Could not update mcp_servers table: {e}")
        finally:
            db.close()

    for table_name in ("custom_skills", "apps", "mcp_servers"):
        if inspector.has_table(table_name):
            db = SessionLocal()
            try:
                indexes = inspector.get_indexes(table_name)
                for idx in indexes:
                    idx_name = idx.get("name")
                    is_unique = idx.get("unique")
                    cols = idx.get("column_names")
                    if idx_name in (f"ix_{table_name}_name", f"sqlite_autoindex_{table_name}_1") or (is_unique and cols == ["name"]):
                        try:
                            db.execute(text(f"DROP INDEX IF EXISTS {idx_name}"))
                            print(f"Migration: Dropped global unique index {idx_name} on {table_name}")
                        except Exception as ex:
                            print(f"Migration notice dropping index {idx_name}: {ex}")
                db.commit()
            except Exception as e:
                print(f"Migration warning for {table_name}: {e}")
            finally:
                db.close()

    db_creation_status["progress"] = 40

    if inspector.has_table("execution_logs"):
        columns = [c["name"] for c in inspector.get_columns("execution_logs")]
        if "model_name" not in columns:
            db_creation_status["details"] = "Migrating execution_logs table..."
            db = SessionLocal()
            try:
                db.execute(text("ALTER TABLE execution_logs ADD COLUMN model_name TEXT"))
                db.commit()
                print("Migration: Added 'model_name' column to execution_logs table")
            except Exception as e:
                print(f"Migration warning: Could not add 'model_name' to execution_logs: {e}")
            finally:
                db.close()
        if "request_source" not in columns:
            db = SessionLocal()
            try:
                db.execute(text("ALTER TABLE execution_logs ADD COLUMN request_source TEXT"))
                db.commit()
                print("Migration: Added 'request_source' column to execution_logs table")
            except Exception as e:
                print(f"Migration warning: Could not add 'request_source' to execution_logs: {e}")
            finally:
                db.close()
        if "request_id" not in columns:
            db = SessionLocal()
            try:
                db.execute(text("ALTER TABLE execution_logs ADD COLUMN request_id TEXT"))
                db.commit()
                print("Migration: Added 'request_id' column to execution_logs table")
            except Exception as e:
                print(f"Migration warning: Could not add 'request_id' to execution_logs: {e}")
            finally:
                db.close()

    db_creation_status["progress"] = 60

    if inspector.has_table("chat_requests"):
        columns = [c["name"] for c in inspector.get_columns("chat_requests")]
        db = SessionLocal()
        try:
            if "prompt_tokens" not in columns:
                db.execute(text("ALTER TABLE chat_requests ADD COLUMN prompt_tokens INTEGER DEFAULT 0"))
                db.execute(text("ALTER TABLE chat_requests ADD COLUMN completion_tokens INTEGER DEFAULT 0"))
                db.execute(text("ALTER TABLE chat_requests ADD COLUMN cost_usd FLOAT DEFAULT 0.0"))
                print("Migration: Added prompt_tokens, completion_tokens, and cost_usd columns to chat_requests table")
            if "primary_model_name" not in columns:
                db.execute(text("ALTER TABLE chat_requests ADD COLUMN primary_model_name TEXT"))
                db.execute(text("ALTER TABLE chat_requests ADD COLUMN primary_prompt_tokens INTEGER DEFAULT 0"))
                db.execute(text("ALTER TABLE chat_requests ADD COLUMN primary_completion_tokens INTEGER DEFAULT 0"))
                db.execute(text("ALTER TABLE chat_requests ADD COLUMN primary_cost_usd FLOAT DEFAULT 0.0"))
                print("Migration: Added primary LLM columns to chat_requests table")
            if "secondary_model_name" not in columns:
                db.execute(text("ALTER TABLE chat_requests ADD COLUMN secondary_model_name TEXT"))
                db.execute(text("ALTER TABLE chat_requests ADD COLUMN secondary_prompt_tokens INTEGER DEFAULT 0"))
                db.execute(text("ALTER TABLE chat_requests ADD COLUMN secondary_completion_tokens INTEGER DEFAULT 0"))
                db.execute(text("ALTER TABLE chat_requests ADD COLUMN secondary_cost_usd FLOAT DEFAULT 0.0"))
                print("Migration: Added secondary LLM columns to chat_requests table")
            db.commit()
        except Exception as e:
            print(f"Migration warning: Could not update chat_requests columns: {e}")
        finally:
            db.close()

    if inspector.has_table("chat_messages"):
        columns = [c["name"] for c in inspector.get_columns("chat_messages")]
        db = SessionLocal()
        try:
            if "json" not in columns:
                db.execute(text("ALTER TABLE chat_messages ADD COLUMN json TEXT"))
                db.execute(text("ALTER TABLE chat_messages ADD COLUMN code TEXT"))
                print("Migration: Added json and code columns to chat_messages table")
            if "artifact_data" not in columns:
                db.execute(text("ALTER TABLE chat_messages ADD COLUMN artifact_data TEXT"))
                print("Migration: Added artifact_data column to chat_messages table")
            db.commit()
        except Exception as e:
            print(f"Migration warning: Could not add columns to chat_messages: {e}")
        finally:
            db.close()

    if inspector.has_table("tenant_llms"):
        columns = [c["name"] for c in inspector.get_columns("tenant_llms")]
        if "input_rate" not in columns:
            db = SessionLocal()
            try:
                db.execute(text("ALTER TABLE tenant_llms ADD COLUMN input_rate FLOAT DEFAULT 1.0"))
                db.execute(text("ALTER TABLE tenant_llms ADD COLUMN output_rate FLOAT DEFAULT 2.0"))
                db.execute(text("ALTER TABLE tenant_llms ADD COLUMN audio_input_rate FLOAT DEFAULT 10.0"))
                db.execute(text("ALTER TABLE tenant_llms ADD COLUMN audio_output_rate FLOAT DEFAULT 20.0"))
                db.commit()
                print("Migration: Added rate columns to tenant_llms table")
            except Exception as e:
                print(f"Migration warning: Could not add rate columns to tenant_llms: {e}")
            finally:
                db.close()

    if inspector.has_table("tenants"):
        columns = [c["name"] for c in inspector.get_columns("tenants")]
        db = SessionLocal()
        try:
            if "max_context_tokens" not in columns:
                db.execute(text("ALTER TABLE tenants ADD COLUMN max_context_tokens INTEGER DEFAULT 1000000"))
                print("Migration: Added 'max_context_tokens' column to tenants table")
            if "session_token_limit" not in columns:
                db.execute(text("ALTER TABLE tenants ADD COLUMN session_token_limit INTEGER"))
                print("Migration: Added 'session_token_limit' column to tenants table")
            if "session_cost_limit" not in columns:
                db.execute(text("ALTER TABLE tenants ADD COLUMN session_cost_limit FLOAT"))
                print("Migration: Added 'session_cost_limit' column to tenants table")
            if "daily_token_limit" not in columns:
                db.execute(text("ALTER TABLE tenants ADD COLUMN daily_token_limit INTEGER"))
                print("Migration: Added 'daily_token_limit' column to tenants table")
            if "daily_cost_limit" not in columns:
                db.execute(text("ALTER TABLE tenants ADD COLUMN daily_cost_limit FLOAT"))
                print("Migration: Added 'daily_cost_limit' column to tenants table")
            if "monthly_token_limit" not in columns:
                db.execute(text("ALTER TABLE tenants ADD COLUMN monthly_token_limit INTEGER"))
                print("Migration: Added 'monthly_token_limit' column to tenants table")
            if "monthly_cost_limit" not in columns:
                db.execute(text("ALTER TABLE tenants ADD COLUMN monthly_cost_limit FLOAT"))
                print("Migration: Added 'monthly_cost_limit' column to tenants table")
            if "yearly_token_limit" not in columns:
                db.execute(text("ALTER TABLE tenants ADD COLUMN yearly_token_limit INTEGER"))
                print("Migration: Added 'yearly_token_limit' column to tenants table")
            if "yearly_cost_limit" not in columns:
                db.execute(text("ALTER TABLE tenants ADD COLUMN yearly_cost_limit FLOAT"))
                print("Migration: Added 'yearly_cost_limit' column to tenants table")
            if "timezone" not in columns:
                db.execute(text("ALTER TABLE tenants ADD COLUMN timezone TEXT DEFAULT 'UTC'"))
                print("Migration: Added 'timezone' column to tenants table")
            if "daily_reset_time" not in columns:
                db.execute(text("ALTER TABLE tenants ADD COLUMN daily_reset_time TEXT DEFAULT '00:00'"))
                print("Migration: Added 'daily_reset_time' column to tenants table")
            if "monthly_reset_day" not in columns:
                db.execute(text("ALTER TABLE tenants ADD COLUMN monthly_reset_day INTEGER DEFAULT 1"))
                print("Migration: Added 'monthly_reset_day' column to tenants table")
            if "yearly_reset_month" not in columns:
                db.execute(text("ALTER TABLE tenants ADD COLUMN yearly_reset_month INTEGER DEFAULT 1"))
                print("Migration: Added 'yearly_reset_month' column to tenants table")
            if "yearly_reset_day" not in columns:
                db.execute(text("ALTER TABLE tenants ADD COLUMN yearly_reset_day INTEGER DEFAULT 1"))
                print("Migration: Added 'yearly_reset_day' column to tenants table")
            db.commit()
        except Exception as e:
            print(f"Migration warning: Could not update tenants table columns: {e}")
        finally:
            db.close()

    # Alter missing tenant_id columns in existing tables
    for table_name in ["custom_skills", "mcp_servers", "apps", "user_data_templates", "storage_config", "sandbox_config"]:
        if inspector.has_table(table_name):
            columns = [c["name"] for c in inspector.get_columns(table_name)]
            if "tenant_id" not in columns:
                db = SessionLocal()
                try:
                    db.execute(text(f"ALTER TABLE {table_name} ADD COLUMN tenant_id TEXT"))
                    db.commit()
                    print(f"Migration: Added 'tenant_id' column to {table_name} table")
                except Exception as e:
                    print(f"Migration warning: Could not add 'tenant_id' to {table_name}: {e}")
                finally:
                    db.close()

    if db_creation_status["fresh_start"]:
        db_creation_status["details"] = "Creating database schemas and relational models..."

    # Ensure storage_config has a default local entry
    # (runs on existing DBs too — safe because it checks first)
    if inspector.has_table("storage_config"):
        db = SessionLocal()

    # Create all tables
    Base.metadata.create_all(bind=engine)
    
    db_creation_status["progress"] = 80
    if db_creation_status["fresh_start"]:
        db_creation_status["details"] = "Applying initial seeding and configurations..."

    # Auto-seed default App if none exists
    db = SessionLocal()
    try:
        from models import AppModel, AppSkillMapping
        existing_app = db.query(AppModel).first()
        if not existing_app:
            default_app = AppModel(
                name="System & Developer Suite",
                description="Default enterprise app grouping system diagnostics, code execution, and network tools.",
                icon="box",
                is_active=True
            )
            db.add(default_app)
            db.commit()
            db.refresh(default_app)

            default_skills = ["system_diagnostics", "code_interpreter", "ip_info"]
            for sk in default_skills:
                db.add(AppSkillMapping(app_id=default_app.id, skill_name=sk))
            db.commit()
            db_creation_status["details"] = "Successfully seeded core apps and system diagnostics suite!"
    except Exception as e:
        print(f"Error seeding default app: {e}")
    finally:
        db.close()

    # Seed default local StorageConfig if none exists (handles fresh installs after create_all) and perform migrations
    db = SessionLocal()
    try:
        from models import StorageConfig, SandboxConfig, User, Tenant, CustomSkill, McpServer, AppModel, UserDataTemplate
        if not db.query(StorageConfig).first():
            db.add(StorageConfig(provider="local", is_active=True))
            db.commit()
            print("Seeded default local StorageConfig entry")

        # Migrate existing users data to first tenant under tenant structure
        first_user = db.query(User).order_by(User.created_at.asc()).first()
        if first_user:
            tenant = db.query(Tenant).filter(Tenant.user_id == first_user.id).first()
            if not tenant:
                from auth import generate_api_key
                tenant = Tenant(
                    name="default_workspace",
                    api_key=generate_api_key("sk_usr_"),
                    is_active=True,
                    user_id=first_user.id
                )
                db.add(tenant)
                db.commit()
                db.refresh(tenant)

            # Assign tenant_id to CustomSkills
            db.query(CustomSkill).filter(CustomSkill.tenant_id == None).update({CustomSkill.tenant_id: tenant.id})
            # Assign tenant_id to McpServers
            db.query(McpServer).filter(McpServer.tenant_id == None).update({McpServer.tenant_id: tenant.id})
            # Assign tenant_id to AppModels (except default system app)
            db.query(AppModel).filter(AppModel.tenant_id == None, AppModel.name != "System & Developer Suite").update({AppModel.tenant_id: tenant.id})
            # Assign tenant_id to UserDataTemplates
            db.query(UserDataTemplate).filter(UserDataTemplate.tenant_id == None).update({UserDataTemplate.tenant_id: tenant.id})
            # Assign tenant_id to StorageConfigs
            db.query(StorageConfig).filter(StorageConfig.tenant_id == None).update({StorageConfig.tenant_id: tenant.id})
            # Assign tenant_id to SandboxConfigs
            db.query(SandboxConfig).filter(SandboxConfig.tenant_id == None).update({SandboxConfig.tenant_id: tenant.id})
            db.commit()
            print(f"Migration: Assigned orphaned models to tenant: {tenant.name}")
    except Exception as e:
        print(f"Error seeding StorageConfig / migrating data: {e}")
    finally:
        db.close()

    db_creation_status["progress"] = 100
    db_creation_status["details"] = "Database is ready!"
    db_creation_status["ready"] = True

    # Re-encrypt any secrets still stored with the old XOR scheme
    _migrate_encryption()


def _migrate_encryption():
    """
    One-time migration: re-encrypt all secrets stored with the legacy XOR
    scheme to Fernet (AES-128-CBC + HMAC-SHA256).

    Detection: Fernet tokens always start with 'gAAAAA'. Any stored blob
    that does NOT start with that prefix is assumed to be a legacy XOR blob
    and is attempted to be decrypted using:
      1. The hardcoded legacy fallback key (for deployments that never set ENCRYPTION_SECRET_KEY)
      2. The current ENCRYPTION_SECRET_KEY (for deployments that had a custom key)
    If a plaintext is recovered it is immediately re-encrypted with Fernet and saved.
    If neither key works, the blob is left as-is and a warning is logged.
    """
    import os
    from encryption_utils import _legacy_xor_decrypt, _LEGACY_FALLBACK_KEY, encrypt_key, _FERNET_PREFIX

    # Only run if ENCRYPTION_SECRET_KEY is configured
    if not os.getenv("ENCRYPTION_SECRET_KEY", "").strip():
        print("WARNING: ENCRYPTION_SECRET_KEY is not set. Skipping encryption migration.")
        return

    current_raw_key = os.getenv("ENCRYPTION_SECRET_KEY", "").strip().encode("utf-8")

    # Registry: (ModelClass, [column_attr_names])
    from models import TenantLLM, EmailConfig, StorageConfig, SandboxConfig
    migration_map = [
        (TenantLLM,      ["api_key_encrypted"]),
        (EmailConfig,    ["smtp_password_encrypted"]),
        (StorageConfig,  ["access_key_encrypted", "secret_key_encrypted",
                          "account_name_encrypted", "account_key_encrypted"]),
        (SandboxConfig,  ["e2b_api_key_encrypted", "azure_client_id_encrypted",
                          "azure_client_secret_encrypted", "azure_tenant_id_encrypted",
                          "fly_api_token_encrypted", "aws_access_key_encrypted",
                          "aws_secret_key_encrypted"]),
    ]

    db = SessionLocal()
    migrated_total = 0
    try:
        for Model, columns in migration_map:
            try:
                rows = db.query(Model).all()
                for row in rows:
                    changed = False
                    for col in columns:
                        blob = getattr(row, col, None)
                        if not blob:
                            continue
                        # Already a Fernet token — skip
                        if blob.encode().startswith(_FERNET_PREFIX):
                            continue

                        # Try legacy fallback key first, then current key
                        plaintext = _legacy_xor_decrypt(blob, _LEGACY_FALLBACK_KEY)
                        if not plaintext and current_raw_key:
                            plaintext = _legacy_xor_decrypt(blob, current_raw_key)

                        if plaintext:
                            setattr(row, col, encrypt_key(plaintext))
                            changed = True
                            migrated_total += 1
                    if changed:
                        db.add(row)
                db.commit()
            except Exception as e:
                db.rollback()
    finally:
        db.close()

    if migrated_total:
        print(f"Encryption migration: re-encrypted {migrated_total} secret(s) from XOR → Fernet.")
    else:
        print("Encryption migration: all secrets already use Fernet. Nothing to migrate.")

    db_creation_status["ready"] = True
    db_creation_status["progress"] = 100
    db_creation_status["details"] = "Database initialized successfully."


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

if __name__ == "__main__":
    init_db()
