"""
backend/scheduler/notifier.py
Pluggable multi-channel notification dispatcher for scheduled jobs.
Currently implements Email and Webhook delivery, designed to be extensible
for future mediums (Telegram, WhatsApp, Slack, etc.).
"""
import json
import logging
from abc import ABC, abstractmethod
from typing import Optional

logger = logging.getLogger(__name__)


class BaseNotifier(ABC):
    @abstractmethod
    def send(self, tenant, db, target: str, content: str, subject: Optional[str] = None) -> bool:
        """Deliver content to target destination. Returns True on success."""
        pass


class EmailNotifier(BaseNotifier):
    def send(self, tenant, db, target: str, content: str, subject: Optional[str] = None) -> bool:
        from engine.tools_builtin import run_send_email_tool
        subj = subject or "AI Skill Engine - Scheduled Report"
        res = run_send_email_tool(db, {"to_email": target, "subject": subj, "body": content}, tenant)
        success = res.get("exit_code") == 0
        if not success:
            logger.warning(f"[EmailNotifier] Failed delivering to {target}: {res.get('stderr')}")
        return success


class WebhookNotifier(BaseNotifier):
    def send(self, tenant, db, target: str, content: str, subject: Optional[str] = None) -> bool:
        import httpx
        try:
            payload = {
                "event": "schedule.completed",
                "tenant_id": tenant.id if tenant else None,
                "tenant_name": tenant.name if tenant else None,
                "subject": subject,
                "content": content,
            }
            resp = httpx.post(
                target,
                json=payload,
                headers={"Content-Type": "application/json", "User-Agent": "AI-Skill-Engine-Scheduler/1.0"},
                timeout=15.0,
            )
            if not resp.is_success:
                logger.warning(f"[WebhookNotifier] HTTP {resp.status_code} from {target}: {resp.text[:200]}")
            return resp.is_success
        except Exception as e:
            logger.error(f"[WebhookNotifier] Exception posting to {target}: {e}")
            return False


NOTIFIERS = {
    "email": EmailNotifier(),
    "webhook": WebhookNotifier(),
}


def dispatch_notifications(db, tenant, job, content: str, emailed_recipients: Optional[set] = None, request_id: Optional[str] = None):
    """
    Parses configured delivery channels and dispatches the execution output.
    Supports structured JSON delivery_channels, as well as legacy notify_email
    and notify_webhook fields.
    
    Supports:
    - Multiple comma-separated email recipients per target.
    - Recipient-aware deduplication: if emailed_recipients is provided (i.e. recipients
      who were already sent an email directly by an agent tool during the turn),
      the platform avoids sending that specific recipient a duplicate email with the
      turn's conversational acknowledgement.
    - Automatic ExecutionLog logging: Records dispatched emails and webhooks in execution_logs
      tied to the scheduled ChatRequest so delivery appears in Request Logs.
    """
    emailed_recipients = {r.lower().strip() for r in emailed_recipients} if emailed_recipients else set()
    channels = []
    if getattr(job, "delivery_channels", None):
        try:
            channels = json.loads(job.delivery_channels)
            if not isinstance(channels, list):
                channels = []
        except Exception:
            channels = []

    # Backwards compatibility / shorthand field fallbacks (Webhooks only; Email is handled directly by LLM)
    if getattr(job, "notify_webhook", None):
        if not any(c.get("type") == "webhook" for c in channels if isinstance(c, dict)):
            channels.append({
                "type": "webhook",
                "target": job.notify_webhook,
                "subject": f"Scheduled Update: {job.name}"
            })

    for ch in channels:
        if not isinstance(ch, dict):
            continue
        ch_type = str(ch.get("type", "webhook")).lower().strip()
        target = ch.get("target")
        subject = ch.get("subject") or f"Scheduled Update: {job.name}"

        # In-app chat session is already saved directly by skill_engine.process_chat
        # Email delivery is handled directly by the LLM via tool calls during execution
        if ch_type in ("session", "email"):
            continue

        notifier = NOTIFIERS.get(ch_type)
        if not notifier or not target:
            if not notifier:
                logger.info(f"[Scheduler] Channel type '{ch_type}' is registered as pending integration.")
            continue

        try:
            sent = notifier.send(tenant, db, target=target, content=content, subject=subject)
            print(f"[Scheduler] Channel {ch_type} notification to '{target}' for job '{job.name}': {'SENT' if sent else 'FAILED'}", flush=True)
            try:
                from models import ExecutionLog, ChatRequest
                log_entry = ExecutionLog(
                    tenant_id=tenant.id if tenant else None,
                    session_id=job.session_id or f"schedule_{job.id}",
                    skill_name=ch_type,
                    tool_name=f"{ch_type}__dispatch",
                    command=f"POST {target}",
                    sandbox_type="host",
                    stdout=f"Notification delivered to {target}" if sent else "",
                    stderr="" if sent else f"Failed delivering to {target}",
                    exit_code=0 if sent else 1,
                    execution_time_ms=0,
                    model_name=job.model_name or "system",
                    request_source="scheduler",
                    request_id=request_id
                )
                db.add(log_entry)
                if request_id:
                    req = db.query(ChatRequest).filter(ChatRequest.id == request_id).first()
                    if req:
                        req.tools_called = (req.tools_called or 0) + 1
                db.commit()
            except Exception:
                pass
        except Exception as e:
            print(f"[Scheduler] Failed dispatching to {ch_type} ({target}): {e}", flush=True)
            logger.error(f"[Scheduler] Failed dispatching to {ch_type} ({target}): {e}")

