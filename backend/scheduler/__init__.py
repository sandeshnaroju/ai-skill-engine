"""
backend/scheduler
APScheduler integration, multi-worker polling, and multi-channel notification dispatch.
"""
from .manager import (
    create_scheduler,
    register_job,
    run_scheduled_job,
    _poll_new_jobs,
    get_scheduler,
)
from .notifier import dispatch_notifications

__all__ = [
    "create_scheduler",
    "register_job",
    "run_scheduled_job",
    "_poll_new_jobs",
    "get_scheduler",
    "dispatch_notifications",
]

