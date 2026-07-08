# =============================================================================
# worker/Dockerfile — Lecture Studio standalone execution / build worker.
#
# This containerizes the STANDALONE poll-loop worker (`npm run worker`, i.e.
# `jiti worker/index.ts`) that is NOT part of the Next.js app. It claims and
# processes three job types from Supabase (service role):
#   - runtime_builds   → `docker build` a per-course python runtime image
#   - executions       → `docker run` sandboxed student/author code
#   - marimo_apps      → `docker run` to export a marimo notebook to a WASM bundle
#
# Build from the REPO ROOT (build context = repo root) so package-lock.json and
# the source dirs are visible:
#     docker build -f worker/Dockerfile -t lecture-studio-worker .
#
# -----------------------------------------------------------------------------
# ⚠️  DOCKER-IN-DOCKER CAVEAT — READ BEFORE DEPLOYING (sharpest production risk)
# -----------------------------------------------------------------------------
# The worker shells out to the `docker` CLI; it does NOT run its own daemon.
# It therefore needs to talk to a Docker daemon. Two options:
#
#   (a) Mount the host socket:   -v /var/run/docker.sock:/var/run/docker.sock
#   (b) Point at a remote daemon: -e DOCKER_HOST=tcp://<host>:2376 (+TLS)
#
# SECURITY: mounting /var/run/docker.sock grants the worker container control
# of the host Docker daemon, which is HOST-ROOT-EQUIVALENT. A container that
# can create containers can mount the host filesystem and escape. Even though
# every *job* container is launched with a locked-down sandbox (--network none,
# non-root, pinned --memory/--memory-swap, --cpus 1, --pids-limit 256, --rm,
# hard timeouts — see worker/execute.ts / worker/build.ts), the WORKER's own
# access to the daemon is the trust boundary.
#
# PRODUCTION RECOMMENDATION: run this worker on a DEDICATED Docker host that
# runs nothing else sensitive, OR use an isolating runtime for the worker:
#   - rootless Docker  (daemon runs as a non-root user), or
#   - Sysbox runtime   (unprivileged, isolated docker-in-docker), or
#   - a remote DOCKER_HOST daemon on a throwaway/sacrificial VM.
# Never co-locate this worker + docker.sock with the public web app on one host.
# =============================================================================

FROM node:20-slim

# --- Docker CLI (client only) -------------------------------------------------
# The worker only needs the `docker` *client* binary — the daemon is external
# (host socket or DOCKER_HOST, see caveat above). We extract just the client
# from Docker's official static bundle rather than pulling the full engine via
# apt, keeping the image small and free of a bundled daemon we never start.
ARG DOCKER_CLI_VERSION=27.5.1
ARG TARGETARCH
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl; \
    case "$(uname -m)" in \
      x86_64)  DOCKER_ARCH=x86_64 ;; \
      aarch64) DOCKER_ARCH=aarch64 ;; \
      *) echo "unsupported arch $(uname -m)" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://download.docker.com/linux/static/stable/${DOCKER_ARCH}/docker-${DOCKER_CLI_VERSION}.tgz" -o /tmp/docker.tgz; \
    tar -xzf /tmp/docker.tgz -C /tmp docker/docker; \
    install -m 0755 /tmp/docker/docker /usr/local/bin/docker; \
    rm -rf /tmp/docker /tmp/docker.tgz; \
    apt-get purge -y --auto-remove curl; \
    rm -rf /var/lib/apt/lists/*; \
    docker --version

WORKDIR /app

# --- Dependencies -------------------------------------------------------------
# `npm ci` installs the FULL, lockfile-pinned tree (including devDependencies):
# the worker is executed by `jiti` (a transitive of tailwindcss/vite in the dev
# tree) which transpiles the TypeScript on the fly, so a prod-only install would
# omit it. Deterministic via package-lock.json.
COPY package.json package-lock.json ./
RUN npm ci

# --- Worker source ------------------------------------------------------------
# Copy ONLY what the worker actually imports — the worker package plus the three
# leaf lib modules it depends on (all relative imports, no `@/` path aliases):
#   worker/*                     the poll loop + job processors + docker wrapper
#   lib/runtime/{dockerfile,types}.ts, lib/supabase/types.ts  (+ siblings)
#   tsconfig.json                jiti/TS module resolution
# App code (app/, components/, next.config.mjs) is intentionally NOT copied — it
# never runs here. This also avoids clobbering the freshly installed
# node_modules with any host copy, so no .dockerignore is required.
COPY tsconfig.json ./
COPY lib ./lib
COPY worker ./worker

# Required env (see .env.production.example):
#   NEXT_PUBLIC_SUPABASE_URL   — same Supabase project the app uses
#   SUPABASE_SERVICE_ROLE_KEY  — trusted server-side key (bypasses RLS)
# Optional:
#   WORKER_POLL_MS             — poll interval, default 1000
#   DOCKER_HOST                — remote daemon instead of a mounted socket
ENV NODE_ENV=production

# The poll loop handles SIGINT/SIGTERM to drain the in-flight job before exit.
CMD ["npm", "run", "worker"]
