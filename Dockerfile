FROM ghcr.io/linuxserver/baseimage-alpine:3.22

ENV HOME="/app" \
    NODE_ENV="production" \
    PORT="3000" \
    XDG_CONFIG_HOME="/config" \
    XDG_DATA_HOME="/config"

RUN \
  apk add --no-cache \
    caddy \
    nodejs \
    npm && \
  mkdir -p \
    /app/www \
    /config/caddy && \
  chown -R abc:abc \
    /app \
    /config

COPY client /app/www/client
COPY server /app/www/server
COPY Caddyfile /app/Caddyfile
COPY root/ /

RUN \
  chmod 755 \
    /etc/s6-overlay/s6-rc.d/init-snapdrop-config/run \
    /etc/s6-overlay/s6-rc.d/init-snapdrop-config/up \
    /etc/s6-overlay/s6-rc.d/svc-node/run \
    /etc/s6-overlay/s6-rc.d/svc-caddy/run && \
  cd /app/www/server && \
  npm ci --omit=dev && \
  chown -R abc:abc /app

EXPOSE 2024

VOLUME /config
