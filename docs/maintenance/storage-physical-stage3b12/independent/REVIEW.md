# Stage 3B-12 independent review (in progress)

2026-11-15 JST. Reviewer separate from implementer. Initial submitted HEAD `1c86805d35ba48d3b92ca41fb7a2843d71afc0b5`; inspected subsequent uncommitted candidate as identified by file hashes in preserved evidence. No product changes or actual-device execution by reviewer.

## Method and findings

Read native atomic fixture, new runner, manual page, workflow, plan, row auditor and file auditor. Independently replayed existing Chromium raw rows through auditor; constructed finite mutations of the same rows, not browser failures or timeout substitutes. Six initial counterexamples were falsely accepted:
1. abort transaction native start/read/write removed (sequence renumbered),
2. UNKNOWN retry native request/result removed,
3. native transaction scope reduced to state only,
4. native readback differs from separately reported snapshot,
5. unrelated failure reason substituted for lost acknowledgement,
6. missing-receipt result while receipt restored in after-state.

After implementation fixes, all six same mutations rejected for their intended semantic reason, and all six original controls still accepted. Original raw rows are unchanged. The new served-byte binding was added only to derived review inputs, measured independently from the old saved bundle; it is post-created supplemental evidence, not a retroactive browser-response capture. `probe.mjs` guards against overwriting existing results.

A seventh counterexample removes native readback/readback-match from a VERIFIED normal row. Initial updated auditor falsely accepted it because readback comparison was optional. Result preserved in seventh-before.json. Fix/reverification pending at this record.

File-audit review additionally requested a fixed required source-file set, actual Git commit/tree binding, and ZIP CRC validation instead of only nonzero trace size. Final implementation/CI/archive verification pending.

## Boundaries

No real iPhone/Safari/private/standalone/background/OS interruption or physical-media observation. Session invalidation before update is not in-flight OS termination. Synthetic owned DB deletion is not real eviction. These limitations are now explicit in PLAN. Existing Stage3B11 fixture and product source remain unchanged in inspected diff. Manual page offers synthetic UUID-only attach/read, no public hosting and no site-data deletion.

## Current judgment

PARTIAL; independent review not final; unresolved seventh semantic counterexample and file-audit requests prevent limited technical acceptance until fixes and same-input checks. Exact final HEAD CI, artifact/digest/CRC/manifest and independent saved-file readback have not yet been reviewed. Physical acceptance remains NOT_TESTED/UNKNOWN and HOLD remains mandatory. No merge recommendation yet.

## Follow-up: seven semantic counterexamples closed

Same seventh mutant now rejects with `native-chain:readback`; original normal row remains accepted. All six earlier counterexamples rechecked again after this change with unchanged mutations; all reject for intended reasons. Results are in `results-after-all-seven-fixes.json` and `seventh-after.json`; prior results remain unchanged. Required source-set, Git tree binding and trace ZIP CRC/trace-entry checks have been added and inspected; full file audit awaits complete new evidence.

Engine-label substitution on an old Chromium row remains accepted by the row-only validator (expected absence of external identity). The file auditor must additionally bind trace `context-options.browserName` and trace namespace to the row, rather than trust engine/device labels. This remaining evidence-binding request was sent to implementer. Final CI/archive audit still pending.

## Final code inspection before CI

Trace audit now checks ZIP CRC, `trace.trace` JSON, one context-options record with matching measured browserName, and the row namespace in the trace. Suite requires 20 distinct namespaces as well as trial IDs. These close the identified engine-label/duplicate-evidence binding gaps in the intended threat model (accidental mixing and finite mutants, not an authenticated hostile forgery proof).

`probe.mjs` now accepts an explicit original input directory and a new exclusive output directory, applies seven semantic mutants per available engine, and refuses output overwrite. No original evidence is modified. Replayed all seven old Chromium controls/mutants through the current candidate: controls accepted and all seven mutants rejected. Derived old-bundle binding remains explicitly post-created, not a new execution claim.

No remaining blocking P1/P2 identified in the reviewed code scope. **Final acceptance is still pending** exact-HEAD CI and complete newly captured artifact/file audit; old Chromium partial results do not substitute for final WebKit or archive checks. Physical acceptance NOT_TESTED/UNKNOWN, Stage3B HOLD, product write authority remains false. No merge or deployment performed.
