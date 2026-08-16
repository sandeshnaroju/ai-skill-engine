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
                 json_data=None, code=None):
    """Persist a single chat message to the database."""
    msg = ChatMessage(
        session_id=session_obj.id,
        role=role,
        content=content,
        tool_call_id=tool_call_id,
        json=json_data,
        code=code,
    )
    if tool_calls is not None:
        msg.tool_calls = json.dumps(tool_calls) if not isinstance(tool_calls, str) else tool_calls
    db.add(msg)
    db.commit()


def create_chat_request(db: DbSession, tenant, session_id: str, app_id,
                        model_name: str, request_source: str, user_message) -> ChatRequest:
    """Create and persist a pending ChatRequest log entry."""
    user_message_db = json.dumps(user_message) if not isinstance(user_message, str) else user_message
    chat_req = ChatRequest(
        tenant_id=tenant.id,
        session_id=session_id,
        app_id=app_id,
        model_name=model_name,
        request_source=request_source,
        user_message=user_message_db,
        status="pending"
    )
    db.add(chat_req)
    db.commit()
    db.refresh(chat_req)
    return chat_req


def finalize_request(db: DbSession, chat_req: ChatRequest, final_answer: str,
                     executed_logs: list, start_time: float, usage_obj=None,
                     in_rate=1.0, out_rate=2.0, au_in_rate=10.0, au_out_rate=20.0):
    """Mark a ChatRequest as completed and persist usage/cost data."""
    import time
    duration_ms = int((time.time() - start_time) * 1000)
    chat_req.assistant_response = final_answer
    chat_req.tools_called = len(executed_logs)
    chat_req.total_duration_ms = duration_ms
    chat_req.status = "completed"
    chat_req.completed_at = datetime.utcnow()
    update_request_usage(chat_req, usage_obj, in_rate, out_rate, au_in_rate, au_out_rate)
    db.commit()


def resolve_allowed_skills(db: DbSession, tenant, app_id: str = None, skill_names: list = None) -> list | None:
    """
    Compute the set of allowed skill names for this request.
    - If app_id: scope to skills mapped to the app, optionally intersected with skill_names.
    - If only skill_names: validate against the registry.
    - If neither: return None (all skills allowed).
    """
    from skill_registry import skill_registry

    if app_id:
        from models import AppModel
        app_obj = db.query(AppModel).filter(AppModel.id == app_id).first()
        if app_obj:
            app_skills = [m.skill_name for m in app_obj.skills]
            if skill_names:
                return [s for s in skill_names if s in app_skills]
            return app_skills
        return []

    if skill_names:
        known = set(skill_registry.skills.keys())
        return [s for s in skill_names if s in known]

    return None
