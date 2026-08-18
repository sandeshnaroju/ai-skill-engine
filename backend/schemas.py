from pydantic import BaseModel
from typing import Optional, List, Any, Union

class PlaygroundChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = "default_session"
    prochat_model: Optional[str] = None
    user_data: Optional[dict] = None
    skill_names: Optional[List[str]] = None

class OpenAIStyleMessage(BaseModel):
    role: str
    content: Union[str, List[Any]]

class OpenAIChatRequest(BaseModel):
    messages: List[OpenAIStyleMessage]
    model: Optional[str] = "gemini-2.5-flash"
    session_id: Optional[str] = "default_session"
    app_id: Optional[str] = None
    stream: Optional[bool] = False
    prochat_model: Optional[str] = None
    user_data: Optional[dict] = None
    skill_names: Optional[List[str]] = None

class TenantCreate(BaseModel):
    name: str

class SkillSaveRequest(BaseModel):
    skill_name: str
    content: str
    tenant_id: Optional[str] = None

class SkillDuplicateRequest(BaseModel):
    target_tenant_ids: List[str]
    new_skill_name: Optional[str] = None

class ApiCallDetail(BaseModel):
    method: str
    url: str
    headers: List[dict] = []
    query_params: List[dict] = []
    body: Optional[str] = ""

class SkillGenerateRequest(BaseModel):
    tenant_id: str
    model_name: str
    skill_name: str
    description: str
    api_calls: List[ApiCallDetail] = []
    inputs_secrets: Optional[str] = ""
    behavior: Optional[str] = ""

class AppCreate(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    icon: Optional[str] = "box"
    skill_names: List[str] = []
    tenant_id: Optional[str] = None

class AppDuplicateRequest(BaseModel):
    target_tenant_ids: List[str]
    new_app_name: Optional[str] = None

class TenantLlmCreate(BaseModel):
    provider: str
    model_name: str
    api_key: str
    base_url: Optional[str] = None
    input_rate: Optional[float] = 1.0
    output_rate: Optional[float] = 2.0
    audio_input_rate: Optional[float] = 10.0
    audio_output_rate: Optional[float] = 20.0

class UserRegister(BaseModel):
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class VerifyOtpRequest(BaseModel):
    email: str
    otp: str

class ResendOtpRequest(BaseModel):
    email: str

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

class StorageConfigPayload(BaseModel):
    provider: str  # local | s3 | azure
    bucket_name: Optional[str] = None
    region: Optional[str] = None
    access_key: Optional[str] = None      # plain-text; will be encrypted before save
    secret_key: Optional[str] = None      # plain-text; will be encrypted before save
    endpoint_url: Optional[str] = None
    container_name: Optional[str] = None
    account_name: Optional[str] = None    # plain-text; will be encrypted before save
    account_key: Optional[str] = None     # plain-text; will be encrypted before save
    use_presigned_urls: Optional[bool] = True
    presigned_url_expires_seconds: Optional[int] = 3600
    tenant_id: Optional[str] = None

class SandboxConfigPayload(BaseModel):
    provider: str  # none | azure | fly | e2b | lambda
    e2b_api_key: Optional[str] = None
    azure_client_id: Optional[str] = None
    azure_client_secret: Optional[str] = None
    azure_tenant_id: Optional[str] = None
    azure_session_pool_endpoint: Optional[str] = None
    fly_api_token: Optional[str] = None
    fly_app_name: Optional[str] = None
    aws_access_key: Optional[str] = None
    aws_secret_key: Optional[str] = None
    aws_region: Optional[str] = None
    aws_function_name: Optional[str] = None
    tenant_id: Optional[str] = None


class EmailConfigSave(BaseModel):
    tenant_id: Optional[str] = None
    smtp_host: str
    smtp_port: int
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    sender_email: str
    use_tls: Optional[bool] = True
    use_ssl: Optional[bool] = False

class EmailConfigTest(BaseModel):
    tenant_id: Optional[str] = None
    test_receiver: str

class McpServerCreate(BaseModel):
    name: str
    transport: Optional[str] = "stdio"
    command: Optional[str] = None
    url: Optional[str] = None
    env: Optional[str] = None
    tenant_id: Optional[str] = None

class UserDataTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    data: dict
    tenant_id: Optional[str] = None


