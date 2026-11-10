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
