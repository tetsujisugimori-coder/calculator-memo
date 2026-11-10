# Stage 3B: synthetic decision-evidence invalidation

Issue #138. Stage 3B HOLD. This is an isolated research fixture, NOT a production recovery UI or permission to write. Main baseline is `6173c9a3507195b476a8c1db356e1611702802db`; PR #137 was verified merged at that commit. Stage 3B-6 reconciler and Stage 3B-7B sheet builder are reused without modification. The new lifecycle wraps them; no production app, storage selector, writer, database schema, backup or existing formal GUI contract is changed.

## Snapshot and state contract

The injected reader supplies a fully detached synthetic observation: reconciler request (source/target/journal captures and scope), revision, generation, authority status/revision, backup IDs/revisions/raw contents, and selected IDs/policy. `NOT_ESTABLISHED` is the only supported authority status. Matching it is NOT establishment of authority or recovery safety. Freshness VALID only means the two observations match the generation snapshot; the embedded sheet can remain INCOMPLETE/CONFLICT. All views retain executionAllowed=false and writeAllowed=false.

Object keys are sorted recursively; arrays preserve order. Strict JSON values only; ambiguous/unsupported values, holes, nonfinite numbers and excessive depth/size are refused. SHA-256 is independently checked over UTF-16LE encoded canonical JSON, including lone-surrogate handling. Hashes and changed group names, not raw contents, appear in output. Hashes are not anonymization and this fixture never receives real data. IDs are opaque per-session sequence numbers, not timestamps. Timestamps in evidence record execution only.

UNKNOWN is the initial, failed-read, malformed-observation and uncertain-notification state. STALE records observed relevant differences or relevant invalidation hints. Invalid states are sticky: matching an old snapshot later never reinstates it. Only explicit generate creates a new evidence ID. An obsolete ID cannot be used against the new sheet. Every successful use-for-review requires two fresh reads and group equality; a pending read disables reuse. An epoch invalidates late responses after notifications, overlapping generation or disposal. There is no write/restore operation.

## Event and reader trust boundary

The browser adapter reads only a `stage3b8-test-*` localStorage key on a new loopback origin. Exact-key storage events (and clear events) invalidate; unrelated keys are ignored only because the single-key dependency is explicit. BroadcastChannel hints matching the key invalidate; unexpected hints produce UNKNOWN, never VALID. pageshow and visible visibilitychange recheck; use-time comparison remains mandatory when events are lost or an old writer does not cooperate. The engine can also receive an explicitly classified unrelated hint; callers must prove that classification. An untrusted caller cannot establish that proof merely by asserting it.

The reader is trusted to capture the declared dependencies and must not omit relevant state. The fixture has one serialized synthetic key, not a production multi-store atomic snapshot. Equal repeated reads do NOT prove absence of intermediate changes. Observed A→B→A stays STALE; unobserved A→B→A with unchanged generation/fingerprint is deliberately undetectable. A noncooperative writer or missing revision can evade historical-change detection. Review-time matching does not protect a later write against TOCTOU. No writes are implemented. Production integration requires separate approval, atomic authority/receipt and generation contracts, and a reviewed writer fence.

## Tests and reproduction

Use locked dependencies from the root and e2e package locks. At a clean committed HEAD:

```
npm ci --ignore-scripts
npm ci --prefix e2e --ignore-scripts
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run build:pages
node --test e2e/storage-decision-lifecycle-evidence.node-test.mjs
node e2e/node_modules/playwright/cli.js install --with-deps chromium webkit
EXPECTED_SHA=$(git rev-parse HEAD) node e2e/run-storage-decision-lifecycle.mjs
```

The dedicated workflow uses the same six engine/viewport/DPR conditions as formal GUI. It checks 17 named cases per condition (102 executions), native second-tab storage/BroadcastChannel, read failure, stale/reload/ABA, use-time checks and UI agreement. Visibility recheck uses a dispatched pageshow event, not physical OS suspension. Synthetic driver writes are deliberately separate from the fixture: Storage mutation APIs and IndexedDB.open are trapped in the fixture page. Every case records expected state, UI state and zero attempted fixture writes. This proves only exercised paths, not arbitrary production code absence of writes. Existing formal GUI and other storage workflows run separately unchanged.

Raw evidence is under ignored `gui-evidence/decision-lifecycle-<sha>-<uuid>/`: exact HEAD/tree, clean state, browser versions, condition, case outcomes, timestamps, fixture bundle hash, PNG SHA-256. Failures retain summary and trace. CI publishes these synthetic-only artifacts for 7 days and preserves step outcomes; retention expiry is a limitation. Successful snapshots do not substitute for a missing case; the evidence validator rejects partial/duplicate cases, missing observations, wrong dimensions, nonzero writes and running/failed outcomes. Unit tests additionally cover late async responses, malformed values, scope, revision and receipt changes, and a cached-VALID mutant.

Physical Safari, real media, real storage, production UI, noncooperative ABA history and write-time safety remain NOT_TESTED/UNKNOWN. Final CI, independent review and acceptance are recorded against the final PR HEAD, not anticipated here.
