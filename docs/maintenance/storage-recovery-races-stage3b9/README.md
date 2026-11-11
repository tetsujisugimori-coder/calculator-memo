# Stage 3B-9: synthetic recovery decision races

Issue #140. Base main 475bdf2eeaecf7554831e735a6cfdcd6f6808a58 incorporates PR #139 (Stage 3B-8). This adds only isolated fixtures, tests and evidence tooling. No production import, writer, migration, restore or storage switch is added. Stage 3B HOLD, executionAllowed=false and writeAllowed=false remain mandatory.

## Contract

The existing lifecycle is the authority. A UI session separately gates asynchronous presentation by operation epoch. Relevant changes, unknown observations, explicit cancellation and session termination invalidate outstanding presentation. Late completions are discarded rather than assigned to the visible decision. Review never recreates a material. Explicit generation creates a new ID; an old ID cannot authorize review of the new material. Closing a session cannot be reversed.

Fourteen deterministic scenarios cover A → B → new material, overlapping generations and reviews, invalidation during work, simulated two sessions, cancellation, UNKNOWN, reader errors, invalid evidence, getter/validation exception, generation mismatch, termination and restart. Deferred promises establish operation ordering without timing sleeps. Tabs are simulated sessions, not browser cross-tab messaging. The browser suite executes these actual fixtures through a synthetic UI in the existing six scenario configurations. It is not a product UI safety test.

Evidence includes per-operation sequence, ID, decision ID, fingerprint (logical-state identifier), status, reasons and accepted/discarded result. Event generation is null because the lifecycle public view does not expose it; the capture ledger separately records synthetic revision/generation for every read. Fingerprints are used as the equivalent state identifier, not as proof that every intervening writer was observed. Raw synthetic contents and secrets are excluded from reports.

Two in-memory mutants disable reuse-time checking and stale-generation protection. Safe behavior must be GREEN for every case and each defective variant must be detected RED. Original lifecycle source is not changed.

## Limits

A → B → A without an observed generation/history change remains undetectable. Non-cooperative writers, notification completeness, actual tabs, actual media, Safari hardware and post-check/write TOCTOU remain UNKNOWN/NOT_TESTED. No write exists here, so successful review does not prove a subsequent write safe. Only explicit new synthetic material can leave a prior invalidated material behind; invalidated IDs are not reauthorized.

## Reproduction

Run `npx vitest run tests/storage-recovery-races.test.ts`, `node e2e/recovery-races-negative-controls.mjs`, then on a clean committed checkout `node e2e/run-storage-recovery-races.mjs`. The dedicated workflow fixes Node 22.13.0, lockfiles, browsers and exact PR HEAD. Existing formal GUI remains separate and must retain its 6-condition / 1128-check / 592-geometry / 132-PNG contract. Existing workflows are unchanged.

Local initial negative-control build failed because mutation ran after TypeScript transformation; the transform is now explicitly pre-transform, preserving literal-source target assertions. The failed log is retained under work/negative.log locally. An initial full lint process was killed; this is not PASS or a proven product fault. Local Node 24 differs from formal CI Node 22.13.0. Final acceptance is pending CI and independent review.

### Additional evidence controls and local attempts

Six report mutants reject a missing condition, missing case, nonzero write count, false final VALID, UNKNOWN carrying review authority, and reordered event sequence. These are synthetic validator tests, not claimed browser observations. The complete production LOG.md is preserved byte-for-byte after detecting connector response truncation during submission; chronological work notes are here instead.

Local browser attempt 1: required Playwright Chromium 1194 executable absent in default cache. Attempt 2 used existing pinned cache and an explicitly local WebKit dependency wrapper; process exited 137 before completing the suite. Full default-parallel unit run ended ERR_IPC_CHANNEL_CLOSED. Neither is treated as PASS or an established product bug; serialized retry and formal CI provide separately identified results. No expectations, waits or browser versions were relaxed.

### Independent review correction

On 13595c5 an independent reviewer modified the relevant-notification event of `invalidation-before-completion` to VALID/reusable=true, leaving the final STALE unchanged. The original evidence validator accepted this invalid intermediate authority. The fixed validator now checks relevant/unknown/cancel/close event invariants and forbids reuse of an invalidated decision ID in later events. The identical counterexample is preserved as `independent-counterexample-red-green.json` and as the seventh report mutation. This repairs evidence validation, not production code. `events.stateId` means fingerprint; `reads.stateId` means the synthetic revision label. They are different identifiers and must not be equated. Event `generation:null` is explicitly unobserved; the separate reader ledger reports captured generation.

### Pending authority P2 follow-up (review 5849802343)

The original cb318335 artifact 13798670341 (run 42890011272, attempt 1) accepted `invalidation-before-completion` sequence 5 / operation 2 / decision 1 when only `reusable` was changed to true, across all six environments. Original status VALID, pending outcome and final STALE were retained. `pending-p2/old-reproduction.json` records the unchanged source hashes and six independent mutated-copy results. Original JSON and artifact remain unmodified.

Event schema v2 distinguishes actual `checking` from `immediate-rejection`. It records the current material's checking/reusable state separately from operation kind, requested ID, mode, rejection reason and requestAllowed. A checking event must have checking=true and reusable=false. An old-ID request is rejected without revoking the valid current material. The fixture still invokes the original lifecycle for such requests, so the observer does not replace the implementation's decision. The validator verifies each start/stage/finish chain, required reasons, stable operation descriptors, request/current ID relationships and final-view agreement.

Legacy rows lack these decision grounds and are explicitly schema-rejected (normal and mutated alike); that is NOT counted as semantic repair. `pending-p2/legacy-schema-results.json` records this separately. On newly generated normal v2 evidence, pending-controls.json mutates only the equivalent checking-event reusable flag separately in each of six rows, requires the specific `checking-reusable` failure, and confirms all normal rows are accepted. It also preserves two old-ID immediate-rejection positive cases per environment, the previous invalidation-notification mutation, missing operation evidence and contradictory result controls. Mutation inputs are deep copies and original bytes are checked unchanged.

Only the synthetic fixture, evidence validator, regression controls and these records change. Production code, storage routes, real data and Stage 3B HOLD remain unchanged. Local standard sandbox became unable to start because /tmp had 60KB free; no other task artifacts were removed. Workspace-only tests used the authorized reviewed execution route with workspace TMPDIR. Formal CI remains the pinned, isolated acceptance source.

Independent follow-up also found a two-field counterexample during overlapping generations: sequence 8 of old-generation-late could falsely claim checking=false/reusable=true while operation 2 was still unfinished. The validator now derives a one-way pending constraint from the operation history, rather than trusting checking alone. Other unfinished validation requires checking=true/reusable=false. A conservative stale checking=true after completion remains allowed. The same counterexample's before/after result is in pending-p2/overlap-reproduction.json and all six new-schema rows receive this mutation independently.
