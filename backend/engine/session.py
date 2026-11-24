"""
engine/session.py
Session and ChatRequest persistence helpers shared across the skill engine.
"""
import json
from datetime import datetime
from sqlalchemy.orm import Session as DbSession

from models import ConversationSession, ChatMessage, ChatRequest
from engine.usage import update_request_usage


def get_or_create_session(db: DbSession, tenant, session_id: str) -> ConversationSession:
    """Return existing session or create a new one for this tenant + session_id."""
    session_obj = db.query(ConversationSession).filter(
        ConversationSession.tenant_id == tenant.id,
        ConversationSession.session_id == session_id
    ).first()

    if not session_obj:
        session_obj = ConversationSession(tenant_id=tenant.id, session_id=session_id)
        db.add(session_obj)
        db.commit()
        db.refresh(session_obj)

    return session_obj


def save_message(db: DbSession, session_obj: ConversationSession, role: str,
                 content=None, tool_calls=None, tool_call_id=None,
                 json_data=None, code=None, artifact_data=None, reasoning=None):
    """Persist a single chat message to the database."""
    art_str = json.dumps(artifact_data) if (artifact_data and not isinstance(artifact_data, str)) else artifact_data
    msg = ChatMessage(
        session_id=session_obj.id,
        role=role,
        content=content,
        reasoning=reasoning,
        tool_call_id=tool_call_id,
        json=json_data,
        code=code,
        artifact_data=art_str,
    )
    if tool_calls is not None:
        msg.tool_calls = json.dumps(tool_calls) if not isinstance(tool_calls, str) else tool_calls
    db.add(msg)
    db.commit()


def mask_user_data_values(data):
    """
    Recursively masks sensitive values in user_data dictionaries so they
    can be safely stored in audit logs and viewed in dashboard UI.
    """
    if not data:
        return None
    if isinstance(data, dict):
        masked = {}
        for k, v in data.items():
            k_lower = str(k).lower()
            if isinstance(v, (dict, list)):
                masked[k] = mask_user_data_values(v)
            elif isinstance(v, str):
                s = v.strip()
                # Check for sensitive key names or token-like values
                is_sensitive = any(kw in k_lower for kw in [
                    "secret", "token", "key", "password", "auth", "credential", "private", "api_key", "bearer"
                ])
                if is_sensitive:
                    if len(s) <= 6:
                        masked[k] = "******"
                    elif len(s) <= 12:
                        masked[k] = f"{s[:2]}****{s[-2:]}"
                    else:
                        masked[k] = f"{s[:3]}****{s[-4:]}"
                elif "@" in s and "." in s:
                    # Email masking: test@example.com -> te***@example.com
                    parts = s.split("@", 1)
                    user_part = parts[0]
                    domain = parts[1]
                    if len(user_part) <= 2:
                        masked_user = f"{user_part[:1]}***"
                    else:
                        masked_user = f"{user_part[:2]}***"
                    masked[k] = f"{masked_user}@{domain}"
                elif len(s) > 80:
                    # Very long arbitrary string
                    masked[k] = f"{s[:10]}...[truncated]"
                else:
                    masked[k] = v
            else:
                masked[k] = v
        return masked
    elif isinstance(data, list):
        return [mask_user_data_values(item) for item in data]
    return data


def create_chat_request(db: DbSession, tenant, session_id: str, app_id,
                        model_name: str, request_source: str, user_message,
                        user_data: dict = None) -> ChatRequest:
    """Create and persist a pending ChatRequest log entry."""
    user_message_db = json.dumps(user_message) if not isinstance(user_message, str) else user_message
    masked_user_data_str = None
    if user_data:
        try:
            masked_dict = mask_user_data_values(user_data)
            masked_user_data_str = json.dumps(masked_dict) if masked_dict else None
        except Exception:
            masked_user_data_str = None

    chat_req = ChatRequest(
        tenant_id=tenant.id,
        session_id=session_id,
        app_id=app_id,
        model_name=model_name,
        request_source=request_source,
        user_message=user_message_db,
        user_data=masked_user_data_str,
        status="pending"
    )
    db.add(chat_req)
    db.commit()
    db.refresh(chat_req)
    return chat_req


def finalize_request(db: DbSession, chat_req: ChatRequest, final_answer: str,
                     executed_logs: list, start_time: float, usage_obj=None,
                     in_rate=1.0, out_rate=2.0, au_in_rate=10.0, au_out_rate=20.0,
                     model_name: str = None):
    """Mark a ChatRequest as completed and persist usage/cost data."""
    import time
    duration_ms = int((time.time() - start_time) * 1000)
    chat_req.assistant_response = final_answer
    chat_req.tools_called = len(executed_logs)
    chat_req.total_duration_ms = duration_ms
    chat_req.status = "completed"
    chat_req.completed_at = datetime.utcnow()
    primary_model = model_name or chat_req.model_name
    update_request_usage(chat_req, usage_obj, in_rate, out_rate, au_in_rate, au_out_rate, is_secondary=False, model_name=primary_model)
    db.commit()


def resolve_allowed_skills(db: DbSession, tenant, app_id: str = None, skill_names: list = None, request_source: str = None) -> list:
    """
    Compute the set of allowed skill names for this request.
    - If app_id: start with skills mapped to the app.
    - If skill_names: add any extra requested skills without repeating already added ones.
    - If neither: return [] (no skills by default; only use skills that are provided).
    """
    from skill_registry import skill_registry

    tenant_id = tenant.id if tenant else None
    known = set(skill_registry.get_skills_dict(tenant_id=tenant_id).keys())

    resolved = []
    seen = set()

    if app_id:
        from models import AppModel
        app_obj = db.query(AppModel).filter(AppModel.id == app_id).first()
        if app_obj:
            for m in app_obj.skills:
                if m.skill_name in known and m.skill_name not in seen:
                    resolved.append(m.skill_name)
                    seen.add(m.skill_name)

    if skill_names:
        for s in skill_names:
            if s in known and s not in seen:
                resolved.append(s)
                seen.add(s)

    return resolved
