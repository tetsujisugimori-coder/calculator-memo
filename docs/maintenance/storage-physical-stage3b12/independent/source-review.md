# Independent runtime-source review (2026-11-15 JST)

Scope: new `e2e/source-proof.mjs`, `e2e/source-load-*.mjs` and independent finite controls in `e2e/source-proof.node-test.mjs`. Review is separate from implementation. Baseline PR HEAD was `a879727bfd4ec5701c6e8ce70ece3278a35b159d`; this local review concerns uncommitted follow-up source. Final submitted HEAD and its CI/artifact acceptance must be recorded separately.

## Method and observed results

The independent controls create a temporary Git repository, commit LF-preserved source and two distinct workflow versions, run the actual before-capture CLI, execute an ESM entrypoint importing ESM and CommonJS dependencies through the actual observer, and run the after-capture CLI. Each counterexample clones the same original capture; the untouched original remains accepted at the end. This is a local Node test, not a browser or real-device execution.

Windows / Node v24.20.0: final local run **20/20 PASS**, zero failed/skipped/cancelled, 16.764 seconds. This includes eighteen original controls and two additional independent review counterexamples. Required cases and rejection reasons:

| Fault | Previous problem represented | Detection |
| --- | --- | --- |
| One-byte runtime source change | Valid self-reported load hash could describe changed code | `loaded-source` against independently expected Git bytes |
| Missing source file entry | Incomplete evidence could claim a complete set | `source-set-cardinality` |
| Alternate source version | Another revision could carry its own consistent hash | `loaded-source` |
| HEAD disagreement | Artifact could declare another commit | `declared-head` |
| Workflow version disagreement | Execution workflow could be confused with checked-out head workflow | External workflow SHA and workflow byte comparison |
| Manifest tampering | A rewritten declared digest could be trusted | `git-source-sha256` |
| Duplicate or unrelated source | Mixed or repeated files could conceal incompleteness | `duplicate-source` / `extra-source-bytes` |
| Artifact byte/hash disagreement | A stored source body could differ from its digest | `artifact-sha256` |

Additional controls verify required executed entrypoints, external run/attempt, PR head, time ordering, post-execution source changes, and post-execution run mixing. All eighteen passed with the original normal capture accepted. No test timeout or product expectation was relaxed.

Initial local failures are not suppressed: the first fixture checkout converted LF to CRLF through global Git configuration, correctly causing source-size rejection before execution. The fixture now explicitly sets only its own local Git `core.autocrlf=false`. A later run rejected a missing executed entrypoint correctly, while the independent test used a provisional reason name; the test now requires the actual specific `missing-executed-source` reason. Neither was an auditor false acceptance.

## Review findings and limits

The first implementation accepted a preload-only load set and did not externally bind workflow SHA/run/attempt or validate several manifest identity fields. The implementation owner added explicit required entrypoints and external bindings following independent review. The finite controls now cover those cases.

Two additional controls independently reproduced false acceptance of a load timestamp outside the capture window and an identical copied load record: the first twenty-case run was 18 PASS / 2 FAIL. The same original-capture clones are now rejected for `load-capture-time` and `duplicate-load-record` after the owner added capture-window checks and unique event IDs. Final twenty-case execution passed, including the unchanged normal control. This is a semantic RED-to-GREEN comparison, not a new browser run. The temporary Git fixture originals and mutated archives from those executions were retained locally, and the committed controls reproduce them from a fresh finite synthetic capture.

First-party non-JavaScript filesystem reads and browser asset provenance are not proven by Node loader events. The snapshot proves the captured tracked bytes match Git before and after execution; it does not prove every bundler read or served browser byte originated from that snapshot. Package JavaScript load bytes are captured but have no first-party Git blob identity. Native binaries and browser internals remain outside the Node load observer. Transient source changes between snapshots are detected only if observed by the loader, not universally. An artifact created by a PR-controlled workflow is not tamper-proof remote attestation.

Physical source-to-served-bundle evidence uses its existing original HAR and bundle bytes; atomic retains its generated fixture bytes. Formal GUI served asset byte attribution remains UNKNOWN unless separately demonstrated by original execution evidence. These limitations prevent a blanket runtime-source identity guarantee. CI results, original ZIP digest/size/SHA/CRC, final source blobs and semantic trace controls have not yet been independently accepted by this reviewer at this local stage.

Overall remains PARTIAL / limited merge NO while public references or required runtime-source attribution are unresolved. Stage 3B HOLD, `executionAllowed=false`, `writeAllowed=false`, `authority=NOT_ESTABLISHED`, no automatic retry after UNKNOWN remain. Actual Safari, private browsing, standalone, OS termination and physical media durability are NOT_TESTED.
