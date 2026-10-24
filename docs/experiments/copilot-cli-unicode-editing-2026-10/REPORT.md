# Copilot CLI experiment: Unicode minus and whitespace editing

## Verdict

**PARTIAL.** The selected pre-fix source reproduced the editing defects, the cause was isolated, a small fix was applied only in a detached worktree, and the added tests passed afterward. This is not a valid blind benchmark: current repository documentation and a historical Issue title exposed related regression context. The chosen commit is a failing pre-fix candidate, but its status as the exact immediate parent of the historical repair cannot be independently proved without inspecting the prohibited repair PR/diff.

No product source was changed on `main`, and the experiment branch contains only this report, `LOG.md`, and the source/test patch artifact. The experimental implementation is **not** proposed as an unconditional product change.

## Conditions and provenance

| Item | Recorded value |
|---|---|
| Repository | `tetsujisugimori-coder/calculator-memo` |
| Initial branch / state | `main`, clean; `HEAD` and fetched `origin/main` both `2087868b572b707de86635a88306dc010a2a544f` |
| Isolated source candidate | `d453a9d4eb3b6f12897b3d83e6cdd5724dbba67f`, 2026-10-18 12:25 JST |
| Selection basis | Date-only first-parent history: the candidate was the last listed `main` first-parent commit before the next listed commit, `53a36d5beda76ad04395091a93c1e982c69dcdf9` at 12:45 JST. The candidate itself was tested and showed the defect. No fix commit message, PR, or diff was used to choose it. |
| Selection limitation | The exact historical repair boundary is unverified; date proximity and a reproduced failure establish a buggy candidate, not necessarily the immediate pre-fix parent. |
| Experiment isolation | Detached Git worktree under the Copilot session files directory; no historical branch was pushed or used as a PR base. |
| Copilot CLI | 1.0.103 |
| Model | Auto mode; the concrete model was not exposed to this session |
| Runtime / tools | Windows; Node 24.20.0, npm 11.17.0, Git 2.53.0.windows.1, `gh` 2.96.0, Playwright 1.56.1 |
| Browser engines | Playwright Chromium 141.0.7390.37 and WebKit 26.0 |

The repository specifies Node 22.13.0 for CI/E2E; local checks ran on Node 24.20.0. This mismatch is recorded and not represented as a pinned-runtime verification.

## Information contamination

**Contaminated.** Repository-startup instructions required reading current docs; `README.md` / `e2e/README.md` included Unicode-sign and whitespace URL-editing regression context, and the Issues listing exposed a historical Issue title about calculator editing. This knowledge was seen before the cause analysis. The historical repair PR, its diff, and post-fix product source were not opened. Therefore, the implementation was developed against the isolated pre-fix source, but the work cannot be described as fully blind or independent of all historical hints.

Sources consulted: current `AGENTS.md`, `README.md`, `docs/agent/github-workflow.md`, `docs/agent/verification-policy.md`, `e2e/README.md`, the first 35 lines of `LOG.md`, date-only Git history, and current Issue/open-PR listings. The repair PR/diff and any post-fix source were deliberately not consulted.

## Reproduction

Repository documentation describes CE/± as editing the trailing numeric entry, and the calculator normalizer accepts Unicode minus and whitespace. It does not specify every cursor/editing edge case below. The expected outcomes are therefore stated as experiment acceptance criteria consistent with those controls and ordinary arithmetic, not as a claim that every edge case was an explicit published contract.

| Input and action | Expected | Observed on candidate |
|---|---|---|
| `12-34`; CE | Preserve subtraction prefix `12-` so a replacement operand can be entered | `clearEntry` returned `12` |
| `12-34`; ± | Negate only the final operand, yielding `12--34` (=46) | `toggleSign` returned `1234` |
| `−34`; ± / CE | Toggle to `34` / clear the signed entry | ± returned `−-34`; CE retained `−` |
| `12　−　34　`; ± | Preserve the binary Unicode minus and whitespace; negate only `34` | Appended the incomplete `(-` suffix |
| `12-34`; `=`; CE; type `5` | Resume editing as `12-5` | Chromium rendered `5`, replacing the whole expression |
| `12　−　34　`; `=`; Backspace twice; type `5` | Edit the current expression and retain its prefix | The post-fix Chromium/WebKit case passed; the pre-fix focused run stopped at the earlier ASCII failure, so this exact GUI sequence was not separately observed before the fix. |

**Minimal observed GUI reproduction:** open the calculator with `?expr=12-34`, press `=`, press `CE`, then press `5`. The saved expression should be `12 − 5`; on the candidate the LCD showed `5`. The same test also verifies the calculated result before editing (`-22`). The pre-fix focused Playwright run failed on Chromium at this assertion; WebKit was not reached in that run.

Baseline normalization was independently exercised: `calculateExpression("12　−　34")` returned `-22`, so ordinary expression evaluation accepted the Unicode minus and full-width spaces. The failures were in edit-token handling/state transitions, not the arithmetic normalizer.

## Cause analysis and hypothesis

**Hypothesis recorded before changing source:** the edit helpers classify the trailing operand from raw characters rather than the normalized expression context. A preceding minus can be mistaken for the operand’s unary sign; a Unicode minus or trailing whitespace evades the ASCII-only, end-anchored matcher. Separately, CE/Backspace/± can change an expression without leaving the post-`=` state, so the next digit is interpreted as a new calculation.

| Required detail | Finding |
|---|---|
| Causal processing | `lib/calculator.ts` used `/-?\d*\.?\d+%?$/` for CE and ±. It treated ASCII `-` as part of a final number without checking whether it followed an operand, did not recognize U+2212 in edit helpers, and failed to match when trailing whitespace followed the number. `CalculatorApp` did not clear `afterEquals` for CE, Backspace, or ± (including keyboard Backspace). |
| Trigger | Editing a complete expression ending in an operand after binary subtraction; using U+2212; inserting ASCII/full-width whitespace; or editing after `=` and then entering another digit. |
| Actual behavior | Subtraction could be lost or concatenated (`12-34` → `1234` on ±); CE could erase the subtraction operator; Unicode/space forms could produce a malformed sign suffix; a post-confirmation digit could start a new expression instead of continuing the edited one. |
| Expected behavior | Classify a minus by its preceding significant token, preserve a binary operator, toggle only a unary sign, tolerate supported whitespace/Unicode minus, and transition from confirmed to editing on every edit action. |
| Fix direction | Parse the trailing numeric token with supported minus glyphs and whitespace, distinguish binary from unary minus by the preceding significant character, preserve expression spacing, and clear the confirmed-result state on keypad and keyboard edits. |
| Possible effects | Only calculator edit helpers and edit-state transitions are changed in the patch. Numeric evaluation, percent expansion, storage shape, history schema, and memo data are untouched. `12--34` is explicitly evaluated in a regression test to protect arithmetic semantics. |

## Patch and test evidence

The complete isolated source/test delta is stored as [`unicode-minus-editing.patch`](unicode-minus-editing.patch). It changes only:

- `lib/calculator.ts`
- `components/CalculatorApp.tsx`
- `tests/calculator.test.ts`
- `e2e/unicode-editing.mjs`

| Phase | Command / result |
|---|---|
| Candidate unit reproduction | `npm test -- tests/calculator.test.ts` in the detached worktree: **4 failed, 24 passed** (28 total). Failures were the subtraction-preserving CE/± cases, Unicode leading minus, and full-width-space Unicode-minus editing. The whitespace-aware arithmetic assertion passed. |
| Candidate GUI reproduction | `node e2e/unicode-editing.mjs` against a Pages build made before the source patch: Chromium failed as expected (`'5' !== '12 − 5'`). WebKit was not reached because the harness stops on the first browser failure. |
| After patch | `npm test`: **58 passed / 6 files**. |
| After patch | `npm run lint`: passed. |
| After patch | `npx --no-install tsc --noEmit`: passed. |
| After patch | `npm run build`: passed; existing large-chunk and route-classification notices remained. |
| After patch | `npm run build:pages`: passed; existing large-chunk notice remained. |
| After patch | `node e2e/unicode-editing.mjs`: focused UI scenarios passed in **Chromium and WebKit**, covering ASCII subtraction, U+2212, full-width spaces, CE, post-confirmation editing, and keyboard Backspace. |
| Patch artifact | `git apply --check unicode-minus-editing.patch` passed in a fresh detached worktree at the recorded candidate SHA. |

An initial test command was accidentally run from the original checkout and was not baseline evidence. The correctly scoped run first exposed missing baseline dependencies; dependencies were then installed in the detached worktree and the failing reproduction above was rerun. No tracked files in the original checkout were changed by that mistake.

**Focused browser setup/commands:** build the candidate with `npm run build:pages`, install `npm ci --prefix e2e --ignore-scripts`, install the lockfile browsers using `node e2e/node_modules/playwright/cli.js install chromium webkit`, serve with `npm run preview:pages -- --host 127.0.0.1 --port 4281 --strictPort`, then run `node e2e/unicode-editing.mjs`. The baseline GUI failure was run against a build produced before applying the source patch; the after-patch run used a rebuilt Pages output.

## Self-assessment

| Category | Score | Evidence and deduction |
|---|---:|---|
| Cause identification | 26/30 | Unit failures and GUI behavior independently point to raw trailing-token classification and stale `afterEquals`; deducted because historical boundary is unproven and context was contaminated. |
| Fix accuracy | 22/25 | Token-aware minus classification and edit-state reset pass the reproduced scenarios and existing arithmetic suite; deducted because Node 22 CI and full repository GUI workflow were not run locally. |
| Test quality | 23/25 | New focused tests fail before and pass after; existing suite and both local browser engines pass. The complete pre-fix WebKit sequence was not run. |
| Safety and explanation | 17/20 | Work was isolated, `main` remained clean, patch is reviewable, limitations are explicit; deducted for information contamination and the runtime mismatch. |
| **Total** | **88/100** | |

## Codex CLI comparison conditions

For a fair follow-up, give Codex the same detached candidate SHA and the reproduction criteria/commands, but do not supply this patch artifact, this report’s cause/fix sections, or the experiment branch/PR. Start from a separate clean copy of `d453a9d4eb3b6f12897b3d83e6cdd5724dbba67f`; keep its files and logs separate. Since this report and patch will be visible in the repository, the follow-up must avoid browsing this experiment branch/PR and must record any accidental exposure.

Comparison data to hold constant: candidate commit, Unicode/ASCII/space expressions and edit operations, pre/post-`=` steps, focused unit and browser commands, synthetic-only data, browser engines, and runtime where possible. Copilot CLI version was 1.0.103; model was Auto and the concrete model is not available. The exact tested source paths, patch, commands, output counts, and tool/browser versions are recorded above.

## Unverified items and outstanding checks

- Exact immediate historical pre-fix commit relationship remains unverified without consulting the forbidden repair PR/diff.
- The experiment is information-contaminated; do not report it as a blind pass.
- Node 22.13.0 and GitHub Actions checks have not yet been run. Local validation used Node 24.20.0 on Windows.
- The focused pre-fix browser run stopped on Chromium’s first failing assertion; it did not run the later cases or WebKit before the fix.
- Physical iPhone Safari, software keyboard, IME, and touch-device behavior were not tested.
- Final PR-head CI must be checked after push; no CI success is claimed here.

The experiment issue is [#79](https://github.com/tetsujisugimori-coder/calculator-memo/issues/79). The Draft PR URL and final commit/CI status are added after publication.
