# WebKit delay diagnosis (2026-10-26 JST)

## Preserved baseline

PR #93 HEAD `5cbaf6f74ae15d7afccb73f50c64c0ce0380756c`, run `40261949353`, attempt 1. The cancelled 30-minute job is not a successful GUI result.

| Existing measured segment | WebKit 390 | WebKit 375 |
|---|---:|---:|
| `formula-calculation-quotes` stage | 717.90 s | 391.93 s |
| 186 activations within that stage | 461.64 s | 203.68 s |
| All recorded screenshot checkpoints (geometry + capture + bookkeeping) | 26.60 s | 27.97 s |

**Phase-boundary correction:** the old `formula-calculation-quotes` stage also includes the following `exerciseAuditStorage`, `exerciseAuditFixedRecord`, and `exerciseAuditRecordComparison` calls. Its 186 activations are their aggregate, not the quote function alone. New explicit stage boundaries separate these existing functions without changing operations or checks.

**Terminology correction:** the old `timings.input` counters wrap `activate()`: they count taps/clicks and touch-delivery confirmation, not 186 text-entry operations. They do not isolate React computation, rendering, Playwright actionability, or transport. Source: `e2e/scenario.mjs` and each worker's `provenance.json` in the baseline artifact. The screenshot totals cover different completed extents and cannot prove screenshot cost is identical for full scenarios.

Fact: all active `.modal-backdrop` elements use `backdrop-filter: blur(3px)`. Some citation/audit flows layer several modals. Hypothesis: native compositing/rendering cost grows with the number of filtered layers and device pixel area. The observed activation ratio (~2.27) resembles DPR-squared ratio (2.25), but viewport height, resource contention, and other factors differ. This resemblance is **not** a causal result.

## Diagnostic instrumentation

- Production logic and formal input operations are unchanged.
- Formal activation timings now include scenario/stage, monotonic start, pre-dispatch, post-dispatch, observed touch completion, and end. They do not equate dispatch time with React execution time.
- Formal stages include monotonic start/end and resource observations.
- Resource evidence retains host load/memory and cgroup readings, separates Node's `resourceUsage`, and lists visible descendant process CPU raw clock ticks and resident KiB from Linux `/proc` (missing RSS is null, not zero). Clock ticks are not converted with an assumed frequency; RSS is not additive unique memory. Exited, reparented, or inaccessible processes can be missing. Unavailable cgroup fields remain null, not unlimited.
- Observation duration and stage JSON-persist duration are recorded separately; stage totals still include this instrumentation overhead.
- Added control-plane tests are source-contract/root-process checks, not proof that every browser child was captured. They retain actual tap/click, touch-delivery confirmation, and the absence of forced input or fixed waits.

## Experiments

The initial hypothesis stage made no optimization or root-cause claim. The subsequent completed and failed measurements below supersede that initial pending state. Local diagnostic execution is separate from six-condition formal CI acceptance. Trace collection and the original six conditions/three-worker/30-minute contracts remain required in formal runs.

### First local results (before product changes)

Both original quote-function runs executed all 76 activations and 13 existing checks with native WebKit 26.0 and the unmodified `5cbaf6f` build. These are **not** the 186-activation aggregate nor whole formal scenarios.

| Width / DPR | Function wall time | Activation wrapper sum | Result |
|---|---:|---:|---|
| 390 / 3 | 356.074 s | 225.810 s | 76 activations / 13 checks passed |
| 375 / 2 | 196.221 s | 88.825 s | 76 activations / 13 checks passed |

The 375 diagnostic separately recorded 8 `fill` calls totaling 5.676 s and 17 `selectOption` calls totaling 2.992 s. This does not support calling the old 186-activation total “text entry time.” API timers overlap nested calls and include diagnostic reads; their sums must not be added to wall time. Browser input/touch/click event times and the next animation frame are proxies, not isolated React render/commit measurements. The first 390 run did not have API-category wrappers; the comparable repeat was attempted and failed at its fifth tap (recorded below), so no complete second-duration comparison is available.

`timing-local-results.json` preserves outcome, counts, times, failure details, and raw evidence/trace digests. `timing-activations.csv` preserves per-activation monotonic boundaries, DOM size/modal count, and the synthetic locator.

Two subsequent **partial setup** attempts for an A/B comparison failed before A/B measurements: first at the bottom “比較表示を閉じる” button; second earlier at “引用元表示を閉じる.” Both preserved 10,000 ms action timeout and collected failure traces. The first trace resolves the target at 116432.629 ms, begins visible/enabled/stable waiting at 116445.485 ms, and times out at 126499.579 ms. It does not log whether visibility, enablement, stability, viewport placement, or interception was the specific unresolved condition. Root cause remains unknown; these failed experiments are not successful A/B evidence. The formal bottom-close checks remain unchanged.

The baseline build was copied byte-for-byte into `/tmp/pr93-baseline-dist-5cbaf6f` before any new product build. Its complete file-manifest SHA-256 is `ac1d2c97d0aa080a2803310c901139a224236221007cce704eecd2dcd754924f`. Later diagnostics can serve that immutable output through Vite `--outDir`, independently of working-source changes.

Diagnostic trace policy: the two initial local successes exported traces for actionability analysis, outside formal `gui-evidence/`. They are retained as historical diagnostic evidence, not counted as formal success traces. Repro scripts default to export only failure traces; `DIAGNOSTIC_EXPORT_TRACE=1` explicitly retains a diagnostic success trace when its internal wait timeline is needed for causal analysis. Formal CI still exports **zero** success traces, with no change to its trace policy.

## Completed predeclared matrix and selected mitigation

After the exploratory in-context contrasts, one matrix was fixed **before** execution: three fresh-browser trials each of baseline, all-modal filter removal, and **nested-stack-only filter removal**, ordered `baseline/all/stack → all/stack/baseline → stack/baseline/all`. No failed trial was retried or substituted. Each trial reused the existing `audit-record-comparison.mjs` synthetic v2 fixture, preserved real touch activation, made three A/B→B/A→A/B round trips, checked result invalidation/changed reasons, and asserted raw saved data invariance. It used the immutable baseline build, WebKit 26.0, 390×844/DPR3, 10-second default timeout, and identical source/fixture hashes. Full plan, every pass/failure, computed-style controls, process observations, timestamps, and evidence digests are in `timing-fixed-matrix.json`.

| Condition | Complete / failed | Complete function times | Median 4-tap round trip (complete trials) |
|---|---:|---|---:|
| Baseline, all existing blur layers | 3 / 0 | 42.442 / 31.836 / 47.668 s | 5.546 s (9 trips) |
| Remove all modal blur, even single dialogs | 1 / 2 | 24.793 s; two earlier `page.goto` load timeouts before modal input | 2.301 s (3 trips) |
| Remove blur only while a nested modal stack exists | 3 / 0 | 24.322 / 20.740 / 23.574 s | 2.186 s (9 trips) |

Failed setup/navigation trials are not assigned a zero duration and are not evidence of fast successful rendering. Their cause is not established. Three local passing stack trials demonstrate a bounded mitigation, **not** formal CI success or universal timing stability.

Independent trace reading found baseline vs stack-only median actionability-wait time per four-tap trip of 4265 vs 941 ms, while actual tap-action time was 133 vs 105 ms. Earlier full quotes trace analysis found most tap time in visible/enabled/stable waiting, not scrolling or navigation. This supports a causal **contribution** from layered filtering to this local native-browser wait cost. It does not establish the exact WebKit compositor/scheduler implementation fault or exclude runner contention.

### Design alternatives

1. **Narrower preferred experiment:** leave the topmost blur and disable only covered ancestors. An initial improvement was followed by actionability timeout in its second contrast block. It did not provide adequate stability evidence. Disabling only nested child filters while retaining outer filtering also showed no reliable improvement (median about 3.252 s vs baseline 3.226 s in the earlier two-tap contrasts). Neither is adopted.
2. **Adopted scoped mitigation:** retain the existing single-dialog `blur(3px)`, but suppress all overlapping filters only for a nested stack using `.modal-backdrop:has(.modal-backdrop), .modal-backdrop .modal-backdrop`. The existing dim background, fixed position, z-index, layout, contents, button styles, and all JavaScript/state handling remain unchanged. This deliberately changes background blur while nested, not report/calculation semantics.
3. **Broader alternative not adopted:** globally remove modal blur. It unnecessarily changes single dialogs, and its independent matrix includes two unclassified navigation failures. The smaller stack-only change has stronger completed evidence.
4. **Scheduling alternative not adopted:** serialize heavy WebKit conditions within the three-worker coordinator. It could affect contention, but no controlled same-runner scheduling evidence establishes a benefit. Existing three-worker dispatch/order and 30-minute job limit remain unchanged.

Removing a filter also removes a CSS containing-block effect. Therefore final native geometry, focus, touch target, and single-dialog restoration checks are required; source review alone is insufficient.

### Added formal regression

The existing formula-library delete/cancel path now checks single blur → nested no-filter → restored single blur, fixed position/z-index/viewport bounds, 44px mobile cancel target, restored trigger focus, and unchanged raw saved data. It uses the existing tap/click actions; touch activation count remains 1101 per mobile scenario. One additional acceptance group per condition raises **912 existing + 6 new = 918**, retaining all 562 screenshot geometry checkpoints, 114 PNGs, three workers, 30-minute job, and zero formal success traces. Full formal result is pending, not inferred from the diagnostic matrix.

### Remaining uncertainty

The full 390 quote-function repeat failed at its fifth activation (the cancel button), after stability and scrolling had completed and while performing the tap. It is retained alongside the initial complete 76-tap success, the complete 375 success, and all unsuccessful exploratory contrasts. Exact low-level WebKit/environment causes remain unknown. Local diagnostic event listeners, DOM reads and process sampling have overhead; they are not substituted for formal timing. React render/commit time and host-wide CPU contention are not separately isolated. Native Playwright WebKit is not actual Safari, VoiceOver, OS text enlargement, or an iPhone background/foreground test.

The regression asserts the selected rendering policy and semantic/layout invariants, not a new permissive timing threshold. Performance is measured separately; the existing action timeout and full-job 30-minute deadline remain unchanged. Unsupported older `:has()` implementations are not certified by this work; the unchanged base single-modal rule is the fallback, and all formal target engine versions must demonstrate the scoped rule natively.

### Reproduce the diagnostics

Run from the repository root, with an already-built, explicitly identified synthetic Pages output. `WEBKIT_EXECUTABLE` may identify the pinned local runtime; omit it for the installed Playwright runtime. The successful-trace override is diagnostic-only and must not target formal `gui-evidence/`.

```sh
WIDTH=390 DIAGNOSTIC_DIST=/path/to/preserved/baseline \
  OUT=/tmp/unique-quote-run.json \
  node docs/maintenance/pr93-gui-repair-20261026/quote-timing-diagnostic.mjs

WIDTH=390 VARIANT=stack-no-blur PAIRED_CONDITIONS=stack-no-blur \
  PAIRED_ROUND_TRIPS=1 DIAGNOSTIC_DIST=/path/to/preserved/baseline \
  DIAGNOSTIC_EXPORT_TRACE=1 OUT=/tmp/unique-stack-trial.json \
  node docs/maintenance/pr93-gui-repair-20261026/fixed-record-paired-diagnostic.mjs
```

The second command injects a **diagnostic CSS condition** into a fresh context before opening modals; it does not validate a rebuilt product patch. For product validation, use the corrected build with no `VARIANT` override and the original quote/official GUI operations. Both scripts reuse trusted checked-out test functions with explicit bindings rather than reimplementing comparison logic. Their failure exit is nonzero, and they preserve the failure JSON/trace; the early exploratory `/tmp` scripts predated that exit-code hardening, so their JSON `failed` status—not their zero wrapper exit—was the recorded result.

## Rebuilt-product confirmation (2026-10-26 07:45–07:51 UTC)

No diagnostic CSS override was applied. Both runs served the same corrected `dist-pages` (entry `index-DVc8aHr-.js`), pinned native WebKit 26.0, original quote function and real touch operations. The source hashes and build-manifest digest are in `timing-local-results.json`; the HEAD marker still names the base commit because these are precommit working-tree changes, not a claim that the base commit contains the fix.

| Condition | Original baseline | Corrected product | Outcome |
| --- | --- | --- | --- |
| WebKit390, DPR3 | 356.074 s; 76 activations, 13 checks | 269.203 s; 76 activations, 13 checks | Complete PASS, about 24.4% shorter function time in this local diagnostic |
| WebKit375, DPR2 | 196.221 s; 76 activations, 13 checks | Failed at seed-following `page.reload` waiting for `load`, 10000 ms | 0 activations / 0 checks; no comparable completed duration; **not PASS** |

The 375 failure is preserved with nonzero exit and trace. It occurred before modal input and has no established connection to the scoped filter change. Its cause remains UNKNOWN; it was not converted to zero duration, hidden by retry, or replaced by the narrower successful layout test. Formal six-condition CI remains mandatory.

For the complete 390 result, activation wrapper time fell from 225.810 to 148.395 s and dispatch time from 215.187 to 139.456 s. Independent trace analysis of the 76 taps found actionability waiting 186.991 → 116.103 s, actual tap 13.785 → 10.139 s, scrolling 0.628 → 0.489 s and scheduled-navigation wait 0.047 → 0.053 s. These support a reduced rendering/actionability contribution, not a complete explanation of WebKit delays or a promise of formal-job runtime. The corrected run's observed modal filters were `blur(3px)` for one layer and `none` for every layer in stacks of two through five; all original quote assertions passed and no pageerror was observed.

The same app build separately passed the sibling's 48 layout conditions and 60 backdrop-state checks, with the old-CSS negative control failing the new nested-filter expectation. That targeted success does not erase this full-quote 375 failure or replace the 918-check formal suite. Diagnostic success traces are retained outside formal GUI output solely for timing analysis; the formal success-trace count remains zero.
