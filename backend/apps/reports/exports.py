"""Background exports (P64, decision 087): the job keeps the screen's
filters; the worker builds the same Table and renders it as PDF or Excel.
Personal data leaves only with G or Au, and is logged as a sensitive read.
"""

import datetime as dt
import logging

from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone

from apps.core.tenancy import on_commit_in_tenant
from apps.reports import catalog, render
from apps.reports.models import ExportJob

logger = logging.getLogger(__name__)
EXPORT_DAYS = 7


class ExportError(Exception):
    pass


def request_export(*, user, report: str, fmt: str, filters: dict) -> ExportJob:
    if not catalog.can_export(user):
        raise ExportError("Tu rol no exporta reportes.")
    if fmt not in ExportJob.Format.values:
        raise ExportError("Formato inválido.")
    clean = {key: str(value) for key, value in filters.items() if value not in (None, "")}
    # Validates the filters and the scope now, so a bad request never queues.
    table = catalog.build(user, report, clean)
    job = ExportJob.objects.create(
        company_id=user.company_id,
        user=user,
        report=report,
        title=table.title,
        filters=clean,
        filters_line=table.filters_line[:400],
        format=fmt,
        personal=table.has_personal and catalog.exports_personal(user),
    )
    from apps.reports.tasks import run_export

    on_commit_in_tenant(
        user.company_id, lambda: run_export.delay(str(user.company_id), str(job.id))
    )
    return job


def run(job: ExportJob) -> ExportJob:
    from apps.audit.models import SensitiveAccessLog

    ExportJob.objects.filter(pk=job.pk).update(status=ExportJob.Status.RUNNING)
    try:
        table = catalog.build(job.user, job.report, job.filters)
        if not job.personal:
            table = table.without_personal() if table.has_personal else table
        maker = render.to_pdf if job.format == ExportJob.Format.PDF else render.to_xlsx
        content = maker(table, company=job.user.company, user=job.user)
    except Exception as exc:  # the job records it; the user sees «Falló»
        logger.exception("Export %s failed", job.pk)
        job.status = ExportJob.Status.FAILED
        job.error = str(getattr(exc, "message", exc))[:300]
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "error", "finished_at", "updated_at"])
        return job
    with transaction.atomic():
        stamp = timezone.localtime().strftime("%Y%m%d-%H%M")
        job.file.save(f"{job.report}-{stamp}.{job.format}", ContentFile(content), save=False)
        job.status = ExportJob.Status.DONE
        job.rows = len(table.rows)
        job.finished_at = timezone.now()
        job.save(update_fields=["file", "status", "rows", "finished_at", "updated_at"])
        if job.personal:
            SensitiveAccessLog.objects.create(
                company_id=job.company_id,
                user=job.user,
                action=SensitiveAccessLog.Action.EXPORT,
                target_type="reports.exportjob",
                target_id=job.id,
                detail=f"{job.title} · {job.filters_line}"[:300],
            )
    return job


def purge(today: dt.date) -> int:
    """Nightly: exported files live ``EXPORT_DAYS`` days."""
    limit = timezone.make_aware(
        dt.datetime.combine(today - dt.timedelta(days=EXPORT_DAYS), dt.time())
    )
    expired = 0
    for job in ExportJob.objects.filter(status=ExportJob.Status.DONE, finished_at__lt=limit):
        job.file.delete(save=False)
        job.status = ExportJob.Status.EXPIRED
        job.save(update_fields=["file", "status", "updated_at"])
        expired += 1
    return expired
