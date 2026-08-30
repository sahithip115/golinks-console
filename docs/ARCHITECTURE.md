# Architecture

Author: Sahithi Periketi

## Modules

| Module | Holds |
| --- | --- |
| `config.ts` | Environment parsing, validated once at startup |
| `shared/` | The error taxonomy, the injected clock, id and digest helpers, the logger, the metric registry |
| `shortcut/` | Registering, searching, forwarding, and reporting on shortcuts |
| `delivery/` | The plan graph, the phase workers, and the engine that drives them |
| `ui/` | Browser TypeScript, compiled to `public/assets` as plain ES modules |

Both feature modules use the same four layers — `api`, `domain`, `repository`, `service`. `api` holds
Zod schemas, wire views, and route registration; `domain` holds types and pure functions; `repository`
holds the storage interface and its in-memory implementation; `service` holds the behaviour.

Dependencies point inwards: routes know about services, services know about repositories and the clock,
domain code knows about nothing. That is what lets the whole HTTP surface be tested through
`app.inject` with no sockets, and expiry be tested with a clock that only moves when a test moves it.

## Request path

```
request ──► onRequest hook          request id, security headers
        ──► route handler           Zod parse → service call
        ──► service                 domain rules, repository, metrics
        ──► onResponse hook         route-labelled counter + duration histogram
        ──► error handler           AppError → one JSON failure envelope
```

Fastify writes the request/response log lines, each tagged with the request id it generated or accepted
from `x-request-id`. The same id goes onto the response header and into every error body, so a user can
quote the id from a failure and the exact log line can be found.

## The plan graph

```
INTAKE
  ├─► DESIGN ────────┐
  └─► THREAT_REVIEW ─┴─► BUILD ─┬─► UNIT_CHECKS ───┐
                                ├─► SYSTEM_CHECKS ─┼─► GO_NO_GO ─► SIGN_OFF ─► ROLLOUT
                                └─► DOCUMENTATION ─┘
```

`plan.ts` declares the nodes as rows of (rank, phase, prerequisites). `DeliveryEngine.advance` loops:
collect the nodes whose prerequisites are `DONE`, run that wave, fold the results back in, look again.
`BUILD` and `GO_NO_GO` are join points. `SIGN_OFF` is gated, so the engine stops and hands control to a
person; the API completes that node when the decision arrives.

The console draws the same structure by grouping nodes by graph depth, so what a viewer sees is derived
from the plan rather than hard-coded.

## Where the controls sit

- **Before any work**: the ask is screened. A request to weaken authentication or auditing halts the run
  with nothing executed.
- **During work**: each node has an attempt budget. Spending it falls back to a bounded degraded output
  where the phase allows one; otherwise the run compensates.
- **Before rollout**: a named reviewer approves or rejects. Rejection compensates the delivery phases in
  reverse rank order and keeps intake and design.
- **Throughout**: every transition appends an audit entry, and every completed phase writes markdown with
  a SHA-256 digest.
