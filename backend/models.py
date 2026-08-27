import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, Integer, ForeignKey, Boolean, Float, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    session_token = Column(String, nullable=True, index=True)
    reset_token = Column(String, nullable=True)
    reset_token_expires = Column(DateTime, nullable=True)
    is_verified = Column(Boolean, default=True)
    verification_otp = Column(String, nullable=True)
    verification_otp_expires = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    tenants = relationship("Tenant", back_populates="user", cascade="all, delete-orphan")

class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    api_key = Column(String, unique=True, nullable=False, index=True)
    is_active = Column(Boolean, default=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="tenants")
    sessions = relationship("ConversationSession", back_populates="tenant", cascade="all, delete-orphan")
    execution_logs = relationship("ExecutionLog", back_populates="tenant", cascade="all, delete-orphan")
    llms = relationship("TenantLLM", back_populates="tenant", cascade="all, delete-orphan")
    chat_requests = relationship("ChatRequest", back_populates="tenant", cascade="all, delete-orphan")
    email_config = relationship("EmailConfig", back_populates="tenant", uselist=False, cascade="all, delete-orphan")
    custom_skills = relationship("CustomSkill", back_populates="tenant", cascade="all, delete-orphan")
    mcp_servers = relationship("McpServer", back_populates="tenant", cascade="all, delete-orphan")
    apps = relationship("AppModel", back_populates="tenant", cascade="all, delete-orphan")
    user_data_templates = relationship("UserDataTemplate", back_populates="tenant", cascade="all, delete-orphan")
    storage_configs = relationship("StorageConfig", back_populates="tenant", cascade="all, delete-orphan")
    sandbox_configs = relationship("SandboxConfig", back_populates="tenant", cascade="all, delete-orphan")

class EmailConfig(Base):
    __tablename__ = "email_configs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=True, unique=True)
    smtp_host = Column(String, nullable=False)
    smtp_port = Column(Integer, nullable=False)
    smtp_username = Column(String, nullable=True)
    smtp_password_encrypted = Column(String, nullable=True)
    sender_email = Column(String, nullable=False)
    use_tls = Column(Boolean, default=True)
    use_ssl = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    tenant = relationship("Tenant", back_populates="email_config")

class ConversationSession(Base):
    __tablename__ = "conversation_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    session_id = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    tenant = relationship("Tenant", back_populates="sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("conversation_sessions.id"), nullable=False)
    role = Column(String, nullable=False)  # user, assistant, system, tool
    content = Column(Text, nullable=True)
    tool_calls = Column(Text, nullable=True)  # JSON string if any
    tool_call_id = Column(String, nullable=True)
    json = Column(Text, nullable=True)        # Saved ProChat UI component structure
    code = Column(Text, nullable=True)        # Saved ProChat component code block
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("ConversationSession", back_populates="messages")

class ExecutionLog(Base):
    __tablename__ = "execution_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=True)
    session_id = Column(String, nullable=True)
    skill_name = Column(String, nullable=False)
    tool_name = Column(String, nullable=False)
    command = Column(Text, nullable=False)
    sandbox_type = Column(String, nullable=False)  # docker, process
    stdout = Column(Text, nullable=True)
    stderr = Column(Text, nullable=True)
    exit_code = Column(Integer, nullable=False, default=0)
    execution_time_ms = Column(Integer, nullable=False, default=0)
    model_name = Column(String, nullable=True)
    request_source = Column(String, nullable=True, default="api")
    request_id = Column(String, ForeignKey("chat_requests.id", use_alter=True), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    tenant = relationship("Tenant", back_populates="execution_logs")
    chat_request = relationship("ChatRequest", back_populates="execution_logs", foreign_keys=[request_id])

class ChatRequest(Base):
    """Logs every incoming chat request — API or dashboard — for full auditability."""
    __tablename__ = "chat_requests"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=True, index=True)
    session_id = Column(String, nullable=True, index=True)
    app_id = Column(String, nullable=True)                      # app scope used, if any
    model_name = Column(String, nullable=True)                  # resolved model name
    request_source = Column(String, nullable=False, default="api")  # "api" | "dashboard"
    user_message = Column(Text, nullable=False)
    assistant_response = Column(Text, nullable=True)            # populated at completion
    tools_called = Column(Integer, default=0)                   # count of tool executions
    total_duration_ms = Column(Integer, nullable=True)          # wall-clock time ms
    prompt_tokens = Column(Integer, default=0)                  # input tokens count
    completion_tokens = Column(Integer, default=0)              # output tokens count
    cost_usd = Column(Float, default=0.0)                       # estimated USD cost of request
    primary_model_name = Column(String, nullable=True)
    primary_prompt_tokens = Column(Integer, default=0)
    primary_completion_tokens = Column(Integer, default=0)
    primary_cost_usd = Column(Float, default=0.0)
    secondary_model_name = Column(String, nullable=True)
    secondary_prompt_tokens = Column(Integer, default=0)
    secondary_completion_tokens = Column(Integer, default=0)
    secondary_cost_usd = Column(Float, default=0.0)
    status = Column(String, nullable=False, default="pending")  # pending | completed | error
    error_detail = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    tenant = relationship("Tenant", back_populates="chat_requests")
    execution_logs = relationship("ExecutionLog", back_populates="chat_request",
                                  foreign_keys="ExecutionLog.request_id")

class CustomSkill(Base):
    __tablename__ = "custom_skills"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uix_custom_skill_tenant_name"),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=True)
    name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    content = Column(Text, nullable=False)  # SKILL.md content
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tenant = relationship("Tenant", back_populates="custom_skills")

class McpServer(Base):
    __tablename__ = "mcp_servers"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uix_mcp_tenant_name"),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=True)
    name = Column(String, nullable=False, index=True)
    transport = Column(String, default="stdio")  # stdio or sse/http
    command = Column(Text, nullable=True)        # e.g. npx -y @modelcontextprotocol/server-filesystem /tmp
    url = Column(String, nullable=True)          # e.g. http://localhost:8001/sse
    env = Column(Text, nullable=True)            # JSON string for environment variables / API tokens
    cached_tools = Column(Text, nullable=True)   # JSON string for discovered tools
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tenant = relationship("Tenant", back_populates="mcp_servers")

class AppModel(Base):
    __tablename__ = "apps"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uix_app_tenant_name"),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=True)
    name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    icon = Column(String, default="box")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tenant = relationship("Tenant", back_populates="apps")
    skills = relationship("AppSkillMapping", back_populates="app", cascade="all, delete-orphan")

class AppSkillMapping(Base):
    __tablename__ = "app_skill_mappings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    app_id = Column(String, ForeignKey("apps.id"), nullable=False)
    skill_name = Column(String, nullable=False)

    app = relationship("AppModel", back_populates="skills")

class TenantLLM(Base):
    __tablename__ = "tenant_llms"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    provider = Column(String, nullable=False)  # openai, gemini, openrouter, custom
    model_name = Column(String, nullable=False)  # e.g. gpt-4o, gemini-2.5-flash
    api_key_encrypted = Column(Text, nullable=False)
    base_url = Column(String, nullable=True)
    input_rate = Column(Float, default=1.0)
    output_rate = Column(Float, default=2.0)
    audio_input_rate = Column(Float, default=10.0)
    audio_output_rate = Column(Float, default=20.0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tenant = relationship("Tenant", back_populates="llms")

class StorageConfig(Base):
    """Persists the active file storage backend configuration."""
    __tablename__ = "storage_config"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=True)
    provider = Column(String, nullable=False, default="local")  # local | s3 | azure

    # AWS S3 fields
    bucket_name = Column(String, nullable=True)
    region = Column(String, nullable=True)
    access_key_encrypted = Column(Text, nullable=True)
    secret_key_encrypted = Column(Text, nullable=True)
    endpoint_url = Column(String, nullable=True)  # For S3-compatible (MinIO, etc.)

    # Azure Blob Storage fields
    container_name = Column(String, nullable=True)
    account_name_encrypted = Column(Text, nullable=True)
    account_key_encrypted = Column(Text, nullable=True)

    # URL mode
    use_presigned_urls = Column(Boolean, default=True)
    presigned_url_expires_seconds = Column(Integer, default=3600)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tenant = relationship("Tenant", back_populates="storage_configs")


class SandboxConfig(Base):
    """Persists the active remote sandbox execution configuration."""
    __tablename__ = "sandbox_config"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=True)
    provider = Column(String, nullable=False, default="none")  # none | azure | fly | e2b | lambda

    # E2B fields
    e2b_api_key_encrypted = Column(Text, nullable=True)

    # Azure Container Apps (Dynamic Sessions) fields
    azure_client_id_encrypted = Column(Text, nullable=True)
    azure_client_secret_encrypted = Column(Text, nullable=True)
    azure_tenant_id_encrypted = Column(Text, nullable=True)
    azure_session_pool_endpoint = Column(String, nullable=True)

    # Fly.io fields
    fly_api_token_encrypted = Column(Text, nullable=True)
    fly_app_name = Column(String, nullable=True)

    # AWS Lambda fields
    aws_access_key_encrypted = Column(Text, nullable=True)
    aws_secret_key_encrypted = Column(Text, nullable=True)
    aws_region = Column(String, nullable=True)
    aws_function_name = Column(String, nullable=True)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tenant = relationship("Tenant", back_populates="sandbox_configs")


class UserDataTemplate(Base):
    __tablename__ = "user_data_templates"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=True)
    name = Column(String, unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    data = Column(Text, nullable=False)  # JSON-encoded dictionary of key-value pairs
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tenant = relationship("Tenant", back_populates="user_data_templates")
