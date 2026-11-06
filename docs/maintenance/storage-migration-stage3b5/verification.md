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
