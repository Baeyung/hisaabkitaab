# Chromium only, installed onto a slim node base.
#
# Playwright's own image would be one line instead of three, but it ships Firefox and WebKit
# as well and lands at 3.9GB — most of a homeserver's disk for two browsers this never opens.
# `--with-deps chromium` pulls the one browser and exactly the system libraries it needs.
FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json ./

RUN npm install --omit=dev \
    && npx playwright install --with-deps chromium \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/*

COPY server.js ./

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
