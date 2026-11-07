# Independent review: Stage 3B-5

Reviewed base candidate: feedd810ee47f19476f56a8c83524b2cb9eebb9e. Current fixes were reviewed as a dirty working tree, not a final committed SHA. This independent reviewer did not implement the engine fixes or author the main acceptance runner.

## Findings and evidence

- P1: completed rescue append followed by failure and lost diagnostic could become READ_ONLY/retryable in a fresh controller. Original guards excluded attempts having a rescue record. Current fix fences every historical rescue attempt. Static review confirms the relevant guards and journal observation are corrected. Native RED/GREEN remains pending CI.
- P2: migration journal validation accepted a generation-zero predecessor other than genesis and a production source namespace. `initial-red.log` records 2 failures and 2 passing controls. `current-green.log` records all 4 passing after the engine fix. These are evidence integrity defects, not demonstrated production access.
- P2: evidence validator accepted failed top-level status, null observations, dirty provenance and invalid timestamps. Independently executed original counterexamples returned an empty rejection array; current `validator-controls.mjs` rejects these plus reversed timestamps and a failed case. `validator-green.log` records the results. Synthetic manifest controls do not constitute native-browser evidence.

## Native independent driver

Run from repository root:

    node docs/maintenance/storage-migration-stage3b5/independent/review-browser.mjs

The driver builds the frozen original migration source and current candidate against the unchanged Stage 3B-4 adapter, verifying source digests from `red-source.json`. The old implementation is stored as inert text, not imported by product code. It serves only a blank loopback origin, blocks off-origin network requests and creates a new browser context for each case. No real application or user data are loaded.

Two engines, seven cases each:

1. Original postappend failure plus diagnostic loss: exact unsafe result must reproduce and the safety assertion must reject it (EXPECTED_RED).
2. Current identical combined failure: UNKNOWN and durable restart HOLD, no second rescue.
3. Current postappend failure with successful diagnostic: HOLD control.
4. Current normal completed rescue followed by restart: conservative HOLD control.
5. Queued migration followed by close: no primary mutation.
6. Caller mutation during source acquisition: frozen original ID and raw persist, no mutated-ID receipt.
7. Outer migration coordinator result loss: committed generation remains evidence, fresh controller blocks retry.

The original RED case verifies UNKNOWN→READ_ONLY→VERIFIED and unchanged primary records; it does not accept arbitrary exceptions as an expected failure. A separate assertion calibration rejects fabricated lost-HOLD data. Summary requires exactly one EXPECTED_RED and six PASS cases per engine; missing engine/case or launch failure fails the process. Results are written under `gui-evidence/storage-migration-independent-*/summary.json`.

`--build-only` verifies both bundles without launching a browser. `bundle-check.log` is explicitly bundle-only, with dirty-worktree and source/module hashes. Local native browser launch was not retried: the known Chromium socket EPERM restriction remains. Full native driver execution, final-SHA CI, artifacts and runtime are pending. No physical Safari, power loss, disk durability or production authority is established.

Limited merge recommendation awaits native independent GREEN and final-SHA checks. Production execution permission remains NO. No commit, push, publication or merge was performed by this reviewer.
