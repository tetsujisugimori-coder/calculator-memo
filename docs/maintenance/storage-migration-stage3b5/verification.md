# Stage 3B-5 verification ledger

Issue #130. Implementation and independent acceptance are in progress. No PASS is inferred from Stage 3B-4 or earlier artifacts. Final results will be attached to the exact PR HEAD, tree, source digest and CI run/attempt.

## Baseline

- Latest main: `eb8fd95bb28e992963aba3b47a14529949736058`, merging #129.
- Stage 3B-4: #128 / #129, exact accepted implementation `771c1c06ecc008dafd88fb89c24ca43d1584f81a`. Prior CI success is historical only.
- New Issue #130, branch `feat/stage3b5-isolated-migration`; Draft PR pending at initial record.
- Local dependencies are reused from the same repository lockfile installation for focused tests. CI uses pinned Node and locked fresh installs. Local engine availability is recorded separately from CI.

## Required fresh evidence

1. Core raw/schema/token/classification/state tests.
2. Native isolated Chromium and WebKit migration/rescue, exact raw and receipts, source-only and target-only branches, both branches, delayed old writers and actual multi-page contention.
3. Fault injection: source before migrate, read/write gap, tx abort, receipt failure, commit response loss, readback failure, duplicate request, stale queued request, multi-tab race, delayed legacy writer, missing/reversed generation, corrupt raw/receipt, restart, unknown authority, rescue-time race.
4. Independent counterexamples and negative controls. Preserve original RED and corrected GREEN rather than overwrite history.
5. Product boundary scanner and negative controls, full unit/lint/types/normal and Pages builds, previous Stage 3A/3B-1–4 suites.
6. Formal six GUI conditions, original artifacts and independent recount of expected 1,128 checks / 592 geometry / 132 PNG. Exact final HEAD only.

## Acceptance at start

A–J: NOT_TESTED. Isolated acceptance: not yet established. Limited merge recommendation: NO pending verification. Real-data migration / authority switch / real rescue / selective writes: **NO**, independent of other results.

## Local environment observation (2026-11-06 23:59 JST)

Installed Chromium launch failed before any page existed: sandbox denied local IPC `socket()` with EPERM. One explicitly reviewed escalated launch also failed with the same EPERM. No browser assertions ran locally, and neither attempt is counted as a successful GUI test. The repository's supported pinned GitHub Actions isolated runner will execute the fresh browser matrix. No security setting or sandbox flag was changed to evade this limit.

## First local code verification (working tree, not final HEAD)

- Full Vitest: 127 files / 2,921 tests PASS, including the then-current 57 Stage 3B-5 unit tests.
- TypeScript PASS. Product writer-boundary scanner 359 files / 120 product files, zero violations; 52 boundary contracts PASS.
- Initial lint zero errors / five warnings (three existing, two new unused harness parameters subsequently removed).
- Evidence validator 19 tests PASS (one synthetic complete manifest and 18 intentional malformed-result controls). This proves manifest rejection, not browser behavior.
- Native migration suite currently defines 33 cases × 8 contexts (Chromium/WebKit × 375/390/765/1280). Actual execution pending CI.

## Independent counterexamples before first publication

The independent reviewer reproduced two journal validation defects against local initial commit `feedd810ee47f19476f56a8c83524b2cb9eebb9e`: production-source metadata and a non-genesis generation-zero receipt were accepted. Original 2/4 RED and corrected 4/4 GREEN are preserved under [independent/](independent/review.md). The reviewer also found a combined rescue-postappend-failure / diagnostic-persistence-failure restart gap. All historical rescue attempts now fence new instances; the native driver builds both the original frozen source and the current candidate to require EXPECTED_RED then GREEN in both browsers. Bundle creation succeeded; native results remain pending.

Independent evidence-validator counterexamples (failed summary, null observations, dirty provenance, invalid/reversed timestamps) were fixed without changing browser assertions. The validator has 24 synthetic positive/negative tests; the separate reviewer controls pass. Native suite remains 33 × 8, independent native suite 7 × 2. These are expected counts, not current browser passes.

Latest focused local check: 85 author + 4 independent unit tests PASS, types PASS, lint zero errors / three existing warnings. Normal and Pages build passed. Prior full unit 2,921 predates added tests and must not be called final total. Existing serial Node contracts 261 PASS plus newer evidence-validator 24 PASS are separately observed. Final-HEAD aggregate remains pending.

## 2026-11-07 JST: technical evidence update

### 1. Overall judgment
Isolated acceptance PARTIAL; limited merge recommendation NO pending final evidence; real-data migration/production switch NO. Stage 3B HOLD and `executionAllowed=false` remain unchanged.

### 2. Issue, PR and identity
Issue #130 / Draft PR #131 / `feat/stage3b5-isolated-migration`. First published HEAD `1c9f80ff78307691fb80931fd3e42f407e012819`, tree `5232ca127e5890a11efc0c3df484c8f32d0b996b`; base `eb8fd95bb28e992963aba3b47a14529949736058`. New final-HEAD results belong in PR #131 after verification.

### 3. Change and design
Only this ledger and the independent driver change. The driver retains exact `old.mjs`/`current.mjs` bytes alongside moduleHashes, records lengths/hashes, and checks readback. The first artifact retained hashes without those bytes. Product, engine, adapter, dependencies and formal GUI contract are unchanged. This PR already updates LOG.md; this evidence-only follow-up uses the ledger to avoid duplicating its existing entry.

### 4. Migration
First-HEAD CI run [42242084213](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/42242084213), attempt 1: 33 cases × 2 engines × 4 widths = 264 passed rows, independently recounted from its job log. These are historical results, not the new HEAD's native acceptance.

### 5. Branch rescue
First independent native log: 14 rows, old EXPECTED_RED2 and current/control PASS12. Repaired diagnostic-loss sequence requires UNKNOWN→UNKNOWN→BLOCKED, no second rescue and unchanged primary records. VERIFIED guarantees only its recorded pair; preappend failure can leave an observed value uncaptured.

### 6. Generation, authority and receipt
Raw/hash, generations, receipts and known causality stay distinct. No timestamp winner or guessed legacy parent. Historical attempts fence restart; no recovery-unlock API.

### 7. Faults and independent review
Published P1/P2 RED/GREEN evidence remains intact. Fresh focused89, validator24 and separate positive1/negative6 controls pass. Independent pure controls reproduce old namespace/genesis acceptance and current rejection. Manifest validation alone does not verify observation semantics.

### 8. CI and regression provenance
First HEAD: eight required workflows SUCCESS, attempt1: GUI42242084015, 3B5-42242084213, 3B4-42242084361, 3B3-42242084177, 3B2-42242084165, 3B1-42242084073, 3A42242083946, restore-plan42242084145. First GUI log confirms128files/2953unit passes, lint0errors/3warnings, types and both builds. Formal CI audit reports1128checks/592geometry/132PNG; its132 PNG hash/dimension log rows were recounted. That is not a new local PNG byte audit.

First native artifact13515921689 ZIP SHA256 `af5c6c40443b7921700a6798ee9d15121a7922e68ea88aa7ed7b190f607f2595`; aggregate13516318592 `6e0deb0bcea2815008c2aa44add169eba78d4f91a52fdda7025807e7d2776e62`; independent audit13516408410 `aff9a6d3836bbd2cc073509c6d0b4310ec511d69ab27204ed5e184e3dbadecc6`. Original six ZIP IDs13516576904/13515832373/13516447297/13516362840/13515833718/13516547790. These are CI/API digests; local ZIP hashes have not been recomputed. Artifacts expire2026-11-13.

### 9. Missing evidence and limits
Original ZIP bytes, final native summary observations and both final retained module files still require independent inspection. New final-HEAD CI is pending. Earlier local failures2952/2953unit and284/285Node must remain recorded: raw logs are unavailable; unchanged separate reruns reported2953/2953unit,285/285Node and recovery15/15, with root cause unproven. No cross-backend atomicity, old-writer fencing, silent ABA detection, media durability/powerloss, actual quota exhaustion, whole-store loss/rollback recovery or physical Safari proof.

### 10. A–J
A/B/C/E/F/G PARTIAL pending final native observations; D PASS within static/focused scope; H NOT_TESTED for new final HEAD; I PARTIAL pending original-byte inspection; J PASS within unchanged-product/source scope.

### 11. Limited merge
NO pending final evidence. Any later recommendation covers only synthetic isolated verification infrastructure; human decides merge and Draft stays intact.

### 12. Real-data prerequisites
Separate design/acceptance must address durable capture, old-writer lifecycle, manual UNKNOWN reconciliation, authority continuity, supported-browser storage loss/rollback, backup and rollout/rollback. Real-data operations remain NO.

### 13. Stage 3B-6 proposal
Design read-only reconciliation of persisted attempts and recorded branches, preserving uncertainty. Test capture gaps, retention/loss and physical Safari before proposing any execution unlock or production authority.
