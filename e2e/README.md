# PR GUI regression

Every ordinary `pull_request` runs `.github/workflows/verify-pr-gui.yml`, including draft PRs and forks (subject to GitHub's normal approval policy). This workflow never deploys. It uses only `contents: read`, no repository secrets, no `pull_request_target`, and no persisted checkout credential. The production Pages workflow is separate and unchanged.

## Coverage and identity

The job checks out the exact PR head (not the synthetic merge commit), runs existing unit tests, lint, TypeScript, normal build, and Pages build. Pinned Playwright drives six fresh, synthetic-only contexts:

| Engine | CSS viewport | Mobile / touch | DPR | Activation |
| --- | --- | --- | --- | --- |
| Chromium | 1365×1000 | false / false | 1 | mouse click |
| Chromium | 390×1000 | false / false | 1 | mouse click |
| Chromium | 390×844 | true / true | 3 | locator.tap |
| Chromium | 375×667 | true / true | 2 | locator.tap |
| WebKit | 390×844 | true / true | 3 | locator.tap |
| WebKit | 375×667 | true / true | 2 | locator.tap |

These are explicitly configured browser contexts, not certified device models. Runtime user agent, viewport, DPR, touch capability, engine version and scenario timestamps are recorded. The mobile scenarios assert coarse-pointer/touch support and observe an actual `touchstart` delivered by the browser for every mobile activation. `navigator.maxTouchPoints` is recorded, not used as a cross-engine acceptance gate: the pinned Linux WebKit reports 0 despite enabled touch emulation. No browser property is spoofed. Every UI button/tab activation uses `locator.tap` in mobile contexts (no forced clicks). Existing keyboard regressions still run separately; `fill` and keyboard calls do not test the iOS software keyboard.

Each scenario actively exercises:

- Issue #5 Backspace acceptance: the visible `⌫ 戻す` button is at least as tall as a standard key in every context; touch contexts at 375px and 390px also require a 44×44px minimum target. Existing click/tap and keyboard deletion checks remain active. This adds one named acceptance check per context without adding a touch activation or screenshot.

- Optional confirmation remarks: 500 UTF-16 units (including Japanese, emoji, newlines and HTML/Markdown-looking text), visible 501-unit rejection without truncation, canceled-close and ordinary-save draft retention, injected quota failure with unchanged raw storage, retry held at the Web Locks boundary with disabled input, and clearing only after successful explicit confirmation. Timeline checks distinguish absent legacy remarks from newly saved empty remarks, preserve exact plain text and line breaks, and retain the existing two-theme 200% layout/read-only checks. These extend existing checks without adding screenshots or changing successful-trace policy.

- Calculation evidence: preview/cancel cannot persist records; two explicit recalculations append two batches only after save; actual legacy/ID inputs, old records after source edits, failed rollback, explicit trial apply and save, report copy/download and read-only reproduction verification. Existing six engines/viewports and screenshot/trace budgets are unchanged.

- Header guide text stays on one line inside its button; wordmark/actions fit the header and viewport without overlap, with unobstructed hit-test centers
- Guide and actual native theme select have at least 44px touch height; the guide opens after activation, with search/category/scroll/close checks; the native select receives a real click/tap before programmatic option selection and theme state/persistence checks
- Sticky header controls remain reachable after page scrolling and guide reopen/close; Chromium desktop and WebKit 375 additionally probe 320/360/414/540/720/721px header geometry

- Addition, subtraction, multiplication, division, and four history entries
- Division-by-zero error display, no invalid history entry, clear/recovery
- History restore into editing state, with the existing last-number display (not automatic recalculation)
- Single-calculation memo save, cancelled edit, successful subsequent edit
- Block memo with text and a calculation block
- Saved block text, expression and result checked in rendered cards and storage, before and after reload
- Both memo types and history unchanged after reload
- Visible history/notes panels, narrow-screen tab switching, and detail modal open/close
- Trailing-number sign/CE edits preserving subtraction, decimal keyboard replacement, chained/re-entry calculation and URL input/history checks
- Basic math via the normal calculator expression textbox: right-associative `2^3^2`, `-2^2` versus `(-2)^2`, `sqrt`, `abs`, `pi`, `e`, and a combined expression
- Rounded LCD/result text and unrounded internal numeric history/memo values are checked separately (`sqrt(2)` and `2*pi` use independent `Math` expectations, tolerance 4 × machine epsilon × max(1, |expected|), tight enough to detect storage of rounded display text)
- Expression edits and history restores invalidate confirmed results; `^` keyboard input after equals continues from the result
- Disallowed function, wrong arity, constant-call syntax, negative square root, unsafe-magnitude and unsupported math/percent-mixing errors leave history/memos unchanged; corrected expression input recovers
- Math single-memo save/re-edit, block live preview/save/recalculation, URL expression receipt without automatic evaluation, and exact stored values plus rendered results after reload
- Unexpected console/page errors, HTTP errors, and non-loopback requests fail the test
- Document/body horizontal overflow at initial display, memo dialogs and screenshot checkpoints fails the test
- After-equals BS/CE/± edits, disabled memo entrances, recalculated memo payload, repeated/chained equals and zero-division recovery
- Small positive/negative result chaining without exponent syntax, exact history/memo values, editable chained operands, whitespace/Unicode-sign URL editing, parentheses error correction and simple postfix percent
- All four Issue #19 nested/leading-decimal percent expressions through ordinary calculation, URL import, saved single-memo editing and saved legacy-block recalculation, with exact stored values and reload persistence

The harness checks `git rev-parse HEAD` against the PR head SHA. Only after the Pages build, it generates `dist-pages/__gui_provenance.json` with exact SHA, branch, run and attempt; each browser fetches and compares it. No test marker is added to `public/` or application source. Screenshots have a clearly labeled test-only overlay that is immediately removed; provenance JSON and trace retain the unambiguous identity.

This is automated Chromium and Playwright WebKit, not interactive Cloud Browser access or physical iPhone Safari. Playwright WebKit on Linux is useful engine coverage, but it does not run the shipping Safari app or iOS. Real-device software keyboard, Safari bars, safe areas/notches, pinch/scroll gestures, OS background/foreground restoration, private browsing and long-term storage eviction remain unverified. It does not cover every responsive width, all calculator edge cases, all corrupted-storage formats, security, or full accessibility acceptance. Screenshots are evidence, not visual-diff assertions. This job tests the PR head in isolation; it does not prove the prospective merge commit works. PR authors can modify this test code and workflow; provenance is useful diagnostic evidence, not a tamper-proof security gate against malicious PRs.

## Reproduce locally

Use Node 22.13.0 and a clean checkout of the desired commit. Run from the repository root:

```sh
npm ci --ignore-scripts
npm test
npm run lint
npx --no-install tsc --noEmit
npm run build
npm run build:pages
npm ci --prefix e2e --ignore-scripts
node e2e/node_modules/playwright/cli.js install --with-deps chromium webkit
node e2e/smoke.mjs
```

On supported Linux CI, `install --with-deps` installs the browser's official OS dependencies. Local installation may require administrative permission; do not bypass a permission denial. Test output is in ignored `gui-evidence/`. Six workers use fixed isolated loopback ports `4280`–`4285`, each requiring a free port and terminating its own preview. At most two workers run concurrently on the same runner. It never reuses an existing server. Do not run with real user browser profiles or storage.

## Reproducibility

The application lockfile stays unchanged. GUI tooling has its own committed `e2e/package-lock.json`, installed with `npm ci`, pinning Playwright 1.56.1 and its browser revision. Workflow actions are pinned to reviewed commit SHAs, Node to 22.13.0, and the runner family to `ubuntu-24.04`. GitHub's runner image and system packages still receive upstream updates: actual image/version, Node and browser versions are recorded, so this is bounded reproducibility, not a bit-identical VM guarantee. Browser locale, timezone, color scheme, dimensions and fresh-storage conditions are explicit. There are no automatic whole-test retries or expected-value rewrites to turn failures green. Playwright assertions use bounded DOM auto-waiting, and explicit polling waits for storage and preview readiness.

## Find evidence and diagnose failures

Open the PR's **Checks → Checks and Chromium GUI → Summary** and follow the artifact link, or open the associated Actions run's artifacts. Seven-day artifacts contain:

- `ci-outcomes.json`: success/failure/skipped for install/check/build/browser stages, even if GUI never starts
- `provenance.json`: exact SHA and last observed GUI phase, passed checks, browser errors, failure stack and diagnostic category when the harness starts
- Representative screenshots for each engine/mobile/width scenario; every historical screenshot geometry checkpoint still runs. Failed contexts retain a pre-started DOM/action/network trace and failure screenshot when available; successful traces are not exported.
- Install, unit, lint, types, both build, browser-install, GUI and preview logs

Download the ZIP, inspect screenshots and provenance, and use `node e2e/node_modules/playwright/cli.js show-trace <trace.zip>` locally. No report or trace is published as a website. Artifacts inherit repository access; in this public repository any signed-in GitHub reader may download them. Keep all data synthetic. Do not put secrets, authentication state or user data in logs/screenshots/traces.

A failed stage is a fact; root cause is not inferred from an assertion alone. Distinguish environment/setup failures, bad test expectations/selectors, and application regressions using source, logs, screenshots and traces. Record the failed SHA/run before making an authorized test correction. Fix application behavior in a separate scoped change rather than weakening a correct assertion. Earlier temporary proof runs failed because their test expectations disagreed with existing restore/full-width-symbol behavior; the explicit expectations here document that existing contract.

The browser route guard covers routed browser HTTP requests; it is not a runner-wide network sandbox and does not constrain dependency installation or every browser transport. PR code still runs on GitHub’s isolated hosted runner.

A passing job is not a vulnerability audit. Existing dependency-advisory warnings need separate assessment. No merge, production deployment, branch protection, secret or permission setting is changed by this framework.

## Development history and PR checklist

Follow the repository [AGENTS.md](../AGENTS.md). Before opening a PR, decide whether [LOG.md](../LOG.md) needs an update (normally yes); if not, explain why in the PR body. Record the change, reason, validation result and exact SHA/run links, related issues/PR, and unresolved limitations. Link to artifacts and stage logs instead of copying them. Keep earlier findings and distinguish changed decisions and constrained alternatives. LOG.md is historical evidence, not the source of current agent rules. After the final documentation commit, verify that commit's check result in the PR; do not reuse a previous SHA's passing result.

## Mobile acceptance boundary

The existing check name `Checks and Chromium GUI` is retained to avoid silently changing a potential required-check identifier; its workflow now includes mandatory WebKit scenarios as well. A WebKit install/launch/assertion failure fails the same job. There is no optional-success fallback. The `scenarios` array in provenance records each started scenario and its completion; a failure stops that worker, while other independent workers continue without retries. The aggregate fails unless all six exact conditions, acceptance-check counts, all 490 screenshot geometry checkpoints (including all 448 historical checkpoints), and touch counts pass. Missing scenarios are never success.

Use the recorded exact PR SHA and the downloaded screenshots/traces for review. The next complementary acceptance step is physical iPhone Safari: repeat input/edit/error recovery and both memo saves, inspect the software keyboard and portrait/landscape scrolling, close/reopen Safari and confirm persistence using only synthetic data. No external device-hosting account or public preview service is required or created by this PR.

Official references: [Playwright emulation](https://playwright.dev/docs/emulation), [WebKit and Safari distinction](https://playwright.dev/docs/browsers#webkit). Version-specific behavior is constrained by the committed Playwright 1.56.1 lockfile; the online documentation may describe newer releases.

## Issue #16 responsive header boundary

The header wraps whole groups when their intrinsic width no longer fits, rather than squeezing Japanese action labels. Its height follows content. This is a general layout rule, not a 375px-only breakpoint. Geometry is recorded under each scenario’s `headerGeometry`; `*-header.png` and `*-guide.png` supplement the existing calculator/history/memo screenshots. Theme popup activation is a real click/tap; option selection uses Playwright selectOption, not a claimed native iOS picker gesture.

The real application additionally runs 721/800/1365px header text-size stress in Chromium and WebKit, at 200% and then 100% computed font sizes. It scrolls 250px and back, checking a 28px (±1px) gap between the sticky header and calculator after growth and shrink. A temporary 2000px workspace-height fixture supplies sufficient scroll range so the sticky parent's end does not confound the offset test; the fixture, font overrides and viewport are restored afterward. The 721px expanded/restored screenshots and `stickyGeometry` preserve this evidence. This is not a claim about native browser text zoom or iPhone Safari.

The first implementation left the calculator at a fixed 104px sticky offset, introducing overlap when the header grew. A matched baseline comparison exposed this regression; the header border-box height now updates a CSS custom property through a scoped ResizeObserver. Calculation/persistence state is unaffected, and the observer is disconnected on cleanup.

## Basic-math evidence

The new math checks run in every existing six-context scenario after the prior regressions, preserving their fixed entry-count assertions. Named `*-basic-math-history`, `*-basic-math-domain-error`, `*-basic-math-block-editor`, `*-basic-math-persisted-memos`, and `*-basic-math-url-history` screenshots complement each scenario's trace. Expression text is entered with `fill`; equals, restore, save, edit and tabs still use the shared mouse/touch activation helper. This does not verify a physical iOS keyboard.

The basic-math checks keep function/constant/power mixing with percent unsupported. Separate Issue #19 coverage below verifies nested postfix percent; the existing simple-percent regressions remain intact.

## Formula-library evidence

Each of the existing six contexts additionally exercises definition registration, invalid syntax rejection, edit cancellation, detail selection, editing, delete confirmation/cancellation/undo, reload persistence, and unchanged notes/history. The six contexts remain Chromium desktop 1365px, Chromium non-touch narrow 390px, Chromium touch 390px/375px, and WebKit touch 390px/375px; WebKit desktop and physical iPhone Safari are not covered.

`*-formula-library` and `*-formula-library-controls` capture the long-title/long-expression layout and the scrolled lower controls separately. `*-formula-library-{dark,light}-text-stress` uses the actual theme selector and temporary 200% computed font sizes in the detail section to check wrapping and reachable controls. This is layout stress, not native iOS text zoom. Numeric evaluation is deliberately absent: saved definitions may contain unbound variables or numerically invalid expressions, and the result label remains uncomputed.

## Identification-display evidence

Each existing context checks the unset responsive default across the 720px boundary, all three saved modes across resize/reload, actual label positioning and transparent backgrounds in none mode, and both themes. `*-identification-{labels,color,none}-{light,dark}` screenshots and traces supplement formula-library text-size stress. The native input retains cursor movement; invalid syntax clears the semantic preview, unknown names remain variable references, and registered names are never treated as callable references. Registration rename/delete and help dialog keyboard isolation/focus return are also covered. Synthetic keyboard events and computed font-size stress do not verify physical iPhone input, OS IME, accessibility tools, or native zoom.

## Registered-formula execution evidence

After the prior regressions, every existing context runs four execution checks with synthetic definitions and a synthetic note scope. Tests cover AST-derived fields (including a registered title identical to a variable), explicit scope import, missing/invalid/out-of-range inputs, division by zero, non-real/non-finite results and recovery, zero-variable expressions, input-change invalidation, unfinished-draft reload, immutable definitions, rename/change/delete lifecycle, and explicit history/memo transfer. The numeric expectations use fixed arithmetic and JavaScript Math independently of the application evaluator. Restoring transferred history and calculating again must reproduce the recorded result. Saved history snapshots remain unchanged after library edits/deletion.

`*-execution-confirmed`, `*-execution-{light,dark}-inputs` `*-execution-{light,dark}-result` and scrolled `*-execution-{light,dark}-controls` screenshots record input/result separation and narrow layout with temporary 200% computed font sizes. Buttons use the shared real click/tap helper; field values use Playwright fill. At 200% text size in both themes, the lower memo button must enter the viewport, then history transfer is activated and its exact numeric value and raw input snapshot are checked in saved storage. Help dismissal must preserve inputs and the execution dialog. These checks do not claim physical iPhone Safari, native software keyboard, real OS IME or native zoom verification.

## Non-destructive notes/block recovery
The six contexts additionally check unknown/mixed/duplicate/malformed blocks, exact raw storage retention after setting/keyboard attempts and reload, raw recovery-copy argument with a synthetic clipboard sink (not system clipboard), cancelled and explicit confirmed reset, and normal editing/saving after synthetic repair. All fixtures are synthetic. A protected sibling blocks the whole single-key dataset; this is not partial editing.

PR #34追加レビュー: 既知計算ブロックのproofRef/sourceId/入れ子metadataを合成保存データへ付け、legacy/変数双方の無変更編集保存、別文章の編集、追加・削除、下/上移動、式エラーと復帰、再読込で保持を検査する。計算結果assertionと付随情報assertionを分離。付随情報は画面表示せず保存値で比較し、意味的有効性は評価しない。


## 保護理由と原本エクスポート（Issue #35）
既存6条件それぞれで未知type、既知/未知混在、重複ID、不正blocks、未知evaluationMode、必須項目欠落、複数異常を検証。キャプションの原因分類、元JSONファイルのUTF-8バイト完全一致、コピー、reset取消、再読み込み、ヘッダー/全体キー経由の保存拒否を確認する。混在データでは詳細説明を開きライト/ダーク、CSS文字拡大でスクリーンショットと横あふれを確認する。ダウンロードはPlaywrightの保存ファイル検査でありiPhone SafariのダウンロードUI実機検証ではない。OS文字拡大、実clipboard、実データは扱わない。


## ID-reference default and execution-plan evidence

The existing legacy GUI regressions now explicitly press **＋ 旧変数計算**. Their numerical, reassignment, live-edit and save assertions are unchanged: they still test the compatibility mode rather than assuming the standard add action remains legacy.

A new `default-id-calculations` stage runs in all existing six Chromium/WebKit contexts. It creates standard **＋ 計算** blocks, selects a source by its visible label (not internal-ID entry), and verifies save/reload before any manual evaluation leaves null results. Manual evaluation checks `sqrt(2)` raw precision, edited old-result retention, forward reference after reorder, and stable saved target IDs. Explicit legacy additions test ordered `x=3`, `x=x+1` and a new ID consumer. An ID divide-by-zero rolls back all results without turning unrelated blocks' own error fields into errors; correction and reload recover the same values. Both themes at 200% computed text size check the expanded add toolbar for horizontal fit.

`*-default-id-editor` and `*-default-id-{light,dark}-toolbar` screenshots supplement the trace and exact-head provenance. These are synthetic browser checks, not physical iPhone Safari or native text zoom. Execution-plan ordering and diagnostic-code equivalence are separately covered by unit tests; this GUI stage does not infer those internals from displayed values.

The earlier reference GUI case selects its own block ID, so its diagnostic expectation is now **自己参照** rather than the old generic **循環参照**. This follows the requested separate self/cycle diagnosis; its rollback assertions are unchanged.

The failed-attempt UI additionally distinguishes the source’s **今回の計算エラー** and its ID consumer’s **今回の依存エラー** from the memo-wide rollback notice. Unrelated blocks have no local diagnostic. `*-default-id-own-error` and `*-default-id-unrelated-rollback` capture the distinction. Attempt diagnostics are transient, clear on editing and are absent after dialog reopen; saved JSON remains unchanged in shape.

## Calculation state and diagnostic detail evidence

Each existing browser context exercises a three-level ID chain and an unrelated
calculation through the real editor. It checks direct-change versus potential
impact badges, retained old results, static syntax diagnostics before execution,
actual numeric failure and definite ID-downstream errors after an explicit
recalculation, and a single memo-wide rollback notice without labeling the
unrelated block as failed. Saving and reloading a stale memo must report unknown
change provenance rather than reconstructing an invented edit history; correcting
and successfully recalculating clears the derived pending state.

The accessible i button is opened and closed, a diagnostic source link focuses the
actual source card, and Mermaid output is exposed as a read-only string with a
copy action. Export must not save or calculate the draft. Both themes at 200% root
font size cover label/detail wrapping and a minimum 44px i-button hit area.
`*-diagnostics-*` screenshots distinguish the inspected states. These are
synthetic fixtures, not real user data, and do not claim native iOS text zoom or
VoiceOver acceptance. The prior per-card rollback assertion is intentionally
moved to the single memo-wide notice; its arithmetic and rollback expectations
are unchanged.

## Dependency-graph navigation evidence

Each of the same six browser contexts renders the real, locally bundled Mermaid
diagram for a synthetic manual memo with duplicate expression labels, a
multistage ID chain, an unrelated calculation, a legacy-variable dependency and
a non-calculation block.
The harness checks the SVG's exact raw block-ID mapping, rendered labels and state
classes against the read-only Mermaid source, plus the dependency-edge count.
Computed SVG stroke styles must keep uncertain legacy edges dotted and definite
ID edges solid after sanitization.
Mouse clicks or real browser touch taps select existing cards by ID, scroll/focus
the card and highlight only that card. Enter and Space activation are also
checked separately. The expression input is focused only through the explicit
edit action; this does not claim to test an iOS software keyboard.
Geometry and center hit-testing must show the selected card's navigation/edit
controls inside the unobstructed modal viewport after layout settles, without
test-driven scrolling to repair navigation. Recorded `graphSelectionGeometry`
keeps that evidence alongside the screenshots.

Selection survives reordering two same-label blocks. Deleting the selected block
removes its node and selected details, reports deletion and does not redirect to
another block. Graph-selected error details must match the existing card details,
and source links return to the actual source card. Opening/closing the diagram,
zooming, selecting, inspecting details and copying preserve rendered numerical
results, validity labels, saved notes and history. A temporary storage-write
observer also rejects redundant writes. The copy test uses a synthetic clipboard
sink to compare exact strings, not the operating-system clipboard.

Both actual themes at 200% root font size check wrapping, 44px zoom controls and
the diagram's bounded internal scroll area without document/modal horizontal
overflow. Internal scrolling is programmatic; native iOS pinch/drag gestures,
Safari chrome, VoiceOver and physical devices remain unverified. The 375px and
390px contexts and all previous regressions remain mandatory.

A valid 24-node/276-edge DAG deterministically exceeds the 256-edge drawing
budget. Its fallback must keep the block list, card navigation and complete
Mermaid copy available without calculation or saving. This checks the bounded
drawing fallback, not a browser download outage or arbitrary Mermaid exception.
Named `*-graph-selected-card`, `*-graph-error-detail`,
`*-graph-{light,dark}-enlarged`, `*-graph-{light,dark}-enlarged-selection`
and `*-graph-limit-fallback` screenshots accompany the existing exact-head
provenance and traces.

## Trial / difference preview regression

Every one of the six existing contexts additionally creates a synthetic manual memo with a three-stage ID chain, an unrelated block, an internal-precision probe, and a legacy variable block. It checks:

- Trial leaves rendered held results and serialized storage unchanged, with a `Storage.prototype.setItem` spy establishing zero data-key writes (not merely unchanged values).
- Direct / affected / unrelated labels and independent expected `+20`, `+20`, `+40` differences; a small nonzero internal-value difference is not hidden by display rounding.
- Edit, reorder, block addition and deletion disable old Apply. Shared i diagnostics navigate by ID without changing values.
- Apply changes the editor draft only. Separate Save persists full internal values and unknown block metadata; reload removes transient trial state.
- Legacy-phase failure makes ID numeric work unattempted; ID failure and its downstream remain distinguishable, cannot apply, and preserve old results.
- Light/dark 200% text, card/panel horizontal geometry, actual touch activations, keyboard i activation, and screenshots of success and failure.

The full unit suite separately covers snapshot/generation guards and late asynchronous completion. These GUI scenarios do not pretend that the current synchronous numeric evaluator is a remote/long-running calculation, or that Linux WebKit is physical Safari.


## CI measurement and evidence policy (PR #43)

`smoke.mjs` coordinates six isolated `scenario.mjs` processes, at concurrency two.
Each has a fresh browser/context/storage, a unique port and evidence directory.
The coordinator writes the built-output identity once before starting workers;
workers read and verify it. Configuration, exact SHA, all acceptance counts,
geometry checkpoints and mobile touch counts are validated before discarding a
successful live trace, then validated again as a complete six-condition suite.
No app assertion, expectation, stability wait, test condition or touch action is
removed. Browser launches remain per worker to avoid sharing mutable globals.

All screenshot checkpoints run `assertHorizontalFit` before the independent
capture policy. Eighteen representative checkpoints per condition cover the
header/guide, formula controls, numeric/variable/reference diagnostics, rollback,
change detail, graph navigation/error/fallback, trial success/failure/large text,
and protected storage recovery. On aggregate failure, inspect workers and each worker/provenance.json: aggregate
scenarios/checks are populated only after complete-suite success.
The full list and captured/omitted status are in
`screenshotCheckpoints`; omission is not an omitted geometry assertion. Other
geometry and theme assertions still run. Earlier sections describe checkpoint
names, not a promise to retain every corresponding PNG on success.

Trace starts before page creation with DOM snapshots, action history, network
and sources. Continuous screencast images are disabled; representative PNGs and
failure PNG remain. On a test failure the live trace is exported, retaining the
operations before the error. Starting trace only after failure is not used.
Successful traces are stopped without export/compression. Failures during setup
or after tracing has already ended may have no trace; provenance records that
stage rather than inventing one. This policy intentionally trades continuous
video-like images for DOM/action reconstruction and selected real images.

`run-stage.mjs` records each command's wall time, exact exit/signal and logs;
logging failure also fails the stage. Scenario timings separate geometry,
PNG capture and overlay overhead, and record stage/trace start/stop API times.
Trace API timings do not isolate ongoing snapshot overhead. The aggregate
records wall time and sum of worker durations, not CPU time or billed VM-minutes.
The CI GUI command additionally records GNU time process-tree user/system CPU,
elapsed time and peak RSS in gui-resources.log; old runs lack comparable CPU data.
`inventory.json` gives pre-upload byte counts and largest files. Upload uses
compression level 0 because PNG and trace ZIP data are already compressed; actual
ZIP size and upload-step duration must be obtained from the Actions artifact/log.
Upload and compression timings are not independently observable from that step.

npm download caching keys both committed lockfiles; `npm ci` still installs from
locks. Playwright revision remains pinned and browser/system dependencies are
installed on the runner; no browser-cache hit is assumed. App and e2e lockfiles,
required check name, timeout 30 minutes, retention seven days, permissions and
production deployment configuration are unchanged.

Run `node --test e2e/ci-contract.node-test.mjs` for isolated failure/coverage
contracts. After build/browser installation, `node e2e/failure-probes.mjs <output-directory>`
executes GUI-operation, screenshot and SHA negative controls in a separate temp
copy. It injects faults only into that copy and requires nonzero exit plus
appropriate evidence. A real GitHub artifact-service outage is not simulated by
these local probes. See [measured baseline and limitations](../docs/agent/ci-optimization.md).


## Graph comparison and trial integration (PR #44)

The existing graph-navigation and trial-preview fixtures now also verify the
comparison mode in all six contexts. Their original acceptance assertions remain.
The trial fixture adds one dependent zero-multiply block to distinguish structural
influence with an unchanged value from an unrelated block. The new checks cover
changed and indirectly affected values, stable-ID added/removed edges, comparison
Mermaid copy and rendered labels/edges, trial invalidation before another explicit
trial, and failed/unattempted numerical comparisons. Selection cannot apply or
save results. Deleted historical nodes cannot navigate, and oversized comparisons
retain the existing safe fallback. Both themes at 200% text retain horizontal-fit
checks.

The complete contract is 384 named acceptance checks and 454 screenshot geometry
checkpoints across six contexts. One new representative `*-graph-trial-comparison`
PNG per context supplements the prior 18, for 114 success PNGs total. All old
geometry checkpoints still execute; success trace export remains disabled and
pre-failure tracing is unchanged. The exact touch count is enforced by the same
fail-closed coverage contract. These browser-emulated conditions still do not
claim physical iPhone Safari or native OS text zoom coverage.


### P2: graph entry after deleting every calculation

The deletion regression extends the existing trial stage in all six contexts with
four named checks: partial A→B→C deletion and surviving-ID navigation; full A→B
deletion with historical nodes/edge and no navigation, writes or stale trial;
a new stable ID after full deletion; and no graph for a text-only baseline/draft.
The full-deletion entry assertion fails on the pre-fix current-only render guard.
The complete P2 contract was 408 acceptance checks, 460 horizontal-fit
checkpoints, and 671 touch activations per touch context. The new
`*-graph-all-deleted` checkpoint checks geometry without retaining a success PNG:
114 representative PNGs and zero success trace exports remain unchanged.

## Nested postfix percent regression (Issue #19)

Every existing context evaluates `((50+50))% = 1`, `(50+(25+25))% = 1`,
`(5%+5%)% = 0.001`, and `.5% = 0.005` through the ordinary expression textbox,
URL `expr`, single-memo edit/save, and legacy calculation-block live recalculation.
URL receipt remains unconfirmed and cannot add history until explicit equals.
Synthetic existing-format single and block notes load unchanged before editing;
all four corrected expressions retain their exact stored numbers and displayed
results. Both memo types survive reload, opaque block fields and absent legacy
mode metadata are preserved, and memo recalculation does not create calculator
history. The existing dependency-graph and trial regressions remain unchanged.

Four named checks and two geometry-only checkpoints per context extend the
fail-closed contract to 432 acceptance checks and 472 horizontal-fit checkpoints.
The exact mobile touch count is 698 per touch context (27 more than P2).
`*-nested-percent-block-editor` and `*-nested-percent-persisted-memos` still run
horizontal-fit assertions but do not retain success PNGs. The six contexts,
114 representative PNGs, no automatic retries, pre-started failure traces and
zero exported success traces are unchanged. This remains browser emulation,
not physical iPhone Safari validation.


## Saved Markdown report regression

The saved block-note report stage adds five checks per context: mixed source order
with distinct stored/internal values and exact copy/download bytes; visible failure
handling and fresh persisted-source lookup; cancelled draft/unreflected trial
exclusion; light/dark 200% text controls; and refusal of unknown protected source.
Synthetic clipboard sinks verify payload and failure handling, not OS clipboard.
Real browser downloads are read back byte-for-byte, not claimed as OS save success.
Three new geometry-only checkpoints per context preserve representative PNG policy
and success-trace discard. Expected totals become 462 GUI checks, 490 geometry
checkpoints and 729 touch activations per mobile context. These are fail-closed
coverage expectations; actual execution results are recorded separately in LOG/CI.


## Report provenance regression (Issue #49)

The existing report fixture now includes multi-stage ID references, an unused
reference mapping, and legacy variable reassignment. Two additional named checks
per context verify direct source body positions, current saved internal/display
values and states, uncertain legacy candidates, and explicitly unavailable
calculation-time inputs. A later persisted source expression changes while its
old numeric result remains; neither it nor its consumers may be certified.
The existing byte-for-byte copy/download and no-storage-write assertions cover
the enriched report. Cancelled drafts, unapplied trials, protected data, both
themes and 200% text remain checked.

The expected contract is 474 GUI checks, 490 geometry checkpoints and 729 touch
activations per mobile context. No new browser activations or success PNGs are
added: the six contexts, 114 representative PNGs, zero exported success traces,
and all existing acceptance checks remain. These are expected counts, not a
claim of execution; actual results are recorded in LOG and exact-HEAD CI.


## Pending persistence navigation regression

One additional check per context holds a synthetic Web Locks write boundary while
two consecutive registered-formula draft edits occur. It checks the pending notice,
unchanged persisted data, and cancellation of a synthetic cancelable beforeunload
event. After releasing the write, the exact latest inputs must be persisted and the
notice/guard clear before a real browser reload verifies restoration. This checks
the application's guard, not a native leave-page dialog or OS durability.
Expected totals are 516 acceptance checks and 502 geometry checkpoints; the six
contexts, 754 touch activations per mobile context, 114 representative PNGs, two
workers and zero exported success traces remain unchanged. Execution results must
still be established by the exact-HEAD CI, not inferred from these expectations.


## Saved calculation record comparison regression

Seven additional acceptance checks per context cover persisted record list/detail,
append-order defaults despite reversed clocks, swapped direction, distinct records
with equal contents, a 100→120 / 150→170 / 300→340 dependency chain and its actual
recorded inputs, rounded-equal internal-result changes, signed zero, long IDs,
unchanged-block disclosure, exact preview/copy/download bytes, clipboard/download
failure, frozen acquisition across external saves, explicit refresh with missing
selection, zero/one record, and unsupported-version protection. The historical
comparison fixtures are deliberately synthetic persisted records; the preceding
calculation-evidence scenario separately verifies real evaluation/save boundaries.
No current memo block is used to fill historical information.

Three added geometry checkpoints per context cover the expanded comparison and
both themes at 200% text; keyboard containment and restored trigger focus are
asserted. No additional success PNG is retained. The expected complete contract is
594 acceptance checks, 538 geometry checkpoints, and 824 observed touch
activations per mobile context. The six contexts, 114 representative PNGs, two
workers, time limits, and zero exported success traces remain unchanged. These
counts specify required coverage, not a claim that every context has already run;
actual execution and final-HEAD CI results belong in LOG and the PR checks.


## Saved-record change impact analysis

Three further acceptance groups per context check independent observed-direct,
propagation-candidate and result-difference labels on the recorded A → B → C
chain; retargeting C from B to A with distinct before/after routes and edge
addition/removal; and a shape-valid but inconsistent captured input that must
remain unknown. The latest default pair still follows append order, not clocks.
Preview/copy/download byte equality now includes the impact Markdown. External
refresh, zero/one record, unsupported format, and no-storage-write assertions
remain active. The impact details are expanded in the existing light/dark 200%
text checks, including keyboard containment and trigger focus restoration.

One additional geometry checkpoint per context checks expanded impact paths.
There is no extra success PNG, timeout extension, trace retention, or browser
matrix reduction. Counts above are required coverage; completed runs are recorded
separately in LOG.


## Saved-record impact path graph

Three additional acceptance groups per context exercise the historical graph,
not the current memo graph. The fixture keeps the A 100→120 / B 150→170 /
C 300→340 chain, with B reading two separately named inputs from A in
`@{1}+@{2}-@{2}+50`. Selecting C exposes A→B→C and B→C as distinct
representative paths. The path filter must show three and then two nodes without
changing the complete comparison Markdown. SVG node touch/click, Enter and Space
selection are checked, including both input names in B's historical details.

The retarget record changes C's actual source to A (result 240). A B-root path
exists only before; switching sides must preserve the selected C and B IDs while
showing the path's absence after, never joining before/after edges. A separate
record lacks C, and another records C's inconsistent input 999; the graph must
respectively explain absence and unknown evidence without replacement or false
highlighting. Pair changes and swapping clear the old graph selection, whereas
side changes retain IDs. External saves leave the frozen graph and Markdown
unchanged until explicit refresh, which removes vanished selections. All these
operations retain exact storage bytes and issue zero writes.

Two geometry-only checkpoints cover selected paths and an absent-side block.
The existing light/dark 200%-text checkpoints now include graph selection,
side switching, keyboard activation and contained controls. No successful PNG,
trace, timeout, retry or browser-matrix budget is added. The expected complete
contract is 594 named checks, 538 geometry checkpoints and 824 observed touch
activations in each mobile context. These are fail-closed required counts, not
claims of a completed run. Renderer fault/cap and broader graph topology cases
are additionally covered by unit tests; physical iPhone Safari and VoiceOver are
not exercised by this synthetic Playwright harness.


## Registered-formula mathematical reports (Issue #59)

Five additional acceptance groups per context cover a new separate report bound
to a stable formula ID, clean labelled raw Markdown editing, keyboard opening
and restored focus, cancelling dirty-close without losing content, safe KaTeX,
code fences and literal HTML without script/image execution, ordinary save without
automatic confirmation, explicit confirmation, name-versus-expression changes,
and confirmation invalidation after content changes. Two identically named
formulas remain independent. Deletion retains the orphan report for exact-byte
clipboard and Markdown-file rescue; reload preserves it without modifying notes
or calculation history. Fixtures are synthetic and restore the original storage.

Two geometry-only checkpoints per context cover the report in both themes with
200% root text. The complete required contract is now 624 named checks, 550
geometry checkpoints and 855 actual touch activations per mobile context. The
31 additional report taps were observed in the focused WebKit 375px preflight;
the complete suite still verifies the total independently. All prior checks are
retained. Six contexts, two workers, 114 retained PNGs, existing job limits, and
zero exported successful traces remain unchanged. Counts describe required
coverage, not a completed run; exact-HEAD results are recorded in LOG and PR CI.

Storage conflict/failed-save/unknown-data and capacity boundaries also have unit
tests; these must not be represented as physical-device GUI verification. Real
iPhone Safari and VoiceOver remain outside this Playwright emulation.


## PR #60 CI環境準備の障害切り分け

GitHub Ubuntu24.04のfresh runnerでは、正確なAzure Ubuntu sourceだけ公式HTTPS archive/securityへ切り替え、署名・suite・componentを保持する。OS依存は固定Playwrightの `install-deps chromium webkit`（5分）、browserは `install chromium webkit`（3分）に分離し、各log/timingを残す。失敗時は後続GUIを成功扱いせずalways artifactへ保存。ローカル用の上記手順は変更せず、CI専用root設定scriptを利用者PCへ適用しない。30分/全6条件/114PNG/成功trace非保存は不変。[原因・案比較・制約・復旧](../docs/agent/ci-environment-acquisition.md)。

## Issue #61: report confirmation evidence

The existing six contexts additionally select a saved record by memo ID + record
ID, inspect its actual input `z = -0` and internal result `-0` while the current
memo has `z = 999`, and assert byte-equivalent storage before/after browsing.
Explicit confirmation records `x * 2`, variable `x`, report text and the selected
record. Renaming remains a match; changing to `x * 3` adds another confirmation;
editing the report leaves both histories and the original compatibility expression
intact while marking current text unconfirmed. After removing the saved memo from
the synthetic storage, explicit refresh must show an unavailable reference and no
stale detail. No real user records are used.

These add two named acceptance groups per context and two geometry-only checks
(light/dark with 200% text) per context. Required totals become 636 checks and 562
geometry checkpoints; the expected mobile activation count is 866. All prior
checks remain. The 30-minute CI limit, six engines/viewports, 114 PNG ceiling,
successful trace discard and failure artifacts remain unchanged. Actual complete
execution is recorded by the final PR head's CI, not inferred from focused runs.

## Issue #63 saved formula detail

The library now uses local selection without saving. Each of the same six conditions checks saved-only formula/report/history display, safe Markdown, keyboard history disclosure, refresh, exact Markdown copy/download, same-name ID separation, raw-storage invariance, both themes and 200% text fit. This adds one acceptance check and six mobile touch activations per context: 642 checks, 872 touches per mobile context; 562 screenshot checkpoints and the 114 PNG cap remain unchanged. No workflow, dependency, timeout, or trace-policy change.

### PR #64 additional refresh verification

Existing same-tab report scenarios additionally assert the detail immediately after formula rename/edit and report save/close. A synthetic fixture checks canceled formula and report edits against exact raw storage, then uses a real second page in the same browser context to edit and save formula/report through the application UI. The first page must retain its labeled old snapshot, become unverified, and refresh to the new saved text without lifting application conflict protection or writing. Both pages use the existing touch activation checks. Two acceptance groups and 16 activations per context are added: 654 checks, 888 mobile activations. The six conditions, 562 screenshot checkpoints, 114 PNG cap, 30-minute limit and trace policy are unchanged. No production data or browser profile is used.

## Issue #65 evidence status list and filters

Three additional acceptance groups per context cover saved-only row labels,
all five filter options and their original entry order, same-title ID separation,
both themes at 200% text, successful-save status transitions, and a synthetic
storage-read failure followed by explicit recovery. Browse/filter/list-refresh
must preserve the exact serialized original and issue zero storage writes.
The existing cancel and real-second-tab scenarios now additionally assert list
status preservation, immediate stale downgrade, and shared list/detail refresh.
Legacy confirmation without sufficient evidence stays unknown, and missing
reports remain distinct from reports without confirmation.

The expected complete contract becomes 672 acceptance checks and 903 observed
touch activations per mobile context. The 562 geometry checkpoints, all six
contexts, 114 retained PNGs, two workers, 30-minute CI limit and successful-trace
discard are unchanged. These are required counts, not execution results; final
head CI and LOG retain the actual verification result. Synthetic read failure
is injected only in a fresh test context and restored before leaving the fixture.

### Issue #67 確認履歴タイムライン

既存6条件へ3確認ずつ追加し、総計690確認（115/114/115/115/115/116）、mobile906操作を要求する。同一時刻と逆順記録、式/本文/両方差分、履歴なし、実他タブ更新と再取得失敗、原本不変、両テーマ200%文字とキーボード展開を検査。幾何562確認、PNG114枚、30分、成功trace0の既存契約は維持する。これらは期待条件であり、実行結果は各runのsummaryを確認する。
