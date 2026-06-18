FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV CI=true
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY . .
ENV VITE_API_BASE=""
RUN pnpm build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    SERVER_PORT=3001 \
    UNDERLEAF_DATA_DIR=/data \
    UNDERLEAF_STATIC_DIR=/app/apps/web/dist \
    LATEX_ENGINE=latexmk

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    latexmk \
    texlive-fonts-recommended \
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-luatex \
    texlive-xetex \
    unzip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist

VOLUME ["/data"]
EXPOSE 3001
CMD ["node", "apps/server/dist/index.js"]
