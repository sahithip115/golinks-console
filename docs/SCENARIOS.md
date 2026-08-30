# Scenarios

Author: Sahithi Periketi

Each can be driven from the console's delivery panel, or over HTTP with
`POST /api/v1/deliveries/presets/{scenario}`.

## NEW_BUILD — build the shortcut service

The plan runs, stops at the sign-off gate, and finishes the simulated rollout once a named reviewer
approves. Artifacts appear for every completed phase.

## EXISTING_SYSTEM — harden what already ships

The same graph against a change to live behaviour: keep disabled and retired shortcuts from forwarding
without breaking existing callers.

## UNCLEAR_ASK — work from a vague request

Intake writes down the assumptions it is making and the questions still open, so the ambiguity is visible
rather than silently resolved.

## Recovery

Choose any scenario and set **Break a phase on purpose** to `BUILD`. The first attempt fails, the second
fails, and the phase falls back to a degraded output — the run still reaches the gate, with
`degraded/build.md` among its artifacts. Set it to `INTAKE` instead and the retry alone is enough.

## Policy halt

*Try a blocked ask* sends a requirement that asks to disable authentication. The run halts before a single
phase executes, with the reason in the audit trail.

## Rejection

Reach the gate and reject. Delivery phases are compensated in reverse order and the run closes as
`COMPENSATED`, while intake and design stay `DONE`.
