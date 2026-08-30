# GoLinks Console

**Sahithi Periketi**

An internal go-links service, written in TypeScript. Register a shortcut, browse the directory, and open
`/go/<code>` to be forwarded to the destination. A second panel runs the delivery pipeline that ships
changes to the service itself: a plan graph with bounded retries, a degraded fallback, compensation, and
a named sign-off before rollout.

---

## Running it

Requires Node.js 20.11 or newer.

```bash
npm install
npm run build
npm start
```

Console: <http://localhost:8090> · Health: <http://localhost:8090/health> · Metrics: <http://localhost:8090/metrics>

While developing (restarts on change, pretty logs):

```bash
npm run dev
```

Tests and type checking:

```bash
npm test          # 38 tests across the service, the engine, and the HTTP surface
npm run typecheck # server and browser sources
```

### Configuration

Everything is read from the environment once at startup and validated; a bad value stops the process
with a readable message rather than failing later.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8090` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `BASE_URL` | `http://localhost:$PORT` | Prefix used when a short URL is returned |
| `REDIRECT_PREFIX` | `/go` | Path shortcuts are served from |
| `DEFAULT_LIFETIME_DAYS` | `30` | Lifetime when the caller does not choose one |
| `MAX_LIFETIME_DAYS` | `365` | Ceiling for lifetimes and extensions |
| `LOG_LEVEL` | `info` | pino level |
| `SEED_DEMO_DATA` | `true` | Set `false` to start with an empty directory |
| `NODE_ENV` | `development` | `production` switches logs to JSON and enables asset caching |

---

## Using it

1. **Register** — paste a destination, optionally claim an alias, an owner, a note, and a lifetime.
2. **Browse** — search across code, destination, owner and note; copy, extend, disable or re-enable a row.
3. **Open** — `/go/<code>` answers `302` and records a use.
4. **Inspect** — *Usage* shows total uses, uses in the last day, distinct visitors, and top referrers.
5. **Pipeline** — launch a run, watch the plan resolve wave by wave, then approve or reject the rollout.
   *Break a phase on purpose* demonstrates the retry and the degraded fallback; *Try a blocked ask*
   demonstrates the policy halt.

---

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness with per-store checks |
| `GET` | `/metrics` | Prometheus exposition |
| `GET` | `/api/v1/shortcuts?q=` | Directory with counters, optional search |
| `POST` | `/api/v1/shortcuts` | Register a shortcut |
| `GET` | `/api/v1/shortcuts/:code` | Read one shortcut |
| `GET` | `/api/v1/shortcuts/:code/usage` | Usage report |
| `PATCH` | `/api/v1/shortcuts/:code` | `{"enabled":false}` and/or `{"extendByDays":30}` |
| `DELETE` | `/api/v1/shortcuts/:code` | Switch a shortcut off (nothing is deleted) |
| `GET` | `/go/:code` | `302` to the destination |
| `GET` | `/api/v1/deliveries/meta` | Phase list and scenario presets |
| `GET` | `/api/v1/deliveries` | Runs, newest first |
| `POST` | `/api/v1/deliveries` | Launch a run |
| `POST` | `/api/v1/deliveries/presets/:scenario` | Launch from a preset |
| `GET` | `/api/v1/deliveries/:runId` | A run with its plan, audit trail and artifacts |
| `POST` | `/api/v1/deliveries/:runId/sign-off` | Record a named approval or rejection |
| `PUT` | `/api/v1/deliveries/:runId/ask` | Revise the ask and rebuild the plan |
| `GET` | `/api/v1/deliveries/:runId/artifacts/:artifactId` | Read a generated artifact |

```bash
curl -s -X POST http://localhost:8090/api/v1/shortcuts \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/runbook","alias":"runbook","owner":"Platform","lifetimeDays":60}'

curl -si http://localhost:8090/go/runbook | head -3
```

### Errors

Every failure uses one shape, and always carries the request id so a user can quote it and the matching
log line can be found:

```json
{
  "code": "rejected_input",
  "message": "Internal and loopback destinations are refused",
  "fields": { "url": "Internal and loopback destinations are refused" },
  "requestId": "0f2b…",
  "occurredAt": "2026-08-30T14:02:11.418Z"
}
```

| Status | `code` | When |
| --- | --- | --- |
| 400 | `rejected_input` | A value the domain refuses, with the offending field named |
| 400 | `unreadable_body` | The body was not valid JSON |
| 404 | `unknown_record` | Unknown code or run — also a shortcut that is off or retired |
| 405 | `method_not_allowed` | Wrong verb for the path |
| 409 | `state_conflict` | Alias already taken; run is not at the sign-off gate |
| 500 | `internal_error` | Anything unhandled: logged in full server side, never leaked to the caller |

---

## How it is organised

```
src/
  config.ts              environment parsing and validation
  server.ts              wiring: hooks, error handler, health, metrics, routes, static
  main.ts                process entry point and graceful shutdown
  seed.ts                demo rows for the in-memory store
  shared/                errors, clock, ids, logger, metrics, request helpers
  shortcut/              api · domain · repository · service
  delivery/              agent · api · domain · repository · service
  ui/                    browser TypeScript, compiled to public/assets
public/                  index.html, console.css, compiled console modules
tests/                   service, engine, and HTTP-surface tests
docs/                    architecture, decisions, scenarios
```

Both feature modules keep the same four layers, so finding one class tells you where the rest live.
Services depend on a repository interface and an injected clock, never on a concrete store or on
`Date.now()` — which is what makes the expiry tests deterministic and a real database a drop-in change.

### Observability

- **Structured logs** (pino): one line per request tagged with `reqId`, and domain events written
  through the request logger — `shortcut registered`, `shortcut switched off`, `delivery run launched`,
  `sign-off recorded` — carry the same id. The engine's own lifecycle lines (`delivery run closed`,
  `run halted by change policy`) are tagged with `runId` instead, since a run outlives the request that
  started it; joining those to a request is on the list below. Authorization, cookie and forwarded-for
  headers are redacted.
- **Request ids**: generated per request, or taken from an inbound `x-request-id`, echoed on the
  response header, and included in every error body.
- **Metrics** at `/metrics`: request counts and durations by route and status, shortcuts registered,
  forwards by outcome, runs launched and closed by state, retries and degrades by phase, plus the
  default process metrics.
- **Health** at `/health`: status, uptime, and a per-store check block.

### Accessibility

Landmarks and one `h1` per panel; a skip link; tabs that follow the ARIA pattern (arrow keys move,
only the active tab is tabbable); every control has a real `<label>`; errors are announced through
`role="alert"` and focus moves to the field the API blamed; `aria-invalid` marks it; the toast is a
polite live region; the table scroller is keyboard reachable; focus is always visible; colours are
checked for contrast, and `prefers-reduced-motion` is respected.

---

## Assumptions I made

- **Internal tool, trusted network.** There is no login. Everyone who can reach the console can register
  and disable shortcuts. Adding SSO would not change the shape of the code, but it is not here.
- **Anyone may retire anyone's shortcut.** `owner` is a label for search, not an ownership check.
- **Codes are case-insensitive** and stored lower-cased, because people type them from memory.
- **A disabled or expired shortcut is indistinguishable from one that never existed** (404). That is a
  deliberate choice not to leak destinations.
- **Usage means "how much is this used", not "who used it"** — so only truncated digests are stored, and
  the answer to "which person opened this link" is intentionally unavailable.
- **A day is 24 hours.** No timezone or daylight-saving arithmetic; expiry is measured in milliseconds.
- **Rollout is simulated.** The pipeline is about the control flow around a change, so nothing external
  is deployed and the audit trail is the evidence.
- **The delivery phase workers produce fixed text.** They stand in for real tooling; substituting a real
  build or test runner means replacing a worker, not the engine.
- **Single instance.** State lives in the process, so a restart clears it and a second instance would not
  share it.

## Trade-offs I chose

- **In-memory stores instead of a database.** Two commands to run the project with no service to install,
  and the repository interfaces keep the swap small. The cost is that data does not survive a restart and
  the app cannot be scaled horizontally — which is why the persistence work is first on the list below.
- **Five runtime dependencies, and nothing else.** Fastify for routing and JSON, `@fastify/static` to
  serve the console, Zod so each validation rule has one home, pino for structured logs with request ids,
  and prom-client for the metrics format everything already speaks. No ORM, no UI framework, no test
  framework beyond Vitest.
- **Zod at the edge, domain rules in the service.** Schemas cover shape, length and type; whether a
  destination is *forwardable* lives in `destination-rules.ts` where it can be read as security policy
  rather than as validation trivia. Both surface identically to the caller.
- **The browser console is TypeScript compiled to plain ES modules**, not a framework app. The UI is two
  panels and a table; React would have added a build pipeline and a dependency tree for no benefit here.
  It does mean the DOM updates are written by hand.
- **A soft delete.** `DELETE` switches a shortcut off rather than removing it, so a link already in
  circulation stops working while the record of where it pointed survives for audit.
- **The engine is synchronous within a wave.** Phase workers are pure and fast, so the code reads as
  straight-line logic; real workers would make each wave a `Promise.all` and the engine `async`.
- **Failure has a ladder, not a flag** — retry, then degrade where it is honest to do so, then compensate.
  More code than "throw and stop", and it is the part of the system worth having.
- **Compensation keeps intake and design.** Undoing analysis that is still accurate would be theatre.
- **Node ids stay internal.** The API speaks in phases, which survive a replan and mean something to a
  reader; the trade-off is that a replan cannot be diffed node-by-node against the previous plan.

## If I had another day

1. **Persistence.** Put PostgreSQL behind the two repository interfaces with a migration, and add the
   unique index on `code` that the in-memory store currently enforces in application code. This is the
   one gap that blocks running more than one instance.
2. **Authentication and ownership.** SSO for the console, an owner recorded from the session, and a rule
   that only the owner or an admin can retire a shortcut. Requires audit rows for who changed what.
3. **A published API contract.** Generate OpenAPI from the Zod schemas (`fastify-type-provider-zod`) and
   serve it, so the endpoint table in this README stops being hand-maintained.
4. **Abuse controls.** Per-IP rate limiting on registration, a deny-list check on destinations, and a
   periodic re-check that a destination still resolves.
5. **Move usage recording off the forwarding path.** Buffer hits and flush them, so a forward never waits
   on the analytics write, and add a small retention job.
6. **Carry the request id into the engine.** Domain events logged from a route already have it; the
   engine's lifecycle lines are keyed by `runId` only, so a run cannot yet be joined to the request that
   started it. Passing the request logger down closes that.
7. **Traces to sit beside the logs and metrics.** OpenTelemetry spans through the engine would show a
   wave's phases side by side, which is exactly what the graph claims to do.
8. **Browser tests and an axe pass in CI.** The accessibility work is hand-checked; it should be enforced.
9. **A dedicated audit view.** The trail is rendered inline today; filtering by phase or kind would make
   a long run readable.
