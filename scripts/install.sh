#!/usr/bin/env bash
#
# scripts/install.sh — one-command installer for a fresh server.
#
# Idempotent, POSIX-ish bash. Detects host resources, verifies prerequisites,
# installs deps, brings up the database (local Supabase or a remote project),
# applies migrations, optionally seeds dev data, prints the host-aware worker
# tuning + recommended env, builds Next, and explains how to start everything.
#
# It does NOT run any destructive reset (no `supabase db reset`) and never
# commits anything. Re-running it is safe.
#
# Usage:
#   scripts/install.sh                 # local Supabase stack (default)
#   SUPABASE_MODE=remote scripts/install.sh   # remote/hosted Supabase project
#
# Env knobs:
#   SUPABASE_MODE   local (default) | remote
#   PORT            Next.js port (default 3000)
#   PUBLIC_HOST     External base URL for remote serving (see NEXT_PUBLIC caveat)
#   SEED            1 to run dev seed/users (local only), 0 to skip (default 0)
#   SKIP_BUILD      1 to skip `next build`
#   WORKER_MAX_CONCURRENCY / JOB_MEMORY_MB / JOB_CPUS / JOB_TIMEOUT_SECONDS
#                   forwarded to the tuning preview so you can try overrides.
#
set -euo pipefail

# Resolve repo root from this script's location (works from any CWD).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

SUPABASE_MODE="${SUPABASE_MODE:-local}"
PORT="${PORT:-3000}"
SEED="${SEED:-0}"
SKIP_BUILD="${SKIP_BUILD:-0}"

# ── pretty output ────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  BOLD=$(printf '\033[1m'); GREEN=$(printf '\033[32m'); YELLOW=$(printf '\033[33m')
  RED=$(printf '\033[31m'); CYAN=$(printf '\033[36m'); RESET=$(printf '\033[0m')
else
  BOLD=""; GREEN=""; YELLOW=""; RED=""; CYAN=""; RESET=""
fi
step() { printf '\n%s==> %s%s\n' "$BOLD$CYAN" "$1" "$RESET"; }
ok()   { printf '%s  ✓ %s%s\n' "$GREEN" "$1" "$RESET"; }
warn() { printf '%s  ! %s%s\n' "$YELLOW" "$1" "$RESET"; }
die()  { printf '%s  ✗ %s%s\n' "$RED" "$1" "$RESET" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# ── 1. prerequisites ─────────────────────────────────────────────────────────
step "1/7  Checking prerequisites"

have node || die "node not found. Install Node.js >= 20 (https://nodejs.org)."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node.js >= 20 required, found $(node --version)."
fi
ok "node $(node --version)"

have npm || die "npm not found (should ship with Node)."
ok "npm $(npm --version)"

if have docker; then
  if docker version --format '{{.Server.Version}}' >/dev/null 2>&1; then
    ok "docker $(docker version --format '{{.Server.Version}}' 2>/dev/null) (daemon reachable)"
  else
    warn "docker CLI found but the daemon is not reachable — the worker needs it to run/build. Start Docker before running the worker."
  fi
else
  warn "docker not found. Runtime builds and code execution will not work until Docker is installed."
fi

# ── 2. dependencies ──────────────────────────────────────────────────────────
step "2/7  Installing dependencies (npm ci)"
if [ -f package-lock.json ]; then
  npm ci
else
  warn "no package-lock.json — falling back to npm install"
  npm install
fi
ok "dependencies installed"

# ── 3. database ──────────────────────────────────────────────────────────────
step "3/7  Database ($SUPABASE_MODE)"
SUPABASE_BIN="npx --no-install supabase"
$SUPABASE_BIN --version >/dev/null 2>&1 || SUPABASE_BIN="npx supabase"

if [ "$SUPABASE_MODE" = "local" ]; then
  if ! have docker; then
    die "local Supabase needs Docker. Install Docker or use SUPABASE_MODE=remote."
  fi
  # `supabase start` is idempotent: a no-op if the stack is already up.
  $SUPABASE_BIN start
  ok "local Supabase running"

  # Write .env.local from `supabase status` if it doesn't already exist.
  if [ ! -f .env.local ]; then
    step "   Writing .env.local from supabase status"
    STATUS="$($SUPABASE_BIN status -o env 2>/dev/null || true)"
    API_URL="$(printf '%s\n' "$STATUS"   | sed -n 's/^API_URL="\{0,1\}\([^"]*\)"\{0,1\}/\1/p')"
    ANON_KEY="$(printf '%s\n' "$STATUS"  | sed -n 's/^ANON_KEY="\{0,1\}\([^"]*\)"\{0,1\}/\1/p')"
    SR_KEY="$(printf '%s\n' "$STATUS"    | sed -n 's/^SERVICE_ROLE_KEY="\{0,1\}\([^"]*\)"\{0,1\}/\1/p')"
    {
      echo "NEXT_PUBLIC_SUPABASE_URL=${API_URL:-http://127.0.0.1:54321}"
      echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY:-placeholder-anon-key}"
      echo "SUPABASE_SERVICE_ROLE_KEY=${SR_KEY:-}"
    } > .env.local
    ok ".env.local written"
  else
    ok ".env.local already present (left untouched)"
  fi

  step "   Applying migrations (supabase migration up)"
  $SUPABASE_BIN migration up || warn "migration up reported an issue — verify with 'supabase migration list'"
  ok "migrations applied (0001–0009)"
else
  # Remote / hosted project. We never guess credentials; we require them.
  step "   Remote Supabase — required env"
  cat <<EOF
  Set these before running (from your project's dashboard → Project Settings → API):
    export NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
    export NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
    export SUPABASE_SERVICE_ROLE_KEY=<service role key>   # server/worker only, keep secret
    export SUPABASE_ACCESS_TOKEN=<personal access token>  # for db push
EOF
  if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    warn "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping migration push."
    warn "Once set, run:  $SUPABASE_BIN db push"
  else
    step "   Pushing migrations (supabase db push)"
    $SUPABASE_BIN db push || warn "db push reported an issue — check 'supabase migration list'"
    ok "migrations pushed"
  fi
fi

# ── 4. optional seed ─────────────────────────────────────────────────────────
step "4/7  Seed data"
if [ "$SUPABASE_MODE" = "local" ] && [ "$SEED" = "1" ]; then
  # jiti ships in node_modules; the scripts read .env.local from CWD.
  npx jiti scripts/dev-users.ts   || warn "dev-users seed failed (non-fatal)"
  npx jiti scripts/ingest-seed.ts || warn "ingest-seed failed (non-fatal)"
  ok "dev seed applied (author@example.com / student@example.com)"
else
  ok "skipped (SEED=1 with SUPABASE_MODE=local to enable; never seed production)"
fi

# ── 5. host tuning preview ───────────────────────────────────────────────────
step "5/7  Detected host tuning"
# Print the exact limits this box will adopt for the worker. Honors the
# WORKER_MAX_CONCURRENCY / JOB_MEMORY_MB / JOB_CPUS / JOB_TIMEOUT_SECONDS envs.
npx jiti scripts/print-tuning.ts || warn "could not compute tuning (non-fatal)"
cat <<EOF

  ${BOLD}Recommended env${RESET} (auto-tuning picks sane defaults; override only if needed):
    # WORKER_MAX_CONCURRENCY=<n>   # cap concurrent code-execution jobs
    # JOB_MEMORY_MB=<mb>           # per-job memory (default host-scaled)
    # JOB_CPUS=<n>                 # per-job cpus
    # JOB_TIMEOUT_SECONDS=<s>      # per-execution timeout (default 30)
    # WORKER_POLL_MS=1000          # queue poll interval
EOF

# ── 6. build ─────────────────────────────────────────────────────────────────
step "6/7  Build"
if [ "$SKIP_BUILD" = "1" ]; then
  warn "SKIP_BUILD=1 — skipping 'next build'"
else
  # IMPORTANT: NEXT_PUBLIC_SUPABASE_URL is BAKED into the client bundle at build
  # time. If you will serve this to browsers on another host, set it to the URL
  # those browsers can reach BEFORE building — not 127.0.0.1.
  if [ "$SUPABASE_MODE" = "local" ] && [ -n "${PUBLIC_HOST:-}" ]; then
    warn "PUBLIC_HOST set with a LOCAL stack: browsers on other machines cannot reach 127.0.0.1."
    warn "For remote serving, point NEXT_PUBLIC_SUPABASE_URL at a reachable address before building."
  fi
  npm run build
  ok "Next build complete"
fi

# ── 7. summary ───────────────────────────────────────────────────────────────
step "7/7  Summary — how to start"
cat <<EOF

  ${GREEN}${BOLD}Install complete.${RESET} Two long-lived processes to run:

  ${BOLD}1) Next.js app${RESET} (port ${PORT}):
       PORT=${PORT} npm run start        # or: next start -p ${PORT}

  ${BOLD}2) Worker${RESET} (needs Docker; auto-tunes concurrency to this host):
       npm run worker

  ${BOLD}Preview the tuning any time:${RESET}
       npm run tuning

  ${BOLD}Client-bundle URL caveat (NEXT_PUBLIC_SUPABASE_URL):${RESET}
    The Supabase URL is compiled into the browser bundle at ${BOLD}build${RESET} time.
    Serving remotely? Set NEXT_PUBLIC_SUPABASE_URL to the address browsers can
    reach (e.g. https://your-host) ${BOLD}before${RESET} 'npm run build', then rebuild.

  ${BOLD}Docker isolation caveat:${RESET}
    The worker launches sandboxed containers via the Docker daemon. Do NOT
    co-locate the worker + docker.sock on the same host as the public web app
    (see worker/Dockerfile and docs/03-sizing.md).
EOF

ok "done"
