# syntax=docker/dockerfile:1
# Caddy with the app's SPA and the promotion site (decision 101).
# Built from the repository root: docker build -f infra/production/web.Dockerfile .

FROM node:24-slim AS build
RUN npm install --global pnpm@11
WORKDIR /src
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/
RUN pnpm -C frontend install --frozen-lockfile
COPY site/package.json site/pnpm-lock.yaml site/
RUN pnpm -C site install --frozen-lockfile
COPY frontend frontend
RUN pnpm -C frontend build
COPY site site
ARG PUBLIC_APP_URL=https://app.cobradia.com
RUN PUBLIC_APP_URL=$PUBLIC_APP_URL pnpm -C site build

FROM caddy:2
COPY infra/production/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/frontend/dist /srv/app
COPY --from=build /src/site/dist /srv/site
