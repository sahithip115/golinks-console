# Architecture

Author: Sahithi Periketi

## Modules

| Module | Holds |
| --- | --- |
| `config.ts` | Environment parsing, validated once at startup |
| `shared/` | The error taxonomy, injected clock, id and digest helpers, logger, and metric registry |
| `shortcut/` | Registering, searching, forwarding, and reporting on shortcuts |
| `ui/` | Browser TypeScript, compiled to `public/assets` as plain ES modules |

The shortcut feature uses four layers:

- `api` holds Zod schemas, wire views, and route registration.
- `domain` holds types and pure functions.
- `repository` holds the storage interface and in-memory implementation.
- `service` holds the behaviour.

Dependencies point inwards: routes know about services, services know about repositories and the clock,
and domain code knows about nothing. That lets the HTTP surface be tested through `app.inject` with no
sockets, and expiry can be tested with a clock that only moves when a test moves it.

## Request Path

```text
request -> onRequest hook      request id, security headers
        -> route handler       Zod parse -> service call
        -> service             domain rules, repository, metrics
        -> onResponse hook     route-labelled counter + duration histogram
        -> error handler       AppError -> one JSON failure envelope
```

Fastify writes the request and response log lines, each tagged with the request id it generated or
accepted from `x-request-id`. The same id goes onto the response header and into every error body, so a
user can quote the id from a failure and the matching log line can be found.
