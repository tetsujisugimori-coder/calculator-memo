# Independent Stage 3B-11 review controls

2026-11-14 JST. Separate reviewer, same Linux executor; not external human review or physical-device evidence.

## P2: UNKNOWN in another page did not stop a prepared request

Two pages prepare token generation 0. A aborts its update and persists UNKNOWN. B's previously prepared different operation then incorrectly returned VERIFIED and changed current to C. Initial fixture SHA-256: `5f454e3442f0a9454c0d273160c294826dbb4efd1194172387d67d0983620b7f`. Fixed implementation rejects other unresolved reservations and repeats the condition in the commit transaction. Unchanged independent Chromium sequence then returned A=UNKNOWN, B=REJECTED, current=A. Raw before/after results are `cross-page-red.json` and `cross-page-green.json`. These recorded dirty implementation source hashes, not final-HEAD CI success. The earlier reviewer harness TypeError happened before browser launch and is not the product RED.

Reproduce the preserved defect and verify the current implementation from repository root:

```
node docs/maintenance/storage-atomic-stage3b11/independent/cross-page-unknown.mjs --original
node docs/maintenance/storage-atomic-stage3b11/independent/cross-page-unknown.mjs
```

Each creates a fresh native Chromium context and UUID-only IDB, closes and deletes the synthetic DB, then records new immutable evidence under ignored `gui-evidence/atomic-independent-*`. `--original` means the deliberately defective preserved fixture source; detecting its violation is a RED-control success, never normal acceptance. Both modes leave product authority false. Browser setup failures do not satisfy either control.

## P2: auditor false acceptance

The original auditor accepted a synthetic sparse native transaction chain without transaction start/read/write-request-success. It also accepted mutations of the original successful A row from an **incomplete** Chromium campaign at `52fb6ec06345169440c2211746ce4942eac6bdc8`: missing commit read, state-only scope, and committed receipt payload inconsistent with current. Raw row, original auditor, fixed input hashes and initial acceptance outcomes are retained. The original campaign is NOT full acceptance, and its successful A row is only a compatible oracle input.

```
node --test docs/maintenance/storage-atomic-stage3b11/independent/auditor-counterexamples.node-test.mjs
```

The tests require unchanged original input to remain accepted, demonstrate old false acceptance, assert each fixed counterexample SHA-256, and demand current rejection. `provenance.json` records source files' hashes at collection; final execution/CI results belong in the PR. Tests of mutated evidence do not prove browser behavior or artifact authenticity.
