# syntax=docker/dockerfile:1
# Cobradía API, Celery worker and beat (decision 101). Built from backend/.

# CI builds through a mirror of Docker Hub (REGISTRY=mirror.gcr.io/library).
ARG REGISTRY=docker.io/library
FROM ${REGISTRY}/python:3.14-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
# WeasyPrint (Pango, HarfBuzz) and the fonts of the documents (Inter, then
# a metric-compatible Arial).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 \
       fonts-inter fonts-liberation2 \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -f

FROM base AS build
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY . .

FROM base AS runtime
ARG APP_VERSION=dev
ENV PATH=/opt/venv/bin:$PATH \
    DJANGO_SETTINGS_MODULE=config.settings.production \
    XDG_CACHE_HOME=/tmp/cache \
    APP_VERSION=$APP_VERSION
COPY --from=build /opt/venv /opt/venv
COPY --from=build /app /app
WORKDIR /app
RUN useradd --system --uid 10001 --home /app cobradia \
    && mkdir -p /app/media /app/staticfiles \
    && chown cobradia /app/media /app/staticfiles
USER cobradia
EXPOSE 8000
CMD ["gunicorn", "config.wsgi", "--bind", "0.0.0.0:8000", "--workers", "3", \
     "--timeout", "60", "--access-logfile", "-", "--forwarded-allow-ips", "*",      "--control-socket", "/tmp/gunicorn.ctl"]
