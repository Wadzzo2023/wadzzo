# The Wadzzo task server (jobs API, server-sent events, hotspot schedules).
# Build from the repo root:
#   docker build -f apps/express-wadzzo/Dockerfile -t wadzzo-express .
# Run with the variables in apps/express-wadzzo/.env.example:
#   docker run --env-file apps/express-wadzzo/.env -p 4000:8080 wadzzo-express

FROM node:24-slim AS base
RUN corepack enable
WORKDIR /repo

# Only the server and the packages it uses, so other apps' changes don't rebuild it.
FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.10 prune @wadzzo/express --docker

FROM base AS install
# Prisma needs OpenSSL to find the right engine for this system.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=prune /repo/out/json/ ./
# No install scripts yet: the server's postinstall runs `prisma generate`, and the schema is
# only copied in the next step. The client is generated explicitly below.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter "@wadzzo/express..."
COPY --from=prune /repo/out/full/ ./
# The Prisma schema belongs to packages/db, which the server only references by path (see
# apps/express-wadzzo/prisma.config.ts), so turbo prune leaves it out. Prisma looks for
# @prisma/client next to the schema, and packages/db isn't installed here, so the schema is
# put inside the server's own folder for this step.
COPY packages/db/prisma/schema.prisma apps/express-wadzzo/prisma/schema.prisma
RUN pnpm --filter @wadzzo/express exec prisma generate --schema prisma/schema.prisma
RUN pnpm --filter @wadzzo/express build

FROM node:24-slim AS run
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=8080
WORKDIR /repo
COPY --from=install /repo ./
WORKDIR /repo/apps/express-wadzzo
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Started with node directly so the host's SIGTERM reaches the server (it shuts down cleanly).
CMD ["node", "dist/index.js"]
