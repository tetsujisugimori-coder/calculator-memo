# PR #118 P2 correction record — 2026-11-03 JST

Review: [5742078367](https://github.com/tetsujisugimori-coder/calculator-memo/pull/118#pullrequestreview-5742078367). Reviewed HEAD64891f40f4685674b4171138be4aeacac75387f5/treebce368d761699472fbbb2e69f8f06713622d3564. [Finite acceptance plan](pr117-p2-PLAN.md). These are reconstructed published counterexamples; the reviewer's temporary probe files were not used.

## Local P2-01 evidence

Windows/Node24.20.0, separate from the required Ubuntu/Node22.13.0 CI. The unchanged old standalone subject exits13/signal null. The old unmodified oracle happened to obtain SIGKILL here, but disabling exactly its two SIGKILL calls gives subject13/null and oracle0, reproducing the loophole. This does not negate historical A artifact13147298971's independently verified null/SIGKILL.

| Condition | Raw subject | Raw oracle | Outer expected-outcome check |
| --- | --- | --- | --- |
| old standalone | 13/null | not applicable | PASS: natural exit observed |
| old ordinary oracle | null/SIGKILL | 0 | PASS: historical behavior recorded |
| old both kills disabled | 13/null | 0 | PASS: legacy acceptance defect reproduced |
| fixed intentional request | null/SIGKILL | 0 | PASS: ready/persisted operation/request/close linked |
| fixed request returns false/no delivery | 1/null on Windows emergency stop | 1 | PASS: rejected, reaped, PID absent |
| fixed false acknowledgement/no delivery | 1/null on Windows emergency stop | 1 | PASS: rejected, reaped, PID absent |

The fixed subject has a referenced timer and IPC ready message after the journal start. Parent verifies PID/operation and persisted previous-completion/incomplete-start before one intentional child.kill('SIGKILL'). Five-second synthetic-test emergency cleanup is separately recorded and always invalidates success. Strict acceptance rejects natural13, ordinary errors, startup failure, missing ready/request, rejected request and emergency cleanup. Windows Node's intended child.kill close reports SIGKILL; Windows emergency process.kill reports code1/null here. The latter is not reinterpreted as POSIX signal confirmation. Ubuntu CI is a separate required result.

## Local P2-02 evidence

The real generated coordinator's pipe/mirror block and worker-status statement are extracted and executed with a raw PassThrough stream, not replaced by a test-only forwarding implementation. StringDecoder handles UTF-8 continuation without changing raw stream encoding or the original Buffer pipe. The finite matrix covers whole input, every single byte split, bytewise/multiple-width chunks, Japanese/emoji interiors, multiple lines and an unterminated tail. One compact site is referenced by two operations/four decoded records. Native journal bytes, raw worker.log bytes, full Actions mirror and all operation/locator fields match.

The controls reuse exactly one native-journal fixture byte sequence. Reinserting the exact64891f4 generated handler causes the same full-record/full-text oracle to exit1. Japanese operation and locator bytes split in the dictionary propagate corruption to all four records while malformed remains empty; original file bytes remain unchanged. No historical live-log corruption is asserted. Mirror sink IO failure is caught and the actual generated worker-status expression becomes failed. Original journal IO/exception regression remains intact.

Local full diagnostic regression:19/19; bounded controls:8 expected outcomes; fixed artifact replay:all152,221 records and stop summaries identical,101,394,732 ->30,240,022 bytes. CI outcomes for the resulting commit are recorded in PR118 after terminal state, not predicted here.

Intermediate failures are preserved in evidence-118-p2-20261102: first controls incorrectly expected Windows emergency process.kill to report POSIX-style signal instead of actual1/null; second controls split only the operation text but also expected the separately encoded locator to be corrupted. The final deterministic negative input splits both fields; fixed full-text expectations were never weakened. The original full regression passed before this extra targeted split; the final targeted positive/negative checks also passed. A junction preparation failed EPERM and was not retried; normal file copies were used.

## P3-01 dated environment erratum

Old report [6579450790 section6](https://github.com/tetsujisugimori-coder/calculator-memo/pull/118#issuecomment-6579450790) grouped the final A/B banner under20261025.353.1. That grouping is incorrect. Official decoded job logs were reacquired without editing their text and stored separately in the new evidence directory.

| Run41458708675 / attempt1 | A | B |
| --- | --- | --- |
| Job / source | [125321924444](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/41458708675/job/125321924444) | [125321924431](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/41458708675/job/125321924431) |
| Runner Image group | ubuntu-24.04 / **20261018.96.1** | ubuntu-24.04 / **20261025.353.1** |
| Provisioner Cloud / Region | **AWS / us-east-1** | **Azure / westus** |
| OS banner and os-release | Ubuntu24.04.5 LTS | Ubuntu24.04.5 LTS |
| DIAG_JSON browser Node | v22.13.0 | v22.13.0 |
| DIAG_JSON Chromium |141.0.7390.37 |141.0.7390.37 |
| DIAG_JSON WebKit |26.0 |26.0 |

Source-text SHA256: A681f962e5ed859e2228a95c02ad9b1bd28edbcb6c774f78664bb09ad8dc0a106; B1cb5702115ddbd05bbf79fcedd2abf32e67549f8faea2eba41c47965953d3bc7. These hashes identify the decoded official text as acquired, not a new claim about original ZIP bytes.

Additional distinct source: original formal artifact13117290020/ci-outcomes.json, run41386901845, records nodev22.13.0, runnerImageubuntu24 and runnerVersion20261026.354.1. This old artifact-internal value does not erase the current A/B image/cloud difference. No complete environment identity or product-only timing attribution is justified. Keep original logs and old wording; append the dated correction to the old report and current PR body.

## Unchanged assessment and protections

Investigation PARTIAL, original R1/R2 UNKNOWN; original B5/6 and missing20/8/2, observed B5/6 and missing13/7/2 remain separate. A-derived formal6/6 is not B completion. Compact live B whole GUI, low load and timing noninterference remain unproven. The independent reviewer did not reacquire the exact cancellation-marker Actions line; they independently checked the JSONL operation times. The implementation's previous raw-log marker claim remains tied to its saved raw Actions log and is not presented as independently reverified by that review.

No product/PR117 branch/original formal input/expectation/timeout/workflow changes. executionAllowed=false, no user data/real save/restore enablement; ABA/TOCTOU/noncooperating writer unresolved, Stage3B HOLD. Both PRs remain Draft/unmerged/no auto-merge. LOG.md remains unchanged because this request authorizes diagnostic-specific files/records; this record, plan and PR body provide the scoped history. Local self-verification is not independent acceptance.
