# Decision record

Author: Sahithi Periketi

1. **TypeScript everywhere, including the browser.** The console shares the API's vocabulary; typing the
   client caught three field-name mismatches during the build that a plain script would have shipped.
2. **Fastify over Express.** Request ids, a pino logger, hooks, and `app.inject` for tests come with the
   framework rather than as four more dependencies.
3. **Zod for shape, hand-written rules for policy.** Whether a URL is *forwardable* is security policy, so
   it lives in one readable module instead of being buried in a schema chain.
4. **One error envelope, one error handler.** Domain errors carry their own status and code, so the
   handler is a single small function and clients parse one shape.
5. **A dependency graph, not a checklist.** Parallel phases and gates are only meaningful if the plan can
   express them.
6. **Failure gets a ladder, not a flag.** Retry, degrade, compensate — three different situations that a
   boolean would have collapsed into one.
7. **Compensation keeps intake and design.** Undoing analysis that is still true would be theatre.
8. **Codes live under `/go/`.** Keeping them out of `/api` means a code can never shadow an endpoint or
   a static asset, and the prefix is configurable.
9. **Disable rather than delete.** Links already in circulation stop forwarding without losing the record
   of where they pointed.
10. **A disabled or expired code answers 404, not 410.** The caller learns nothing about the destination.
11. **Only fingerprints for usage.** Counting visits does not require keeping who visited.
12. **An injected clock.** Expiry, extension and duration behaviour stays deterministic under test.
13. **Repository interfaces from the start.** The in-memory store is a decision about today, not about
    the shape of the code.
14. **Metrics on a private registry.** Each app instance owns its own, so tests can build several without
    tripping over duplicate metric names.
