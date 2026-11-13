"""
backend/scheduler/manager.py
Core scheduler orchestration using APScheduler with SQLAlchemyJobStore.
- Binds to the unified SQLAlchemy engine (SQLite in local dev, PostgreSQL in prod)
- Multi-worker safe: DB polling synchronization loop across processes
- Multi-tenant execution: runs inside tenant context with tenant timezone & quotas
"""
import os
import json
import logging
import fcntl
from datetime import datetime
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.executors.pool import ThreadPoolExecutor

from database import engine

logger = logging.getLogger(__name__)

_global_scheduler: Optional[BackgroundScheduler] = None
_lock_file = None


def get_scheduler() -> Optional[BackgroundScheduler]:
    """Returns the active global BackgroundScheduler instance if running in this worker."""
    global _global_scheduler
    return _global_scheduler


def start_scheduler(custom_engine=None) -> Optional[BackgroundScheduler]:
    """
    Starts APScheduler in a multi-worker safe manner using an OS file lock.
    Only the elected worker runs the background scheduler and polling loop.
    """
    global _global_scheduler, _lock_file
    lock_path = os.environ.get("ASE_SCHEDULER_LOCK", "/tmp/ase_scheduler.lock")
    try:
        _lock_file = open(lock_path, "w")
        fcntl.flock(_lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        logger.info(f"[Scheduler] Acquired leader lock ({lock_path}). Initializing APScheduler.")
    except (BlockingIOError, IOError, OSError):
        logger.info("[Scheduler] Another worker holds the scheduler leader lock. Scheduler inactive in this worker.")
        return None

    try:
        _global_scheduler = create_scheduler(custom_engine)
        _global_scheduler.start()

        # Add the DB polling job every 5 seconds to sync cross-worker mutations (run in-memory)
        _global_scheduler.add_job(
            func=_poll_new_jobs,
            trigger="interval",
            seconds=5,
            id="__db_poll__",
            name="[System] Cross-Worker DB Sync Poll",
            jobstore="memory",
            replace_existing=True,
        )

        # Initial sync
        _poll_new_jobs(_global_scheduler)
        logger.info("[Scheduler] APScheduler background service started successfully.")
        return _global_scheduler
    except Exception as e:
        logger.error(f"[Scheduler] Failed to start APScheduler: {e}")
        return None


def shutdown_scheduler():
    """Cleanly shuts down the scheduler and releases file locks."""
    global _global_scheduler, _lock_file
    if _global_scheduler and _global_scheduler.running:
        try:
            _global_scheduler.shutdown(wait=False)
            logger.info("[Scheduler] APScheduler shut down.")
        except Exception as e:
            logger.warning(f"[Scheduler] Error shutting down scheduler: {e}")
    if _lock_file:
        try:
            fcntl.flock(_lock_file, fcntl.LOCK_UN)
            _lock_file.close()
        except Exception:
            pass
        _lock_file = None


def create_scheduler(custom_engine=None) -> BackgroundScheduler:
    """
    Creates a BackgroundScheduler instance bound directly to SQLAlchemy engine.
    - Local Dev (SQLite): APScheduler automatically uses SQLite dialect and types.
    - Production (PostgreSQL): APScheduler automatically uses PostgreSQL dialect,
      native connection pooling, and concurrent row transactions.
    """
    target_engine = custom_engine or engine
    jobstores = {
        "default": SQLAlchemyJobStore(engine=target_engine),
        "memory": MemoryJobStore()
    }
    executors = {
        "default": ThreadPoolExecutor(20)
    }
    return BackgroundScheduler(jobstores=jobstores, executors=executors)


def register_job(scheduler: BackgroundScheduler, job: "ScheduledJob") -> bool:
    """
    Register or replace a job in APScheduler.
    Applies the tenant's localized timezone for cron triggers.
    """
    if not job or not scheduler or not scheduler.running:
        return False

    tenant_tz = (job.tenant.timezone if job.tenant and job.tenant.timezone else None) or "UTC"

    kwargs = {
        "func": run_scheduled_job,
        "args": [job.id],
        "id": job.id,
        "name": f"[{job.tenant_id}] {job.name}",
        "replace_existing": True,
        "misfire_grace_time": 3600,  # 1 hour window so server restarts or queue spikes don't miss jobs
    }

    try:
        if job.trigger_type == "cron":
            expr = (job.cron_expression or "0 10 * * *").strip()
            parts = expr.split()
            if len(parts) == 5:
                scheduler.add_job(
                    trigger="cron",
                    minute=parts[0],
                    hour=parts[1],
                    day=parts[2],
                    month=parts[3],
                    day_of_week=parts[4],
                    timezone=tenant_tz,
                    **kwargs
                )
            else:
                logger.warning(f"[Scheduler] Invalid cron expression for job {job.id}: '{expr}'")
                return False

        elif job.trigger_type == "interval":
            secs = max(1, job.interval_seconds or 3600)
            scheduler.add_job(
                trigger="interval",
                seconds=secs,
                **kwargs
            )

        elif job.trigger_type == "date":
            if not job.run_at:
                logger.warning(f"[Scheduler] Date trigger requested but run_at is empty for job {job.id}")
                return False
            # Prevent re-registration of one-off jobs that have already run
            if job.run_count and job.run_count > 0:
                logger.info(f"[Scheduler] Date job {job.id} has already executed ({job.run_count} runs). Skipping registration.")
                return False
            scheduler.add_job(
                trigger="date",
                run_date=job.run_at,
                timezone=tenant_tz,
                **kwargs
            )
        else:
            logger.warning(f"[Scheduler] Unknown trigger_type '{job.trigger_type}' for job {job.id}")
            return False

        return True
    except Exception as e:
        logger.error(f"[Scheduler] Failed to register job {job.id} in APScheduler: {e}")
        return False


def _poll_new_jobs(scheduler: Optional[BackgroundScheduler] = None):
    """
    Runs every 5 seconds inside the worker hosting the active scheduler.
    Picks up jobs created, paused, or deleted by other Uvicorn worker processes.
    """
    if not scheduler:
        scheduler = get_scheduler()
    if not scheduler or not scheduler.running:
        return

    from database import SessionLocal
    from models import ScheduledJob

    db = SessionLocal()
    try:
        active_jobs = db.query(ScheduledJob).filter(
            ScheduledJob.is_active == True
        ).all()

        registered_job_map = {j.id: j for j in scheduler.get_jobs()}

        # 1. Register newly added or resumed jobs
        for job in active_jobs:
            # One-off date jobs: if already executed or past their run time, deactivate in DB
            if job.trigger_type == "date":
                if job.run_count and job.run_count > 0:
                    job.is_active = False
                    db.commit()
                    continue
                if job.run_at and job.run_at < datetime.utcnow():
                    # Job was in the past and missed window, deactivate
                    if (datetime.utcnow() - job.run_at).total_seconds() > 300:
                        job.is_active = False
                        db.commit()
                        continue

            if job.id not in registered_job_map:
                try:
                    registered = register_job(scheduler, job)
                    if registered:
                        logger.info(f"[Scheduler] Registered job from DB sync: '{job.name}' (Tenant: {job.tenant_id})")
                except Exception as ex:
                    logger.error(f"[Scheduler] Error registering job {job.id} during poll: {ex}")

        # 2. Unregister jobs that were paused or deleted from the database
        db_active_ids = {job.id for job in active_jobs}
        for registered_id in registered_job_map:
            if registered_id != "__db_poll__" and registered_id not in db_active_ids:
                try:
                    scheduler.remove_job(registered_id)
                    logger.info(f"[Scheduler] Removed inactive/deleted job from scheduler: {registered_id}")
                except Exception:
                    pass
    except Exception as e:
        logger.error(f"[Scheduler] Error in _poll_new_jobs: {e}")
    finally:
        db.close()


def run_scheduled_job(job_id: str, force: bool = False):
    """
    Executed by APScheduler worker thread when a schedule triggers,
    or immediately via manual trigger when force=True.
    Executes the prompt within the tenant's execution context and dispatches output.
    """
    from database import SessionLocal
    from models import ScheduledJob
    from skill_engine import skill_engine
    from scheduler.notifier import dispatch_notifications

    db = SessionLocal()
    job = None
    try:
        job = db.query(ScheduledJob).filter(ScheduledJob.id == job_id).first()
        if not job or (not job.is_active and not force):
            print(f"[Scheduler] Skipping execution for job {job_id}: active={getattr(job, 'is_active', False)}, force={force}", flush=True)
            return

        tenant = job.tenant
        skill_names = json.loads(job.skill_names) if job.skill_names else None
        user_data = json.loads(job.user_data) if job.user_data else None

        print(f"[Scheduler] Firing scheduled job '{job.name}' (ID: {job.id}, force={force}) for tenant '{tenant.name if tenant else 'default'}'", flush=True)
        logger.info(f"[Scheduler] Firing scheduled job '{job.name}' (ID: {job.id}) for tenant '{tenant.name if tenant else 'default'}'")

        # Execute agentic turn
        result = skill_engine.process_chat(
            db=db,
            tenant=tenant,
            session_id=job.session_id or f"schedule_{job.id}",
            user_message=job.prompt,
            model_name=job.model_name,
            request_source="scheduler",
            skill_names=skill_names,
            user_data=user_data,
            persist=bool(job.store_in_session),
            webhook_url=job.notify_webhook or (tenant.default_webhook_url if tenant else None),
        )

        answer = result.get("response", "") or ""

        # Update execution metadata (all notifications/emails/webhooks are 100% LLM-driven via tool calls)
        job.last_run_at = datetime.utcnow()
        job.run_count = (job.run_count or 0) + 1
        job.last_result = answer[:2000] if answer else "Execution completed cleanly."
        job.last_error = None

        # One-off date jobs must be automatically marked inactive upon completion
        if job.trigger_type == "date":
            job.is_active = False
            job.next_run_at = None

        # Calculate next_run_at from APScheduler if available
        global _global_scheduler
        if _global_scheduler and _global_scheduler.running and job.is_active:
            sched_job = _global_scheduler.get_job(job.id)
            if sched_job and sched_job.next_run_time:
                job.next_run_at = sched_job.next_run_time.replace(tzinfo=None)

        db.commit()
        print(f"[Scheduler] Finished job '{job.name}' (Run count: {job.run_count})", flush=True)
        logger.info(f"[Scheduler] Finished job '{job.name}' (Run count: {job.run_count})")

    except Exception as e:
        print(f"[Scheduler] Error executing scheduled job {job_id}: {e}", flush=True)
        logger.error(f"[Scheduler] Error executing scheduled job {job_id}: {e}")
        if job:
            job.last_error = str(e)
            job.last_run_at = datetime.utcnow()
            if job.trigger_type == "date":
                # Deactivate one-off date jobs even on failure to avoid repeat cascades
                job.is_active = False
                job.next_run_at = None
            db.commit()
    finally:
        db.close()
