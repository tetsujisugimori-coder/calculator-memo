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

The existing check name `Checks and Chromium GUI` is retained to avoid silently changing a potential required-check identifier; its workflow now includes mandatory WebKit scenarios as well. A WebKit install/launch/assertion failure fails the same job. There is no optional-success fallback. The `scenarios` array in provenance records each started scenario and its completion; a failure stops that worker, while other independent workers continue without retries. The aggregate fails unless all six exact conditions, acceptance-check counts, all 448 historical screenshot geometry checkpoints, and touch counts pass. Missing scenarios are never success.

Use the recorded exact PR SHA and the downloaded screenshots/traces for review. The next complementary acceptance step is physical iPhone Safari: repeat input/edit/error recovery and both memo saves, inspect the software keyboard and portrait/landscape scrolling, close/reopen Safari and confirm persistence using only synthetic data. No external device-hosting account or public preview service is required or created by this PR.

Official references: [Playwright emulation](https://playwright.dev/docs/emulation), [WebKit and Safari distinction](https://playwright.dev/docs/browsers#webkit). Version-specific behavior is constrained by the committed Playwright 1.56.1 lockfile; the online documentation may describe newer releases.

## Issue #16 responsive header boundary

The header wraps whole groups when their intrinsic width no longer fits, rather than squeezing Japanese action labels. Its height follows content. This is a general layout rule, not a 375px-only breakpoint. Geometry is recorded under each scenario’s `headerGeometry`; `*-header.png` and `*-guide.png` supplement the existing calculator/history/memo screenshots. Theme popup activation is a real click/tap; option selection uses Playwright selectOption, not a claimed native iOS picker gesture.

The real application additionally runs 721/800/1365px header text-size stress in Chromium and WebKit, at 200% and then 100% computed font sizes. It scrolls 250px and back, checking a 28px (±1px) gap between the sticky header and calculator after growth and shrink. A temporary 2000px workspace-height fixture supplies sufficient scroll range so the sticky parent's end does not confound the offset test; the fixture, font overrides and viewport are restored afterward. The 721px expanded/restored screenshots and `stickyGeometry` preserve this evidence. This is not a claim about native browser text zoom or iPhone Safari.

The first implementation left the calculator at a fixed 104px sticky offset, introducing overlap when the header grew. A matched baseline comparison exposed this regression; the header border-box height now updates a CSS custom property through a scoped ResizeObserver. Calculation/persistence state is unaffected, and the observer is disconnected on cleanup.

## Basic-math evidence

The new math checks run in every existing six-context scenario after the prior regressions, preserving their fixed entry-count assertions. Named `*-basic-math-history`, `*-basic-math-domain-error`, `*-basic-math-block-editor`, `*-basic-math-persisted-memos`, and `*-basic-math-url-history` screenshots complement each scenario's trace. Expression text is entered with `fill`; equals, restore, save, edit and tabs still use the shared mouse/touch activation helper. This does not verify a physical iOS keyboard.

These checks do not change or resolve the known nested-postfix-percent issue (#19); the existing simple-percent regressions remain intact.

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
