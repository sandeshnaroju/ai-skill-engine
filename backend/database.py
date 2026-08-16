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
    "fresh_start": False
}

def init_db():
    global db_creation_status
    import models
    
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
        if "prompt_tokens" not in columns:
            db = SessionLocal()
            try:
                db.execute(text("ALTER TABLE chat_requests ADD COLUMN prompt_tokens INTEGER DEFAULT 0"))
                db.execute(text("ALTER TABLE chat_requests ADD COLUMN completion_tokens INTEGER DEFAULT 0"))
                db.execute(text("ALTER TABLE chat_requests ADD COLUMN cost_usd FLOAT DEFAULT 0.0"))
                db.commit()
                print("Migration: Added prompt_tokens, completion_tokens, and cost_usd columns to chat_requests table")
            except Exception as e:
                print(f"Migration warning: Could not add token/cost columns to chat_requests: {e}")
            finally:
                db.close()

    if inspector.has_table("chat_messages"):
        columns = [c["name"] for c in inspector.get_columns("chat_messages")]
        if "json" not in columns:
            db = SessionLocal()
            try:
                db.execute(text("ALTER TABLE chat_messages ADD COLUMN json TEXT"))
                db.execute(text("ALTER TABLE chat_messages ADD COLUMN code TEXT"))
                db.commit()
                print("Migration: Added json and code columns to chat_messages table")
            except Exception as e:
                print(f"Migration warning: Could not add json/code columns to chat_messages: {e}")
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

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

if __name__ == "__main__":
    init_db()
