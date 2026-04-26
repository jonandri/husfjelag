import os
from celery import Celery
from celery.signals import task_failure

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("husfelag")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


@task_failure.connect
def report_task_failure_to_bugsnag(
    sender=None, task_id=None, exception=None,
    args=None, kwargs=None, traceback=None, einfo=None, **kw
):
    """Catch any unhandled Celery task exception and report it to Bugsnag."""
    import bugsnag
    bugsnag.notify(
        exception,
        context=f"celery:{sender.name if sender else 'unknown'}",
        extra_data={
            "task_id": task_id,
            "task_name": sender.name if sender else None,
            "task_args": str(args),
            "task_kwargs": str(kwargs),
        },
    )
