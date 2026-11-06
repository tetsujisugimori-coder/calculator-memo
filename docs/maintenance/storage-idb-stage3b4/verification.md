# Stage 3B-4 verification ledger

Refs [#128](https://github.com/tetsujisugimori-coder/calculator-memo/issues/128), [Draft #129](https://github.com/tetsujisugimori-coder/calculator-memo/pull/129). **Candidate / independent final CI acceptance pending; merge NO; actual selective restore writes NO.** Product localStorage writers unchanged, `executionAllowed=false` / Stage3B HOLD.

## Provenance and baseline

- Started 2026-11-06 UTC (JST same date); clean dedicated `/workspace/calculator-memo` clone. Unrelated Codex-Cloud-Lab untouched.
- HEAD `a68dd5a6ecb3ca1ad57015d835c84266f053d0a4`; main `f22b854c3ef564513b6aace8f0da1b48a47c461c`; PR draft/open, no reviews/comments at start. Remote refs rechecked before submission; no concurrent change observed.
- Initial HEAD's existing workflows were successful, except intentionally skipped old diagnostic job. Those are **baseline only**, not evidence for the new implementation.
- Local environment Linux / Node24.19.0 / npm11.9.0. CI pins Node22.13.0, Playwright1.56.1. Existing local Chromium154.0.8037.57 is an explicit local override; no pinned Chromium/WebKit claim for those runs.

## Executed local checks

| Observation | Result and scope |
| --- | --- |
| Existing full Vitest suite | 124 files / 2820 tests passed before new tests; `/tmp/calculator-unit.log` |
| Existing Node e2e contracts | 239/239 passed; `/tmp/calculator-contract.log` |
| New pure/negative contracts | author26 + independent18; current reexecution log records actual result |
| TypeScript | passed after initial two type errors corrected; no type-erasure workaround |
| Normal and Pages builds | passed; existing bundle-size/classification warnings retained |
| Writer boundary | no product failures; no new broad exclusions; root-relative and `/@fs/` safety tightening |
| Local isolated Chromium | four widths375/390/765/1280, 41/41 each (164 passed; includes clean process restart and native active-transaction page close), dirty-source candidate; recorded bundle/source hashes in summary |
| Local WebKit | NOT EXECUTED: download403 Domain forbidden under managed network policy; runner correctly failed overall |
| Formal GUI6 | pending final-head Actions; baseline1128/592/132 is an expected comparison, never a substituted result |

Local browser summaries/bundles are under ignored `gui-evidence/` or preserved `/tmp/calculator-idb-local-evidence/`. The independent original RED and corrective evidence is retained in this directory. Generated bundle artifacts use `.mjs.txt` to keep the ordinary source linter from linting bundled dependencies. Early runner/preflight errors and a concurrent evidence-directory move interrupted one dirty local run; neither was a product failure or a successful browser run. No failed original evidence was deleted.

## Independent findings and RED→GREEN

The reviewer is a separate agent from the adapter implementer, with its own input fixtures and native browser runner. It did not merely rerun author assertions.

- **R1/P1, outer coordinator failure:** original native Chromium showed first save UNKNOWN, persisted READBACK_MATCH/CLEAR, restart AUTHORIZE, then an improper second VERIFIED save at generation2. Original [observation](independent/initial-native-red/chromium-outer-lock-observation.json). Fixed outer failure uses durable diagnostics; historical readback never grants a new-instance write session. Diagnostic-write failure also leaves HOLD. Delayed callbacks are fenced at asynchronous transaction boundaries. Fixed native observations preserve original outcome independently of later receipt inspection.
- **R2/P2, contradictory intent:** a firstFailure-bearing READBACK_MATCH row was accepted. Now such evidence is rejected. Original [unit RED](independent/initial-red.log); subsequent fixed logs retain independent reexecution.
- **R3/P2, scanner import escape:** product root-relative `/e2e/fixtures/storage-idb.ts` import bypassed isolation. Canonicalize root-relative paths and reject `/@fs/`; relative, alias and root-relative independent controls reject imports. No product scanner exclusion was added.
- **R4/P2, mixed record protocol:** unknown intent/diagnostic protocol was accepted. Explicit version1 is now required and written for both; original [RED](independent/protocol-red.log), corrected reexecution recorded separately.

Native reviewer counterexamples: post-coordinator loss, loss plus failed diagnostics, preauthorized stale/fresh competing tab, delayed callback after rejection, absent-DB read-only open. Injected lock rejection/faults are distinguished from native IDB effects. Local combined reviewer runner remains failed if WebKit cannot launch; Chromium observations alone do not make it a two-engine PASS.

- **R5/P2, Vite glob isolation escape:** eager `import.meta.glob` bypassed normal import inspection. Product glob macros now fail closed; original [RED](independent/glob-red.log), [independent18/18 GREEN](independent/final-unit-green.log).
- Author lifecycle harness initially retained obsolete39 assertions alongside41 after adding two cases; local failure was preserved, stale assertions removed, and the 41-case count/unique identity gate retained.

## Final CI / artifact acceptance

Initial implementation `7bbcdf0329639eb5206cac69dfa1861d6320e9b9`, tree `e48babf4800829ec6790fc455afafb2bf50647e8`: dedicated CI [42200515926 attempt1](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/42200515926) **FAIL**. Author native Chromium/WebKit39×8 passed; independent Chromium5/5, WebKit4/5. The absent-DB test inferred committed creation from `indexedDB.databases()` enumeration, while the independent native re-open protocol showed absent version0/no schema. Fixed driver retains enumeration diagnostically and checks actual open oldVersion0+empty stores+abort, with a known initializedDB negative control. Upstream [WebKit version0-enumeration fix](https://github.com/WebKit/WebKit/commit/fe33814c6298e5e9828424880df19def4b97a889) explains the pinned older engine compatibility inference; final CI must establish the corrected observation. Original artifact ID13494746051, size2955223, GitHub digest `ed3685f289c0a4617808b1d752d6249c118b59909a04717041714b2fb1f73d0d`, expires2026-11-13. Local materialization failed; do not claim independently computed ZIP hash or local original PNG inspection for this run. Original job [excerpt](first-ci-red/independent-job-excerpt.log) and artifact are retained.

Second candidate `c4ed9c4779efccd90f32405e999aeac30097afe5`, tree `227e44e16080b425fb20026c9433df3d86054fc8`: starts native41×8 including clean process restart and kept-active-transaction page close. Not final code acceptance: separate parent reviewer found a session lifecycle gap on the prior code, reproduced locally on this unchanged adapter.

**R6/P2 session lifecycle:** an old native-lock-queued save revived after close+reauthorize; an in-flight authorize also completed after close and allowed a save. Original [session RED](independent/session-epoch-red/summary.json). Unique per-authorization session identities now fence queued work, awaited transaction bodies, late authorize and outside result return. Third independent control closes after callback verification: exposed result UNKNOWN, committed generation1, persistent diagnostic and restarted HOLD. [Independent8-case GREEN](independent/session-epoch-green/summary.json) is local Chromium evidence; WebKit remains CI-pending. No original failure is relabeled as verified by later receipt inspection.

Current final CI and formal6 raw artifact independent review are pending. A separate reviewer authored `e2e/review-formal-artifacts.mjs` without importing the official collector/coverage oracle. The appended fresh-runner job downloads the six original artifacts plus official aggregate; checks each record/served identity, exact six accepted conditions and counts, all132 PNG signatures/CRC/decompressed scanlines/dimensions and SHA256, original inventory paths/size/category totals, and official-result equality. Its manifest preserves every original file hash. Existing worker provenance has no tree field, so the auditor explicitly attributes tree via the independently checked exact HEAD instead of inventing worker-side tree evidence. This is artifact verification, not a second browser execution or human pixel review.

Author-independent synthetic auditor controls: **22/22 PASS**, including missing/duplicate conditions, stale SHA/run/attempt/tree, reduced/duplicate checks, geometry, PNG signature/CRC/dimension/truncation, failed prerequisites, official mismatch and inventory mismatch. Existing affected GUI/coverage/storage-recovery contracts **79/79 PASS**; full Node contract suite **261/261 PASS** after this22-case addition. The first full execution at8f19c79 found4 suffix-scanning CI-contract failures because the appended audit job appeared inside older tests’ job-to-EOF slice. The audit block was relocated after the formal aggregate and before backup/restore/recovery/preview groups; no assertion, dependency, timeout, count or failure propagation was weakened. Original [4-RED log](first-ci-red/audit-job-placement-red.log) retained; full261 reexecution passed. These simulations are not native GUI results. Native original artifacts must still pass the new job at the final HEAD. Final entry will record exact HEAD, tree, CI run and attempt, terminal job outcomes, downloaded artifact ID/digest/local SHA256 and original per-condition evidence. Formal6 artifacts must be independently reaggregated, comparing6/6,1128 checks,592 geometry,132PNG, all source HEADs and inventory hashes. New isolated test evidence is separate and cannot substitute for formal GUI.

A final documentation-only commit starts fresh workflows too; successful earlier candidate runs are not relabeled as final-HEAD success. Final PR Checks and an append-only GitHub comment can record that final run without another recursive evidence-only commit.

## Remaining limits and decisions

- New sessions with any prior intent remain HOLD; no explicit recovery-unlock API or production authority switch. Consistent receipts describe observed committed records, never historical UI acknowledgement success.
- Real two-tab contention, native transaction abort, versionchange and actual page close are different from injected put/quota/readback/ack faults.
- Actual disk quota exhaustion, uncontrolled renderer kill, entire browser-process crash, power loss/media flush, long sleep and physical Safari remain NOT_TESTED. Eight-copy capacity and unsafe generation rejection are tested, not an unbounded production capacity strategy.
- Legacy raw is caller-acquired snapshot input; observed fork is detected without writes, but there is no LS/IDB cross-backend atomicity, old-tab rescue/import or protection from unobserved ABA/hostile same-origin modification/whole-store rollback/loss.
- JSONv1, 8 production slots, current Facade, normal UI and disabled selective restore remain protected by existing unchanged regression paths.
- Future work: approved one-way migration and old-LS rescue, production authority switch, compaction/capacity, recovery UX and real Safari. These are not completed by isolated acceptance.

## Terminal result location

This ledger records observed earlier runs and corrections without anticipating the CI for the commit containing it. For the final submitted HEAD/tree, terminal CI run/attempt, artifact IDs/digests and final independent acceptance decision, use the latest evidence comment/body and Checks on [Draft PR #129](https://github.com/tetsujisugimori-coder/calculator-memo/pull/129). The independent raw-artifact manifest records exact HEAD-derived tree, run/attempt and all original file hashes. An earlier candidate’s success is never substituted for the final commit’s run.
