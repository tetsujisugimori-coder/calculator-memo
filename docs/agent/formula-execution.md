# Registered formula execution

## Boundary

The library stores reusable definitions identified by stable IDs. Execution keeps a separate input draft per ID and an ephemeral confirmed result. `inspectFormulaDefinition` extracts the allowed AST's variable names; constants and function names are excluded. A formula name is never a function invocation or another formula reference. Existing evaluator, numeric limits, percent rules, formatting and old storage fields are unchanged.

The execution UI uses native text inputs and existing identification settings. Calculation is explicit. Any input change clears the confirmed result; reload/reopen restores only drafts. A live definition/title mismatch hides an old confirmed result. A deleted definition cannot run. Changed definitions warn before the user explicitly calculates again. Values surviving a definition change are visible, not silently considered a confirmed result.

## Scope and initial values

Only a note explicitly chosen by the user supplies initial values. Its blocks are evaluated in document order using existing note-variable semantics, with a fresh Map. Text and old-mode blocks cannot define variables. A failed assignment preserves the previous valid value, matching the note editor. No global scope or cross-note merging. Import fills empty fields and never overwrites entered values or the source note. Imported doubles are converted to exact editable decimal strings, including negative zero and tiny numbers.

## Safe execution and transfer

Inputs allow signed decimal numbers, with input length and finite/safe-magnitude checks. Formula validation and execution reuse existing AST/security limits. The confirmed snapshot copies the original ID, title, expression, used input strings and unrounded numeric value. It is never written into the library definition.

For ordinary history and single-calculation memos, approved SymbolNodes are replaced by parenthesized numeric ASTs. Constants use decimal serialization rather than mathjs's exponent-format printing. This is structural substitution, not string replacement. The complete bound expression is reevaluated by the ordinary calculator and must satisfy `Object.is` with the execution value, including negative zero. Handoff rechecks this invariant. It does not rely on display strings. If expansion exceeds existing limits or cannot preserve the exact raw result, execution succeeds but transfer is disabled with an explanation. No limits are relaxed.

History carries optional `formulaExecution` provenance (original ID/title/expression/inputs), while its ordinary expression/result fields remain standalone and editable. Single-memo expression is also self-contained; its text records the original execution. That text is explicitly historical, not a live link when the memo expression is later edited. Library rename/deletion does not alter either record. The existing variable formatter can show a near-integer differently from the ordinary formatter; transfer preserves raw numbers and uses the destination's existing display rule.

## Persistence

Top-level schemaVersion 1 gains optional `formulaExecutions`: up to 200 records with `formulaId`, expression-at-input and input strings. Partial invalid numeric input is intentionally retained for correction. Structural validation rejects malformed/oversized records and duplicate IDs; existing storage recovery preserves raw data and stops auto-save. Missing field is valid old data. Existing unknown supported fields are retained. No confirmed result is restored as current. Deleted-ID drafts are pruned during the next draft save; deleting a definition does not change history or notes. Browser storage failures remain visible through the existing save-error UI and cannot guarantee persistence. Older application versions may discard newer optional fields.

## Verification and limits

Unit tests cover input/error classes, precision/negative zero/tiny values, AST and numeric boundaries, stale-independent snapshots, draft and old-data loading, note scope/order and 500 independent JavaScript Math comparisons. Existing 1000-formula regression remains part of the full suite. GUI adds execution and handoff cases in all existing six Chromium/WebKit configurations, including 375px/390px, light/dark and CSS 200% text probes. CSS enlargement is not OS text scaling. Real iPhone Safari, software keyboard, OS IME, assistive technologies and long-term browser eviction remain unverified.

No nested library references, related reports, scientific-notation input, unit conversion or new percent syntax. Issue #19 remains independent.
