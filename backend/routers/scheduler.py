"""
backend/routers/scheduler.py
REST API endpoints for managing scheduled jobs and automated tasks.
Supports both External API users (via Bearer API key) and Dashboard users (via Session Cookie).
"""
import json
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Header, Cookie, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import ScheduledJob, Tenant, User
from auth import get_current_tenant, get_current_user
from utils import get_paginated_response
from schemas import ScheduledJobCreate, ScheduledJobUpdate
from scheduler.manager import register_job, run_scheduled_job, get_scheduler

router = APIRouter()


def _resolve_auth(
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None),
    db: Session = Depends(get_db)
) -> dict:
    """
    Unified authenticator returning {'user': user, 'tenant': tenant}.
    Allows external API callers (Bearer sk_mgr_...) and dashboard users.
    """
    # 1. API key auth
    api_key = None
    if authorization and authorization.startswith("Bearer "):
        api_key = authorization.split(" ")[1].strip()
    elif x_api_key:
        api_key = x_api_key.strip()

    if api_key:
        tenant = db.query(Tenant).filter(Tenant.api_key == api_key, Tenant.is_active == True).first()
        if not tenant:
            raise HTTPException(status_code=401, detail="Invalid or inactive API Key")
        return {"user": tenant.user, "tenant": tenant}

    # 2. Session cookie auth
    if session_token:
        user = db.query(User).filter(User.session_token == session_token).first()
        if user:
            return {"user": user, "tenant": None}

    raise HTTPException(status_code=401, detail="Authentication required (API Key or Session Token)")


def _serialize_job(j: ScheduledJob) -> dict:
    channels = []
    if j.delivery_channels:
        try:
            channels = json.loads(j.delivery_channels)
        except Exception:
            channels = []

    # Map fallbacks for clear UI representation
    if j.notify_email and not any(c.get("type") == "email" for c in channels if isinstance(c, dict)):
        channels.append({"type": "email", "target": j.notify_email})
    if j.notify_webhook and not any(c.get("type") == "webhook" for c in channels if isinstance(c, dict)):
        channels.append({"type": "webhook", "target": j.notify_webhook})

    skill_list = []
    if j.skill_names:
        try:
            skill_list = json.loads(j.skill_names)
        except Exception:
            skill_list = []

    return {
        "id": j.id,
        "tenant_id": j.tenant_id,
        "tenant_name": j.tenant.name if j.tenant else None,
        "tenant_timezone": j.tenant.timezone if j.tenant and j.tenant.timezone else "UTC",
        "name": j.name,
        "prompt": j.prompt,
        "trigger_type": j.trigger_type,
        "cron_expression": j.cron_expression,
        "interval_seconds": j.interval_seconds,
        "run_at": j.run_at.isoformat() if j.run_at else None,
        "delivery_channels": channels,
        "notify_email": j.notify_email,
        "notify_webhook": j.notify_webhook,
        "skill_names": skill_list,
        "model_name": j.model_name,
        "session_id": j.session_id,
        "user_data_template_id": getattr(j, "user_data_template_id", None),
        "user_data": json.loads(j.user_data) if getattr(j, "user_data", None) and isinstance(j.user_data, str) else getattr(j, "user_data", None),
        "is_active": j.is_active,
        "run_count": j.run_count,
        "last_run_at": j.last_run_at.isoformat() if j.last_run_at else None,
        "next_run_at": j.next_run_at.isoformat() if j.next_run_at else None,
        "last_result": j.last_result,
        "last_error": j.last_error,
        "created_at": j.created_at.isoformat() if j.created_at else None,
        "updated_at": j.updated_at.isoformat() if j.updated_at else None,
    }


@router.get("/jobs")
def list_jobs(
    tenant_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    trigger_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: Optional[int] = Query(1),
    page_size: int = Query(15),
    auth: dict = Depends(_resolve_auth),
    db: Session = Depends(get_db)
):
    """
    List scheduled jobs with tenant filtering, search, and pagination.
    - External API key: strictly scoped to that API key's tenant.
    - Dashboard user: filter by chosen tenant_id or view all across user's tenants.
    """
    query = db.query(ScheduledJob).join(Tenant, ScheduledJob.tenant_id == Tenant.id)

    # Scoping
    if auth.get("tenant"):
        query = query.filter(ScheduledJob.tenant_id == auth["tenant"].id)
    elif auth.get("user") and auth["user"].id != "system":
        query = query.filter(Tenant.user_id == auth["user"].id)

    # Optional filter by specific tenant
    if tenant_id and tenant_id.strip() and tenant_id.strip().lower() != "all":
        query = query.filter(ScheduledJob.tenant_id == tenant_id.strip())

    # Calculate overall stats for this tenant scope before applying status/trigger/search filters
    base_query = query
    total_all = base_query.count()
    total_active = base_query.filter(ScheduledJob.is_active == True).count()
    total_paused = base_query.filter(ScheduledJob.is_active == False).count()
    sub = base_query.subquery()
    total_runs_val = db.query(func.coalesce(func.sum(sub.c.run_count), 0)).scalar() or 0

    # Optional status filter (support both status="active"|"paused" and is_active=True|False)
    if status == "active" or is_active is True:
        query = query.filter(ScheduledJob.is_active == True)
    elif status == "paused" or is_active is False:
        query = query.filter(ScheduledJob.is_active == False)

    # Optional trigger_type filter (cron, interval, date)
    if trigger_type and trigger_type.strip() and trigger_type.strip().lower() != "all":
        query = query.filter(ScheduledJob.trigger_type == trigger_type.strip().lower())

    # Optional search by job name or prompt
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(ScheduledJob.name.ilike(term) | ScheduledJob.prompt.ilike(term))

    query = query.order_by(ScheduledJob.created_at.desc())
    resp = get_paginated_response(query, page, page_size, _serialize_job)
    resp["stats"] = {
        "total": total_all,
        "active": total_active,
        "paused": total_paused,
        "total_runs": int(total_runs_val)
    }
    return resp


@router.post("/jobs")
def create_job(
    payload: ScheduledJobCreate,
    auth: dict = Depends(_resolve_auth),
    db: Session = Depends(get_db)
):
    """Create a new scheduled job programmatically or from the dashboard."""
    # Resolve target tenant
    target_tenant_id = None
    if auth.get("tenant"):
        target_tenant_id = auth["tenant"].id
    elif payload.tenant_id:
        t = db.query(Tenant).filter(Tenant.id == payload.tenant_id).first()
        if not t:
            raise HTTPException(status_code=404, detail="Target tenant not found")
        if auth.get("user") and auth["user"].id != "system" and t.user_id != auth["user"].id:
            raise HTTPException(status_code=403, detail="Not authorized to schedule under this tenant")
        target_tenant_id = t.id
    elif auth.get("user"):
        first_t = db.query(Tenant).filter(Tenant.user_id == auth["user"].id).first()
        if not first_t:
            raise HTTPException(status_code=400, detail="No tenant workspace found for this user account")
        target_tenant_id = first_t.id

    t_obj = db.query(Tenant).filter(Tenant.id == target_tenant_id).first()
    if not t_obj:
        raise HTTPException(status_code=404, detail="Tenant workspace not found")

    run_at_val = None
    if payload.run_at:
        try:
            run_at_val = datetime.fromisoformat(payload.run_at)
        except Exception:
            run_at_val = None

    # Webhook Resolution: explicit in payload -> fallback to tenant default
    resolved_webhook = payload.notify_webhook or t_obj.default_webhook_url

    job = ScheduledJob(
        tenant_id=target_tenant_id,
        session_id=payload.session_id,
        name=payload.name.strip(),
        prompt=payload.prompt.strip(),
        trigger_type=payload.trigger_type or "cron",
        cron_expression=payload.cron_expression,
        interval_seconds=payload.interval_seconds,
        run_at=run_at_val,
        delivery_channels=json.dumps(payload.delivery_channels) if payload.delivery_channels else None,
        notify_email=payload.notify_email,
        notify_webhook=resolved_webhook,
        skill_names=json.dumps(payload.skill_names) if payload.skill_names else None,
        model_name=payload.model_name,
        user_data=json.dumps(payload.user_data) if payload.user_data else None,
        user_data_template_id=payload.user_data_template_id,
        is_active=True,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Register immediately in active scheduler if running in this worker
    sched = get_scheduler()
    if sched and sched.running:
        try:
            register_job(sched, job)
        except Exception:
            pass

    return _serialize_job(job)


@router.get("/jobs/{job_id}")
def get_job(
    job_id: str,
    auth: dict = Depends(_resolve_auth),
    db: Session = Depends(get_db)
):
    query = db.query(ScheduledJob).join(Tenant).filter(ScheduledJob.id == job_id)
    if auth.get("tenant"):
        query = query.filter(ScheduledJob.tenant_id == auth["tenant"].id)
    elif auth.get("user") and auth["user"].id != "system":
        query = query.filter(Tenant.user_id == auth["user"].id)

    job = query.first()
    if not job:
        raise HTTPException(status_code=404, detail="Scheduled job not found")

    return _serialize_job(job)


@router.put("/jobs/{job_id}")
def update_job(
    job_id: str,
    payload: ScheduledJobUpdate,
    auth: dict = Depends(_resolve_auth),
    db: Session = Depends(get_db)
):
    query = db.query(ScheduledJob).join(Tenant).filter(ScheduledJob.id == job_id)
    if auth.get("tenant"):
        query = query.filter(ScheduledJob.tenant_id == auth["tenant"].id)
    elif auth.get("user") and auth["user"].id != "system":
        query = query.filter(Tenant.user_id == auth["user"].id)

    job = query.first()
    if not job:
        raise HTTPException(status_code=404, detail="Scheduled job not found")

    if payload.name is not None:
        job.name = payload.name.strip()
    if payload.prompt is not None:
        job.prompt = payload.prompt.strip()
    if payload.trigger_type is not None:
        job.trigger_type = payload.trigger_type
    if payload.cron_expression is not None:
        job.cron_expression = payload.cron_expression
    if payload.interval_seconds is not None:
        job.interval_seconds = payload.interval_seconds
    if payload.run_at is not None:
        try:
            job.run_at = datetime.fromisoformat(payload.run_at)
        except Exception:
            job.run_at = None
    if payload.delivery_channels is not None:
        job.delivery_channels = json.dumps(payload.delivery_channels)
    if payload.notify_email is not None:
        job.notify_email = payload.notify_email
    if payload.notify_webhook is not None:
        job.notify_webhook = payload.notify_webhook
    if payload.skill_names is not None:
        job.skill_names = json.dumps(payload.skill_names)
    if payload.model_name is not None:
        job.model_name = payload.model_name
    if payload.user_data is not None:
        job.user_data = json.dumps(payload.user_data) if payload.user_data else None
    if payload.user_data_template_id is not None:
        job.user_data_template_id = payload.user_data_template_id
    if payload.is_active is not None:
        job.is_active = payload.is_active

    db.commit()
    db.refresh(job)

    sched = get_scheduler()
    if sched and sched.running:
        if job.is_active:
            try:
                register_job(sched, job)
            except Exception:
                pass
        else:
            try:
                sched.remove_job(job.id)
            except Exception:
                pass

    return _serialize_job(job)


@router.post("/jobs/{job_id}/trigger")
def trigger_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    auth: dict = Depends(_resolve_auth),
    db: Session = Depends(get_db)
):
    """Manually test-run a scheduled job immediately in background."""
    query = db.query(ScheduledJob).join(Tenant).filter(ScheduledJob.id == job_id)
    if auth.get("tenant"):
        query = query.filter(ScheduledJob.tenant_id == auth["tenant"].id)
    elif auth.get("user") and auth["user"].id != "system":
        query = query.filter(Tenant.user_id == auth["user"].id)

    job = query.first()
    if not job:
        raise HTTPException(status_code=404, detail="Scheduled job not found")

    background_tasks.add_task(run_scheduled_job, job.id, force=True)
    return {"status": "triggered", "message": f"Job '{job.name}' initiated in background"}


@router.post("/jobs/{job_id}/pause")
def pause_job(
    job_id: str,
    auth: dict = Depends(_resolve_auth),
    db: Session = Depends(get_db)
):
    query = db.query(ScheduledJob).join(Tenant).filter(ScheduledJob.id == job_id)
    if auth.get("tenant"):
        query = query.filter(ScheduledJob.tenant_id == auth["tenant"].id)
    elif auth.get("user") and auth["user"].id != "system":
        query = query.filter(Tenant.user_id == auth["user"].id)

    job = query.first()
    if not job:
        raise HTTPException(status_code=404, detail="Scheduled job not found")

    job.is_active = False
    db.commit()

    sched = get_scheduler()
    if sched and sched.running:
        try:
            sched.pause_job(job.id)
        except Exception:
            pass

    return {"status": "paused", "job_id": job.id, "name": job.name, "is_active": False}


@router.post("/jobs/{job_id}/resume")
def resume_job(
    job_id: str,
    auth: dict = Depends(_resolve_auth),
    db: Session = Depends(get_db)
):
    query = db.query(ScheduledJob).join(Tenant).filter(ScheduledJob.id == job_id)
    if auth.get("tenant"):
        query = query.filter(ScheduledJob.tenant_id == auth["tenant"].id)
    elif auth.get("user") and auth["user"].id != "system":
        query = query.filter(Tenant.user_id == auth["user"].id)

    job = query.first()
    if not job:
        raise HTTPException(status_code=404, detail="Scheduled job not found")

    job.is_active = True
    db.commit()

    sched = get_scheduler()
    if sched and sched.running:
        try:
            register_job(sched, job)
        except Exception:
            pass

    return {"status": "resumed", "job_id": job.id, "name": job.name, "is_active": True}


@router.delete("/jobs/{job_id}")
def delete_job(
    job_id: str,
    auth: dict = Depends(_resolve_auth),
    db: Session = Depends(get_db)
):
    query = db.query(ScheduledJob).join(Tenant).filter(ScheduledJob.id == job_id)
    if auth.get("tenant"):
        query = query.filter(ScheduledJob.tenant_id == auth["tenant"].id)
    elif auth.get("user") and auth["user"].id != "system":
        query = query.filter(Tenant.user_id == auth["user"].id)

    job = query.first()
    if not job:
        raise HTTPException(status_code=404, detail="Scheduled job not found")

    target_id = job.id
    target_name = job.name
    db.delete(job)
    db.commit()

    sched = get_scheduler()
    if sched and sched.running:
        try:
            sched.remove_job(target_id)
        except Exception:
            pass

    return {"status": "deleted", "job_id": target_id, "name": target_name}

