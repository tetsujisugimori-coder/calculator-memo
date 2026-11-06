# Stage 3B-4: IndexedDB authority foundation (kickoff)

Issue: [#128](https://github.com/tetsujisugimori-coder/calculator-memo/issues/128)  
Base: `main@f22b854c3ef564513b6aace8f0da1b48a47c461c` (Stage 3B-3 / PR #127 merged)  
Status: **WIP / design and acceptance contract only. No Stage 3B-4 runtime implementation, validation or independent acceptance is claimed by this initial commit.**

## Objective and invariant

The existing localStorage Storage Facade remains the application's only active production writer. Build a separately invoked, asynchronous IndexedDB transaction boundary in synthetic/isolated contexts. No user-origin or production-data writes, no IDB authority switch, and no automated migration.

Do **not** retrofit the synchronous `StorageAdapter` by casting a `Promise`: request completion differs from transaction completion. Preserve Stage 3B HOLD, `executionAllowed=false`, JSON v1 byte/raw handling, 8 recovery slots, and no automatic retries after UNKNOWN.

## Incremental implementation plan

1. **Async, transaction-aware adapter (P1-2):** define a separate async request/result protocol and a synthetic-only database namespace. In a *single* readwrite transaction check the expected tuple `(structure, incarnation, generation, latestOperation)`, protocol, operation ID uniqueness, candidate/copy capacity and schema. Stage current raw, recovery copy, new token and receipt together; resolve only from transaction `complete`, not the last `put` success. Reject missing or malformed data and integer overflow. Explicitly close/abort on invalid conditions.
2. **Persistent history and receipt:** tie each new receipt to the previous operation and generation, with bounded history and proof of preserved raw. Never treat a self-consistent chain as evidence against hostile same-origin rewriting, total storage loss or rollback of the entire store.
3. **Authority reader and gate (P1-3):** read-only detection for unknown version, corrupt/missing receipt, inconsistent current/copy/token, blocked/versionchange, stale tab, and divergent localStorage snapshot. The reader can report `READ_ONLY`/`HOLD`/`UNKNOWN` but must not infer permission to migrate or write. A saved `protocol` is a compatibility gate, not authentication.
4. **UNKNOWN/HOLD controller:** durable pre-attempt intent must be acknowledged before starting a mutation. Record the result independently from a historical UI acknowledgement. An abort, notification loss or post-complete exception cannot be downgraded to success; no automatic retries. If an intent cannot be persisted, do not begin the mutation. If history/authority cannot be read after restart, fail closed; do not claim that a failed persistent write could somehow be reconstructed.
5. **Integration boundary:** keep the Stage 3B-3 localStorage adapter and all current product callers unchanged until a separate, reviewed authority-switch step. Extend the static writer-boundary contract only for explicitly isolated adapter/test surfaces, not with a general exclusion or new uncontrolled persistence API.

## Test and evidence matrix

| Area | Required adversarial observation |
| --- | --- |
| Competing tabs | same expected token, exactly one successful commit; stale generation/incarnation rejected |
| ABA and protocol | raw A->B->A; duplicate ID; wrong protocol/version; generation overflow rejected |
| Transaction | abort at every put boundary, request success followed by transaction abort, failed readback, late exception |
| Lifecycle | close/reopen, background tab, blocked upgrade/versionchange, lost completion notification |
| Storage integrity | corrupt/missing current/copy/receipt/intent, quota, unavailable database; fail-closed |
| Cross-backend | legacy localStorage divergence never auto-imported or overwritten; IDB unchanged by old LS writes |
| Product protections | original JSON v1 raw/copy corpus, 8 existing recovery slots, other keys, read-only selective restore |
| Browser regression | Chromium and WebKit multi-tab; formal 6 contexts, independently reaggregate original artifacts |

Preserve original failing evidence and explicit negative controls. For every assertion keep engine/version, exact fixture, expected/observed output, commit/tree, test command, CI run/attempt and downloadable original artifact provenance. Separate simulated faults from real multi-tab/browser observations and Playwright WebKit from iPhone Safari. A test failure remains a failure, not a silent skip.

## Review/decision gates

- **G0 (now):** planning document, independent Issue/branch/Draft PR only. No implementation claim.
- **G1:** isolated IDB adapter plus fault-injection tests; localStorage product behavior unchanged.
- **G2:** authority reader and persistent UNKNOWN controller; strict negative-case tests.
- **G3:** independent code and browser review, final HEAD CI and raw artifact reaggregation; limited acceptance may be recommended.
- **G4 (future separate authorization):** explicitly approved one-way migration/old-LS branch rescue, product authority switch, capacity/UX and real-device validation.

No automatic migration, no dual write, no localStorage deletion, no Draft release/merge/publish without explicit decision. **Selective restore execution permission remains NO.**

## Source design

- [Stage 3B-2 architecture §7](storage-architecture-stage3b2.md)
- [Stage 3B-3 Storage Facade](storage-facade-stage3b3.md)
- [Original remaining-risk ledger, #121](https://github.com/tetsujisugimori-coder/calculator-memo/issues/121)

## Implementation follow-up

The initial contract above is retained as kickoff history. The Stage3B-4 isolated adapter, current boundaries and conservative restart HOLD are described in [implementation design](storage-idb-stage3b4.md); actual results and remaining verification are tracked in the [ledger](../maintenance/storage-idb-stage3b4/verification.md). This link is not an acceptance claim.
