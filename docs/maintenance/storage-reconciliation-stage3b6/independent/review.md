# Stage 3B-6 independent review

## Scope and status

- Review started against PR #133 HEAD `5a042f4b85e62973d9204335b185157d02146fcd`, tree `3505334f96b067fd2f44cab7ddce1dc109b76065`; base main `ce87b7caccbdf5b36589de75bd91e7feaa65763a`.
- Read AGENTS.md, README, design, repository verification/GitHub workflow rules, e2e documentation, actual workflow, Issue #132 and Draft PR #133. No production import/write, merge, deployment, or authority changes were performed. Independent reviewer edited only this directory and `tests/storage-reconciliation-independent.test.ts`.
- Initial result: **RED**. Six findings, including compound-evidence and validator extensions below, were reported to the implementer before a fix. The implementer changed the fixture/validator; the reviewer retained original failing inputs and reran them independently.
- Current checkpoint: focused tests **9/9 GREEN** and evidence controls **9/9 GREEN** against a dirty working tree. Committed-head native reexecution and final CI/artifact verification remain pending. Overall **PARTIAL**, merge recommendation **NO**.

## Findings and original evidence

1. **R1, read failure drops the diagnostic report.** A synchronous `IDBFactory.open` SecurityError rejected `diagnose()` rather than returning unavailable observations and an UNKNOWN report. The repaired counterexample also supplies a database inventory and asserts four actual open attempts, so inventory failure cannot accidentally satisfy the test.
2. **R2, malformed prior evidence becomes CONSISTENT.** `{kind:'present', value:null}` in either retained target or journal was ignored. Both counterexamples returned CONSISTENT despite a supplied corrupt checkpoint. Expect CORRUPTED without inferred history.
3. **R3, whole-store validation hides independent negative evidence.** A missing target receipt suppressed a valid retained UNKNOWN while HOLD survived. A separate invalid journal record suppressed a valid pending rescue-attempt's capture gap. A further counterexample showed that current journal corruption also suppressed a known prior append-only record's loss. Individual uncertainty and checkpoint inventory must survive unrelated damage.
4. **R4, candidate evidence was self-authenticating.** The validator accepted deletion of all source/current candidates, a fabricated source generation/receipt, substituted raw with a freshly recomputed hash, duplicated branch candidates, invented IDs, and an inverted schema-validity flag. Candidate origins must match independently retained raw observations. The schema check is explicitly the known-valid-schema contract of these 16 fixed native fixtures, not a replacement general schema validator.
5. **R5, forbidden write permission was unchecked.** Setting `report.writeAllowed=true` passed the evidence validator. It now fails.
6. **R6, absent reads changed WebKit's database catalog.** Direct `indexedDB.open(absent)` followed by upgrade abort leaves a version-0 named catalog entry in WebKit 26.0. It persisted through 0/50/500/2000 ms observations and page reload. Chromium 141.0.7390.37 did not retain the entry. No object store or record was created. The issue was reproduced without any application fixture code. The repair enumerates databases first and never opens known-absent names; unavailable enumeration is UNKNOWN. An enumeration-to-open deletion race remains a browser API limit and must stay UNKNOWN with its catalog-effect limitation disclosed.

Original logs:
- `counterexamples-red-5a042f4.txt`: 1 positive passed, 5 assertions failed in the first six tests.
- `checkpoint-extension-red.txt`: first six repaired tests passed; the additional prior-record-loss case failed.
- `evidence-controls-red-5a042f4.json`: 2 positive/old-head controls passed; 6 malformed-evidence controls were incorrectly accepted.
- `schema-validity-red.json`: prior eight controls passed; schema flag inversion remained accepted.
- `absent-webkit-original.json`: direct native IndexedDB engine comparison, including post-reload catalog state.

## Independent browser evidence

`browser-controls.mjs` builds a fixed fixture bundle, serves it only on its own ephemeral loopback port, and uses fresh synthetic contexts. It does not use ports 4280–4285 or real user data. It independently seeds native IDB, instruments storage/record/schema mutators and transaction modes, compares exact before/after JSON, hashes candidate UTF-16LE raw strings using Node crypto, invalidates a pending request by closing it, and checks the absent database catalog.

First run: Chromium and WebKit × 375/390/765/1280 px = **8 conditions, 64 cases**, with **36 RED, 28 GREEN**, no page errors. The four code faults reproduced in every condition; the absent-catalog fault reproduced in all four WebKit conditions. Existing-store diagnostic comparisons showed no raw changes, no mutator calls, and only readonly transactions.

Original directory: `gui-evidence/independent-reconciliation-5a042f4b85e6-18958d02-cd10-442f-8070-64ed6f67e7cf/`. Full input/output JSON, bundled module, and eight PNGs are retained there; summary and PNG hashes are in `browser-controls-red-5a042f4.json`. The WebKit 375px PNG was visually inspected and matches the recorded failing case list.

The working source changed during that run because fixes were being made concurrently; `sourceUnchanged=false` is retained and this is not claimed as clean-head success. The already-built module was immutable and its SHA-256 `73357a7fd2121b054e4d9c02d6b9257fefef12259463fcdbdf36094a5061c962` exactly matches the implementer's original 5a042f4 native bundle. The original committed fixture SHA-256 was independently checked as `c20c367eaa0fb6ba85422ee1311e5c1d655c6b6a43a42ed483330f44634cd64e`. This pins the RED observations to the reviewed original implementation rather than to the concurrent repair.

An initial independent harness setup attempt failed before browser startup because Vite returned an output array. The reviewer corrected only its output-shape handling; that attempt is not a browser result or product failure.

## Original implementer artifact cross-check

Independently read `gui-evidence/storage-reconciliation-5a042f4b85e6-cf390e26-5ed5-4b46-ad62-df4a922ca544/summary.json`, checked its exact SHA/tree, recomputed the actual bundle hash and all eight actual PNG hashes, and matched all of them to JSON. The 8×16 original cases contain 0 mutator counts. Chromium 375px screenshot was visually inspected: it is a representative fresh diagnostic display, not a screenshot of every fault case. These original passing fixtures did not exercise the independent failures above.

## Verification boundaries

- Local Node is v24.22.1; CI pins 22.13.0.
- Local WebKit uses the official `pw_run.sh` path with existing official-library supplementation because system ldconfig was not changed. This is not the default CI launcher and not physical iPhone Safari.
- Stale SHA expected-value mismatch was independently rejected. A passing old-head CI or local run does not certify the repaired head.
- The original 5a042f4 reconciliation run is `https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/42363829680`; its later success is pre-repair evidence only. Final repaired-head CI remains pending at this checkpoint.
- Physical Safari, OS/private browsing retention, true quota/disk exhaustion, physical media flush, unobserved ABA, and source values lost before durable capture remain NOT_TESTED or UNKNOWN.
- The formal application GUI's six-condition 1128/592/132 contract is separate. Independent diagnostic cases are not added to its totals.
- Stage 3B HOLD, executionAllowed=false, writeAllowed=false, authority=NOT_ESTABLISHED remain required. No finding or GREEN result authorizes migration, recovery, merge, or deployment.
