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

On supported Linux CI, `install --with-deps` installs the browser's official OS dependencies. Local installation may require administrative permission; do not bypass a permission denial. Test output is in ignored `gui-evidence/`. The preview listens only on `127.0.0.1:4183`, requires a free port, and is terminated by the harness. It never reuses an existing server. Do not run with real user browser profiles or storage.

## Reproducibility

The application lockfile stays unchanged. GUI tooling has its own committed `e2e/package-lock.json`, installed with `npm ci`, pinning Playwright 1.56.1 and its browser revision. Workflow actions are pinned to reviewed commit SHAs, Node to 22.13.0, and the runner family to `ubuntu-24.04`. GitHub's runner image and system packages still receive upstream updates: actual image/version, Node and browser versions are recorded, so this is bounded reproducibility, not a bit-identical VM guarantee. Browser locale, timezone, color scheme, dimensions and fresh-storage conditions are explicit. There are no automatic whole-test retries or expected-value rewrites to turn failures green. Playwright assertions use bounded DOM auto-waiting, and explicit polling waits for storage and preview readiness.

## Find evidence and diagnose failures

Open the PR's **Checks → Checks and Chromium GUI → Summary** and follow the artifact link, or open the associated Actions run's artifacts. Seven-day artifacts contain:

- `ci-outcomes.json`: success/failure/skipped for install/check/build/browser stages, even if GUI never starts
- `provenance.json`: exact SHA and last observed GUI phase, passed checks, browser errors, failure stack and diagnostic category when the harness starts
- Named screenshots for each engine/mobile/width scenario, traces for completed contexts and a failure trace/screenshot when available
- Install, unit, lint, types, both build, browser-install, GUI and preview logs

Download the ZIP, inspect screenshots and provenance, and use `node e2e/node_modules/playwright/cli.js show-trace <trace.zip>` locally. No report or trace is published as a website. Artifacts inherit repository access; in this public repository any signed-in GitHub reader may download them. Keep all data synthetic. Do not put secrets, authentication state or user data in logs/screenshots/traces.

A failed stage is a fact; root cause is not inferred from an assertion alone. Distinguish environment/setup failures, bad test expectations/selectors, and application regressions using source, logs, screenshots and traces. Record the failed SHA/run before making an authorized test correction. Fix application behavior in a separate scoped change rather than weakening a correct assertion. Earlier temporary proof runs failed because their test expectations disagreed with existing restore/full-width-symbol behavior; the explicit expectations here document that existing contract.

The browser route guard covers routed browser HTTP requests; it is not a runner-wide network sandbox and does not constrain dependency installation or every browser transport. PR code still runs on GitHub’s isolated hosted runner.

A passing job is not a vulnerability audit. Existing dependency-advisory warnings need separate assessment. No merge, production deployment, branch protection, secret or permission setting is changed by this framework.

## Development history and PR checklist

Follow the repository [AGENTS.md](../AGENTS.md). Before opening a PR, decide whether [LOG.md](../LOG.md) needs an update (normally yes); if not, explain why in the PR body. Record the change, reason, validation result and exact SHA/run links, related issues/PR, and unresolved limitations. Link to artifacts and stage logs instead of copying them. Keep earlier findings and distinguish changed decisions and constrained alternatives. LOG.md is historical evidence, not the source of current agent rules. After the final documentation commit, verify that commit's check result in the PR; do not reuse a previous SHA's passing result.

## Mobile acceptance boundary

The existing check name `Checks and Chromium GUI` is retained to avoid silently changing a potential required-check identifier; its workflow now includes mandatory WebKit scenarios as well. A WebKit install/launch/assertion failure fails the same job. There is no optional-success fallback. The `scenarios` array in provenance records each started scenario and its completion; a first failure stops later scenarios, which must not be reported as tested.

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
