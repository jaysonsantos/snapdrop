FROM ghcr.io/linuxserver/baseimage-alpine:3.22

ENV HOME="/app" \
    BUN_INSTALL="/usr/local" \
    NODE_ENV="production" \
    PORT="3000" \
    XDG_CONFIG_HOME="/config" \
    XDG_DATA_HOME="/config"

RUN \
  apk add --no-cache \
    caddy \
    libgcc \
    libstdc++ && \
  apk add --no-cache --virtual .bun-fetch-deps \
    curl \
    unzip && \
  curl -fsSL https://bun.sh/install | bash && \
  mkdir -p \
    /app/www \
    /config/caddy && \
  apk del .bun-fetch-deps && \
  rm -rf /root/.bun /tmp/* /var/cache/apk/* && \
  chown -R abc:abc \
    /app \
    /config

COPY package.json bun.lock /app/www/
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
  cd /app/www && \
  bun install --frozen-lockfile --production && \
  rm -f /app/www/package.json /app/www/bun.lock && \
  chown -R abc:abc /app

EXPOSE 2024

VOLUME /config
