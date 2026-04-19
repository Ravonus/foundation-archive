FROM node:22-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN corepack enable
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml .npmrc ./
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile

COPY . .

ARG SKIP_ENV_VALIDATION=1
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_ARCHIVE_SOCKET_URL=http://127.0.0.1:43129
ARG NEXT_PUBLIC_UMAMI_SCRIPT_URL=
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID=

ENV NODE_ENV=production
ENV SKIP_ENV_VALIDATION=$SKIP_ENV_VALIDATION
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_ARCHIVE_SOCKET_URL=$NEXT_PUBLIC_ARCHIVE_SOCKET_URL
ENV NEXT_PUBLIC_UMAMI_SCRIPT_URL=$NEXT_PUBLIC_UMAMI_SCRIPT_URL
ENV NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID

RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start", "--hostname", "0.0.0.0", "--port", "3000"]
