# PR #120 Space activation investigation (2026-11-03 JST)

## Scope and causal classification

**CONFIRMED at the input/activation layer**: Chromium 141.0.7390.37 can lose the native Space activation after touch. Trusted keydown and keyup reach the same connected, focused native button, but its active state clears before release and no click occurs. The application therefore receives no toggle request; waiting for the deselected accessible name times out. This occurs in a standards-mode plain HTML button with no React, and in the application. This is not evidence of a stale Playwright locator, a lost React state update after click, or a regression introduced by six-job CI splitting.

**UNKNOWN inside the browser**: which internal update clears active in this particular interleaving. A proposed 150ms touch active timer was tested with CDP `input,blink.user_timing` tracing. Four failed native cases contained no `EventHandler::activeIntervalTimerFired` event, so that specific timer explanation is not claimed. Hover/compatibility-pointer updates are hypotheses, not established causes. CI load may affect occurrence, but CPU/parallelism is not established as the cause.

The old CI has key event names, timestamps and pressed/focus labels, but not trust/default prevention/node identity/active-state telemetry. Therefore we do not retroactively claim to have observed browser internals in that run. The new controlled counterexample establishes a sufficient failure mechanism with the same externally observed signature.

## Primary evidence and comparisons

- Original requested failure: HEAD `24bd7dfd56a7bed4b0850cb092c0114d87705be6`, [run 41574499909](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/41574499909), [job 125714910099](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/41574499909/job/125714910099), [artifact 13203171508](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/41574499909/artifacts/13203171508). Chromium375 light: first Space down/up/click succeeds; second down/up has no click and selected remains true. Full synthetic result retained in `original-ci-preview.json`.
- Fixed B `2f95a1d965df47aed76a399ef13729f1b2b412aa`: [run 41386901845/job 125089719205](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/41386901845/job/125089719205). Original Chromium375 light/dark pass, Chromium390 light second Space loses click (`fixed-b-original-preview.json`). This is the same signature, not proof that every historical R1 has the same browser-internal cause.
- Prior success `b577b588aa4ce69c35a1697bd744295ee56fdff2`: [run 41521805029/job 125539444679](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/41521805029/job/125539444679). Original job JSON verifies 8/8 preview cases and down/up/click for both Space operations.
- Product UI blob for 120 and B: `1d3e654e65e4b182df8e0315986075cd7c46e54e`; original preview test blob `0347f0e4e5ce9aa6ab17e7e1340f49d3d89eaef5` and Modal blob `5d549c0ae45a4e70cdc07ea8db206cbb9638ec7a` are identical across these three references and main A. A/B have different Stage3A UI but the toggle function is identical.

`e2e/diagnose-selection-space.mjs` is a finite eight-case diagnostic: four keyboard-only and four touch-twice-then-keyboard trials, two Space inputs each, same Chromium141, 375x844, touch/mobile, DPR2, synthetic data. The fixed 16ms key hold is an experimental **input duration**, not a sleep used to pass an assertion. No retry is used. Standalone worktrees and freshly built/owned local servers were used. Local Node24.22.1 differs from CI's pinned22.13.0, so this is not a bit-for-bit CI-environment reproduction.

- Failed120 baseline: keyboard-only4/4 correct; mixed0/4 correct (each first Space lost; second selected instead of removing).
- FixedB: keyboard-only4/4 correct; mixed1/4 correct.
- Prior-success118: keyboard-only4/4 correct; mixed1/4 correct.
- Working-tree fix: keyboard-only4/4 and mixed4/4 correct (`fixed-comparison.json`). Native standards-mode button: keyboard-only4/4 correct, mixed0/4 correct (`native-comparison.json`). Thus the same diagnostic input and final-state expectation give application mixed RED4/4 → GREEN4/4, with no waiting-condition change.

This disproves the proposition that a previous successful CI run guarantees absence of the mixed-input defect. Timing instrumentation changes scheduling: four heavily instrumented full-flow cases at zero and16ms key holds all succeeded, and these are retained as limited non-reproductions, not RED→GREEN evidence. A preliminary run with incomplete copied dependencies is excluded from acceptance; locked `npm ci` succeeded subsequently.

## Chosen correction and alternatives

`SelectionCandidateButton` owns only plain Space's press/release lifecycle:

1. A non-repeat, uncancelled keydown arms that exact button and prevents the browser's competing Space activation.
2. Repeat does not create extra activations. Blur clears the armed press; a replacement component starts unarmed.
3. Keyup clears the arm, prevents duplicate native activation, and requires the same connected, enabled, focused button and unmodified release.
4. Exactly one application `button.click()` invokes the existing onClick→toggle path. This click intentionally has `isTrusted=false`; its originating key pair must be trusted in browser acceptance. This is application event routing, not Playwright forced click or a test-created state update.
5. Pointer, assistive-technology click and Enter retain the native button path. aria-pressed, labels, item keys, focus, storage, planning and execution prohibitions are unchanged.

This is an explicit local browser-interoperability workaround, not a claim to repair Chromium. A global keyboard shim, timeout extension, arbitrary delay, retry, changing expected state, or moving keyboard to a separate context was rejected. A test-only wait for pointer-active disappearance would change the rapid mixed-modality condition rather than make the control handle it.

## Verification and oracle

- Existing eight preview scenarios remain, with all storage byte/write, accessibility/layout, invalidation, touch and error assertions intact.
- Added same-context tap×2 then four Space toggles, trusted key pair, one routed click, final label/pressed state, same DOM identity and focus, cancelled press/refocus, keyup-only, repeat and native Enter.
- Ten component tests cover state transitions, same node/focus, repeated input, cancellation, replacement, disabled-before-release, modifiers and prevented events.
- Ten Node oracle controls include missing/duplicate click, missing state update, wrong label, replaced/detached DOM, focus escape, untrusted key and native default left unsuppressed. All corrupt results must fail; none is injected into production data.
- Self-check at the implementation working tree: all2666 unit tests, original eight preview browser contexts plus extended contract pass. Full Node-contract parallel invocation first failed one pre-existing 0.1s synthetic-process-start assertion under load; its unchanged serial invocation passes103/103. First failure is retained in local logs and described here, not relabelled PASS. Workflow remains unchanged except adding new contract tests to the preview job; it already executes that file separately.
- Formal six-job scenario/aggregate implementation and1128/592/132 requirements are unchanged. Final HEAD CI and artifacts are the authority for submission status. Independent review is separate and pending at authoring.

## Remaining limits

No real user data, real restore/save execution, Stage3B, merge or deployment. R2 is not addressed. Browser-internal active-clear scheduling remains UNKNOWN. Physical iPhone Safari, VoiceOver, OS text zoom and real OS backgrounding are NOT_TESTED. Linux WebKit emulation is not a substitute. No historical PR117/118 evidence is overwritten.

Exact Chromium source supporting the native active gate (not proof of the unobserved clearer):
- [HTMLButtonElement default handler](https://github.com/chromium/chromium/blob/141.0.7390.37/third_party/blink/renderer/core/html/forms/html_button_element.cc#L391)
- [HTMLElement Space activation](https://github.com/chromium/chromium/blob/141.0.7390.37/third_party/blink/renderer/core/html/html_element.cc#L3108)
- [Touch timer hypothesis tested, not established](https://github.com/chromium/chromium/blob/141.0.7390.37/third_party/blink/renderer/core/input/event_handler.cc#L2370)
- [Quirks selector behavior](https://github.com/chromium/chromium/blob/141.0.7390.37/third_party/blink/renderer/core/css/selector_checker.cc#L321): early native experiments omitted DOCTYPE, so their bare `:active` readings were discarded. Published causal native evidence uses standards mode.
