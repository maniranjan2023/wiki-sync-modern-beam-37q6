# Build stage
FROM node:20-alpine AS builder

# git for scripts/prebuild-git-agents.mjs — it clones each git-native agent's
# own repo at build time (agent dirs are not tracked in the app repo). The
# script falls back to the GitHub tarball API when git is missing, so images
# built from older app repos without this line still work.
RUN apk add --no-cache git

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies. Using `npm install` (not `npm ci`) so that
# `"lyzr-architect-pg": "latest"` resolves fresh on every build — matches
# Netlify's behavior. Tradeoff: non-reproducible builds across time.
RUN npm install --no-audit --no-fund

# Copy source files
COPY . .

# Apply pending drizzle migrations before building (mirrors netlify.toml).
# DATABASE_URL must be provided as a build arg/env by the deploy platform
# (Coolify: mark it as a build variable); skipped when the app has no database.
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}
RUN if [ -n "$DATABASE_URL" ]; then npm run db:migrate; fi

# Git-native agents: prebuild clones each agent's own repo (the app repo
# does not track agent dirs); Coolify supplies these only as build args.
ARG GIT_AGENT_REPOS
ARG GIT_AGENT_REPO_TOKEN
ENV GIT_AGENT_REPOS=${GIT_AGENT_REPOS} GIT_AGENT_REPO_TOKEN=${GIT_AGENT_REPO_TOKEN}

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application (standalone output)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3333

ENV PORT=3333
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
