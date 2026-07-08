# Deployment Runbook — Lecture Studio

Production deployment for the three moving parts of Lecture Studio:

| Part | What | Where |
| --- | --- | --- |
| **Database** | Postgres + Auth + Storage | Supabase (hosted project) |
| **App** | Next.js 15 App Router (RSC + Server Actions) | Vercel (or any Node host) |
| **Worker** | Standalone poll-loop for code execution + image/demo builds | A **Docker host** (NOT Vercel) |

> **Main infra requirement.** Both sandboxed **code execution** and **marimo
> demo builds** run inside Docker containers launched by the worker. They do
> **not** work without a long-lived worker process that has access to a Docker
> daemon. Vercel cannot host the worker (no persistent process, no Docker
> daemon). Plan for a separate Docker host up front — see [§3](#3-worker).

Env var reference: [`.env.production.example`](../.env.production.example).

---

## 1. Supabase (database)

Migrations are the source of truth: `supabase/migrations/0001_init.sql` …
`0008_student_execution.sql`, `0009_student_execution_rls_fix.sql`
(**9 migrations, 0001–0009**).

```bash
# One-time auth. Either interactive login…
supabase login
# …or a CI token:
export SUPABASE_ACCESS_TOKEN=<personal-access-token>

# Link this repo to the hosted project (find <ref> in the dashboard URL /
# Project Settings → General → Reference ID).
supabase link --project-ref <project-ref>

# Push all local migrations (0001–0009) to the cloud database.
supabase db push
```

Notes:

- **Idempotency.** `supabase db push` applies only migrations not yet recorded
  in the remote `supabase_migrations.schema_migrations` table, so re-running it
  is safe and a no-op once everything is applied. Never run `supabase db reset`
  against production — it drops and recreates the database.
- **Storage bucket.** The public `demos` bucket is created by
  `0005_demos.sql` (`insert into storage.buckets … ('demos','demos',true)`
  plus a `demos_public_read` policy). This is plain SQL, so `supabase db push`
  creates it in the cloud too — no manual bucket step. After push, confirm in
  **Dashboard → Storage** that `demos` exists and is public, and that write
  access is restricted (only the worker's service role — which bypasses RLS —
  uploads bundles; there is intentionally no client write policy).
- **RLS helpers & admin gate.** `is_course_member` / `is_course_readable`
  (0001), `app_admins` (0003), the runtime/execution tables + claim RPCs
  (0004), demos (0005), the student-execution opt-in + rate-limit trigger
  (0008), and the student-execution RLS hardening — closing the REST
  arbitrary-insert gap and the runtimes visibility gap
  (`0009_student_execution_rls_fix.sql`) — all ship as migrations, nothing
  extra to configure.

### Seeding production

The dev seed (`supabase/seed.sql`, `scripts/dev-users.ts`,
`scripts/ingest-seed.ts`) is **for local dev only** — it creates the CS-201
demo course and the `author@example.com` / `student@example.com` accounts.
**Do not** run it against production. Real courses are authored in-app.

If you *do* want the demo course content in a staging environment, run the
ingest against the cloud (never the dev users):

```bash
# Loads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the env.
npx jiti scripts/ingest-seed.ts
```

### First platform admin

`app_admins` has **no client write policy** (writes are service-role only), so
you cannot self-promote from the UI. After the intended owner signs up
normally (email/password via Supabase Auth), insert the first admin row by
hand — **Dashboard → SQL Editor**:

```sql
-- Find the new user's id:
select id, email from auth.users where email = 'owner@yourorg.com';

-- Grant platform admin (replace the uuid):
insert into app_admins (user_id)
values ('<user-uuid>')
on conflict (user_id) do nothing;
```

That user can then manage AI provider keys and the Runtime Studio from
**Admin** in the app. Subsequent admins can be added the same way (or via any
tooling you build on top of the service role).

---

## 2. App (Next.js → Vercel)

1. Import the repo into Vercel. Framework preset **Next.js** is auto-detected
   (default build command `next build`, output handled by Vercel).
2. Set **Environment Variables** (Production, and Preview if used):

   | Var | Notes |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Public project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Server-only |

3. Deploy.

Security notes:

- `SUPABASE_SERVICE_ROLE_KEY` is used **only server-side** — inside Server
  Actions, RSC, and route handlers (e.g. `components/execution/actions.ts`,
  `lib/supabase/server.ts`). It is never referenced by a Client Component, so
  it is not shipped in the browser bundle. Keep it out of any `NEXT_PUBLIC_*`
  name.
- All user-facing access goes through the anon key + RLS. The service role is
  the trusted bootstrap/queueing path only.
- AI provider keys are **not** Vercel env vars — they are stored in the DB and
  managed from the in-app Admin → LLM UI.

The app can queue executions and demo builds as soon as it is up, but those
jobs stay `queued` until the worker (below) is running.

---

## 3. Worker

The worker (`npm run worker` → `jiti worker/index.ts`) is a standalone process
that polls Supabase and, for each job, shells out to `docker`:

- `runtime_builds` → `docker build` a per-course python image, then an import
  smoke test (`worker/build.ts`)
- `executions` → `docker run` student/author code in a locked sandbox
  (`worker/execute.ts`)
- `marimo_apps` → `docker run` to export a notebook to a WASM bundle uploaded
  to the `demos` bucket (`worker/demo.ts`)

It connects to the **same** Supabase project as the app, using
`SUPABASE_SERVICE_ROLE_KEY`, and can be scaled to multiple replicas safely (job
claims use `FOR UPDATE SKIP LOCKED`).

### Build the image

From the **repo root** (build context = repo root):

```bash
docker build -f worker/Dockerfile -t lecture-studio-worker .
```

### ⚠️ Docker-in-Docker isolation (the sharpest production risk)

The worker needs a Docker daemon. Either:

- **(a) mount the host socket:** `-v /var/run/docker.sock:/var/run/docker.sock`, or
- **(b) point at a remote daemon:** `-e DOCKER_HOST=tcp://<host>:2376` (with TLS).

Mounting `docker.sock` gives the worker container control of the host daemon,
which is **host-root-equivalent** — a container that can create containers can
mount the host filesystem. The *job* containers are already locked down
(`--network none`, non-root, pinned `--memory`/`--memory-swap`, `--cpus 1`,
`--pids-limit 256`, `--rm`, hard timeouts — **do not weaken these**), but the
worker's own daemon access is the trust boundary.

**Run the worker on a dedicated, sacrificial Docker host** that carries nothing
else sensitive, and prefer an isolating runtime: **rootless Docker**, **Sysbox**,
or a **remote `DOCKER_HOST`** on a throwaway VM. Never co-locate the worker +
`docker.sock` with the public web app.

### Recipe A — generic VM (Docker host)

On an Ubuntu VM with Docker installed:

```bash
# Pull/build the image on the box, then run it against the host daemon.
docker run -d --name lecture-worker --restart unless-stopped \
  -e NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co" \
  -e SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  lecture-studio-worker

docker logs -f lecture-worker    # expect: "[worker] started (poll 1000ms)…"
```

Harden per the caveat above (dedicated host / rootless / Sysbox). For a remote
daemon instead of the socket mount, drop the `-v` and add
`-e DOCKER_HOST=tcp://<host>:2376` plus the TLS cert mounts your daemon requires.

### Recipe B — Fly.io machine

Vercel can't run this, but a Fly **Machine** with a Docker daemon can. Sketch:

```toml
# fly.toml (worker app) — no [http_service]; this is a background worker.
app = "lecture-studio-worker"
[build]
  dockerfile = "worker/Dockerfile"
[env]
  WORKER_POLL_MS = "1000"
```

```bash
fly launch --no-deploy --dockerfile worker/Dockerfile
fly secrets set \
  NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
fly deploy
```

The worker still needs a Docker daemon: either enable a docker-in-docker /
Sysbox-style setup on the Machine, or set `DOCKER_HOST` (a `fly secret`) to a
separate daemon VM. A plain Fly Machine has no daemon by default — provision
one, or use **Recipe A** on a VM you control. The isolation caveat applies
equally here.

---

## 4. Go-live checklist

- [ ] `supabase link --project-ref <ref>` then `supabase db push` → migrations
      0001–0009 applied (incl. `0009_student_execution_rls_fix.sql`; verify in
      **Database → Migrations**).
- [ ] `demos` bucket present + public; no client write policy.
- [ ] First `app_admins` row inserted for the owner (after they sign up).
- [ ] Vercel env vars set (`NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`); app deploys
      and loads.
- [ ] Worker image built (`docker build -f worker/Dockerfile .`) and running on
      a Docker host with daemon access; logs show `[worker] started`.
- [ ] Worker isolation reviewed (dedicated host / rootless / Sysbox /
      remote `DOCKER_HOST`).
- [ ] Smoke test: as an elevated member, build a runtime and run an executable
      block; queue a marimo demo build and confirm the public bundle URL loads.
- [ ] Sandbox flags unchanged in `worker/execute.ts` / `worker/build.ts`
      (`--network none`, non-root, pinned memory, `--cpus 1`, `--pids-limit`,
      `--rm`, timeouts).

## 5. Rollback

- **App:** redeploy the previous build in Vercel (instant rollback), or push a
  revert commit.
- **Worker:** `docker stop lecture-worker` (or `fly scale count 0`) halts job
  processing without data loss — queued jobs simply wait. Redeploy the previous
  image tag to restore. A crashed/replaced worker self-recovers orphaned
  `running` jobs on startup (stale-job sweep in `worker/index.ts`).
- **Database:** migrations are forward-only. If a `supabase db push` records a
  migration that failed partway, reconcile history with
  `supabase migration repair --status reverted <version>` (or `applied`), fix
  the SQL, and push again. For data-destructive schema changes, restore from a
  Supabase point-in-time / scheduled backup — always snapshot before a risky
  push. Never `supabase db reset` production.

---

**Cross-references:** env vars → [`.env.production.example`](../.env.production.example);
worker container + docker-in-docker caveat → [`worker/Dockerfile`](../worker/Dockerfile).
