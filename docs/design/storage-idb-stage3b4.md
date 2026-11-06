# Stage 3B-4: isolated IndexedDB transaction foundation

Refs [Issue #128](https://github.com/tetsujisugimori-coder/calculator-memo/issues/128), [Draft PR #129](https://github.com/tetsujisugimori-coder/calculator-memo/pull/129). This is an acceptance implementation, not a product backend switch. `executionAllowed=false`, Stage 3B HOLD, actual selective restore write permission **NO**.

## Chosen boundary

Retrofitting the synchronous `StorageAdapter` would change the timing/error contracts of all current writers, and a Promise cast could report request success before transaction completion. We instead implement a separate asynchronous API in `e2e/fixtures/storage-idb.ts`. It imports only the existing read-only strict v1 validator. No product module imports the experiment. The writer scanner already prohibits product imports of e2e/tests; this change closes its root-relative import escape and rejects Vite `/@fs/` imports without adding any broad scanner exclusion.

The application still uses the unchanged Stage 3B-3 Facade and localStorage adapter. No migration, dual write, production namespace access, copy deletion, automatic repair, or actual selective restore execution exists. Construction requires a `stage3b4-test-` database name with a restricted suffix; the browser runner serves a blank loopback origin, uses fresh browser contexts, and never runs the product application. A namespace prefix is an accident-prevention boundary, not a defense against hostile same-origin JavaScript.

## Storage and atomic protocol

The version-1 database contains one `records` object store. The separate records are:

| Key | Stored fact |
| --- | --- |
| `head` | protocol, structure, incarnation, generation, latestOperation, frozen legacy raw snapshot |
| `current` | exact supplied JSON v1 string, including whitespace and unknown fields |
| `receipt:<operationId>` | protocol, complete token, previous operation, exact committed raw |
| `copy:<generation>` | protocol, source token, operation ID, exact previous raw |
| `intent:<operationId>` | expected token/raw, candidate raw, operation ID, pending/commit/readback/UNKNOWN phase, original failure if known |
| `control` | protocol and CLEAR/HOLD gate |
| `diagnostic:<operationId>` | original UNKNOWN failure; separate from later read-only observation |

Explicit synthetic initialization creates genesis only in an empty store. It never resets an existing store. The authority reader opens without requesting an upgrade; an absent database's creation transaction is aborted. Unknown database versions/stores and missing/corrupt records fail closed.

`authorize` explicitly confirms the current token, exact raw and legacy snapshot for one live synthetic instance. Merely inspecting or reopening never authorizes a write. `save` detaches the request before awaiting, validates protocol/candidate/schema/ID, and requires the native cross-tab Web Lock coordinator. It then:

1. Reads and validates the complete store in a readwrite transaction. Checks `(structure, incarnation, generation, latestOperation)`, exact expected raw, legacy snapshot, operation uniqueness, outstanding intent/HOLD and capacity. Persists intent and waits for that transaction's `complete`.
2. Starts a separate readwrite transaction and repeats integrity, expected-state and intent checks **inside that transaction**. Stages current, head, source copy, receipt and COMMIT_RECORDED intent. Resolves only at transaction `complete`; a put's success callback cannot return commit success.
3. Independently reads back and validates the complete snapshot and expected candidate/token. Persists READBACK_MATCH only after rechecking the state in another transaction.
4. Returns VERIFIED only after the outer coordinator also returns. Only that live instance records this completion in volatile memory. Each authorization owns a unique session identity; close/versionchange invalidate it. Queued saves capture that identity and cannot revive after a later authorization. Authorization also checks the identity after its read await, and a committed result invalidated before outer return becomes UNKNOWN. This means observed transaction commit plus readback, not durable media flush or a promise about future reads.

The Web Lock serializes intent through result handling; transaction-internal checks remain mandatory. Two preauthorized tabs with the same old token produce one VERIFIED and one proven CONFLICT. ABA A→B→A still changes generation and latestOperation. Stale incarnation, reused operation ID, unknown protocol/structure, unsafe integers and missing history are rejected. If interference is detected after durable intent, the result remains UNKNOWN/HOLD rather than claiming no attempted operation.

There is no eviction or compaction. Copies are capped at eight and aggregate serialized copy records at 4,194,304 UTF-16 units; each raw is capped at 2,097,152 units. Receipt count is capped at 256, although the stricter eight-copy cap is reached first. Capacity refusal occurs before new intent/mutation. Safe-integer validation and overflow guard are explicit; an impossible huge generation with missing receipts is corrupt, not an accepted near-overflow state. Production eight localStorage slots are untouched.

## UNKNOWN, restart and evidence

Runtime phases distinguish PREVALIDATION, INTENT_DURABLE, TRANSACTION_RUNNING, COMMIT_OBSERVED, READBACK_MATCH, SESSION_RESULT_OBSERVED and UNKNOWN/HOLD/EXPLICIT_RECONCILIATION_REQUIRED. A request success followed by abort leaves primary/token/copy/receipt unchanged, but the operation remains UNKNOWN with its intent. Exceptions after commit or readback mismatch cannot claim rollback: the newly committed raw may exist.

UNKNOWN disables the instance and attempts an atomic diagnostic/UNKNOWN-intent/HOLD update. A failure to persist diagnostics retains the earlier durable nonterminal intent and runtime HOLD. A failed initial intent transaction prevents primary mutation; it returns unavailable and stops that instance. An active fence is checked at every asynchronous transaction boundary so a rejected coordinator cannot later start a primary write. Outside coordinator rejection uses the same failure recorder, including after READBACK_MATCH. Original failure and subsequent recovery observation are never merged into a historical success.

Persisted READBACK_MATCH cannot prove that the outer coordinator completed. A new instance therefore reports HOLD for **any** prior intent, including a previously normal save, and `authorize` refuses it. This deliberately conservative isolated foundation has no recovery-unlock API: evidence can be inspected/exported manually, but restart/reconciliation UX and resumed production authority belong to a future reviewed step. The same live instance can continue only after its own observed completed operations; a different preauthorized stale tab gets CONFLICT and cannot use somebody else's historical result as new write authority.

## Authority and legacy divergence

`inspect(legacyRaw)` is read-only and receives the independently acquired legacy snapshot as an input fact. It validates current/receipt bytes, every generation/link/incarnation, copy preimages, intent bases and receipt correspondence, control and known protocol/structure. It always returns `writeAllowed=false` and `executionAllowed=false`; READ_ONLY means a consistent observation, not production authority. It does not create records, delete/acknowledge intents, repair history or authorize migration.

The caller must freshly acquire legacy raw when asking for an observation. A changed old-localStorage snapshot produces HOLD and leaves both stores untouched. This snapshot comparison is **not** an atomic cross-backend transaction or proof that an old writer cannot change localStorage immediately afterward. Old-tab writes are not auto-imported; rescue/export and product authority switching remain separate work. LocalStorage ABA without notification, unknown earlier legacy edits, malicious same-origin rewriting, complete-store rollback/deletion and total storage loss are not solved.

## Verification and limitations

See the [verification ledger](../maintenance/storage-idb-stage3b4/verification.md) and independent evidence for actual commands, source hashes, RED→GREEN, browser/CI provenance and unverified cases. Fault hooks are isolated-only and classified separately from native multiple tabs, versionchange, transaction abort and actual page close. Clean browser process restart is tested with a fresh isolated persistent profile; active-transaction page closure uses explicitly injected queued reads to keep the native transaction open and verifies independently constructed all-old/all-new primary records. A synthesized QuotaExceededError is not real disk exhaustion. Playwright WebKit is not physical Safari. No power-loss, disk-flush, uncontrolled renderer/browser-process crash guarantee is claimed.

Next work: explicitly approved one-way migration, old-localStorage fork rescue, production authority switching, capacity/receipt compaction, recovery UX/unlock protocol, and real-device Safari acceptance. None is enabled by this PR.
