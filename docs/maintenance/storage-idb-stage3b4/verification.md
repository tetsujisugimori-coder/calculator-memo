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
| New pure/negative contracts | author25 + independent18; current reexecution log records actual result |
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

Pending the first implementation push. Final entry will record exact HEAD, tree, CI run and attempt, terminal job outcomes, downloaded artifact ID/digest/local SHA256 and original per-condition evidence. Formal6 artifacts must be independently reaggregated, comparing6/6,1128 checks,592 geometry,132PNG, all source HEADs and inventory hashes. New isolated test evidence is separate and cannot substitute for formal GUI.

A final documentation-only commit starts fresh workflows too; successful earlier candidate runs are not relabeled as final-HEAD success. Final PR Checks and an append-only GitHub comment can record that final run without another recursive evidence-only commit.

## Remaining limits and decisions

- New sessions with any prior intent remain HOLD; no explicit recovery-unlock API or production authority switch. Consistent receipts describe observed committed records, never historical UI acknowledgement success.
- Real two-tab contention, native transaction abort, versionchange and actual page close are different from injected put/quota/readback/ack faults.
- Actual disk quota exhaustion, uncontrolled renderer kill, entire browser-process crash, power loss/media flush, long sleep and physical Safari remain NOT_TESTED. Eight-copy capacity and unsafe generation rejection are tested, not an unbounded production capacity strategy.
- Legacy raw is caller-acquired snapshot input; observed fork is detected without writes, but there is no LS/IDB cross-backend atomicity, old-tab rescue/import or protection from unobserved ABA/hostile same-origin modification/whole-store rollback/loss.
- JSONv1, 8 production slots, current Facade, normal UI and disabled selective restore remain protected by existing unchanged regression paths.
- Future work: approved one-way migration and old-LS rescue, production authority switch, compaction/capacity, recovery UX and real Safari. These are not completed by isolated acceptance.
