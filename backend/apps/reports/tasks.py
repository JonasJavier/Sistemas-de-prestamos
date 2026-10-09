from celery import shared_task

from apps.core.tenancy import company_context


@shared_task
def run_export(company_id: str, job_id: str) -> str:
    """Builds and renders one export inside its company (RLS)."""
    from apps.reports import exports
    from apps.reports.models import ExportJob

    with company_context(company_id):
        job = ExportJob.objects.select_related("user__company").get(pk=job_id)
        return exports.run(job).status
