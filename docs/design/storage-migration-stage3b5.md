# Stage 3B-5: isolated one-way migration and branch rescue

Issue [#130](https://github.com/tetsujisugimori-coder/calculator-memo/issues/130). Base main `eb8fd95bb28e992963aba3b47a14529949736058`; Stage 3B-4 #129 is merged. This is an isolated acceptance experiment, never a production migration or backend switch. Selective restore remains `executionAllowed=false`, Stage 3B HOLD.

## Boundary and intended implementation

Only synthetic source keys under `stage3b5-test-` and isolated target databases under Stage 3B-4's `stage3b4-test-` namespace are accepted. The harness serves a blank loopback origin in fresh browser contexts and does not load the product. Prefixes prevent accidental use, not malicious same-origin code. A source capability exposes read only; the engine never writes or deletes source raw.

The existing Stage 3B-4 adapter remains the atomic current/head/copy/receipt/intent implementation. An explicitly initialized synthetic empty-v1 destination is a test setup prerequisite. A genuinely absent destination can be inspected but is not silently created by migration. The migration companion journal records uncertainty separately; it does not upgrade production authority or unlock Stage 3B-4 after restart.

Preserve the exact raw string, including whitespace, unknown fields and numeric lexemes. SHA-256 over UTF-16LE code units is an identity aid, not authentication or authority. Raw equality and metadata/receipt integrity remain separate. Updated timestamps never choose a winner. Missing evidence produces UNKNOWN, not inferred parentage or invented ordering.

Migration stages are source read/validation, frozen expected state, candidate and plan, authority and collision checks, durable attempt, existing atomic IDB save, independent readback, receipt/journal verification. Source is rechecked around asynchronous boundaries. No localStorage-to-IDB transaction exists: a legacy writer may change source after a check, during IDB commit, or after the observed result. Such branches are retained for explicit inspection; no claim of permanent legacy-writer fencing is made.

## States and operations

| State | Meaning | Allowed | Forbidden |
| --- | --- | --- | --- |
| NOT_STARTED | New isolated controller | Read-only preview; explicit synthetic request | Implicit writes |
| VALIDATING | Snapshot and input checks | Read-only acquisition | Parallel execution, source writes |
| READY | Current synthetic prerequisites checked | One explicit fenced migration | Production authority |
| MIGRATING | Attempt may commit | Finish that request and verify | Second migration, overwrite rescue |
| VERIFIED | Commit/readback observed | Inspect; read-only replay of identical request if verified | Infer media durability or future equality |
| CONFLICT | Known divergent observation | Preview; explicit non-destructive branch preservation | Choose winner or merge |
| BLOCKED | Known prohibited prerequisite | Inspect only | Automatically restart writes |
| UNKNOWN | Safety/outcome insufficient | Inspect existing evidence | Retry, unlock or reinterpret as success |
| FAILED | Known failure without migration success | Inspect evidence | Assume rollback or erase source |

Close invalidates the live session and queued work. Every historical migration or rescue attempt fences a fresh instance, including a normally completed receipt. This deliberately limits the experiment to one migration attempt and one explicit rescue per destination; there is no recovery-unlock API. A new instance never treats a persisted success-like attempt as authority for another write. Safe repeated requests must cause no duplicate target generation, receipt or branch registration. Stale IDs and changed same-ID inputs are rejected.

## Branch preservation and preview

Branches retain distinct IDs, origin, exact raw/hash, and only verified generation/receipt relationships. Unknown causality stays absent. Rescue includes the independently captured target evidence so generation/receipt links can be verified, keeps old-source parent null, and validates raw hashes and identifier inventories on inspection. Journal records require consistent isolated source/destination namespaces and a genuine genesis-before migration receipt. Rescue is append-only and bounded, with transaction completion and readback; source and target are not repaired or overwritten. An additional source/target change during rescue must not be hidden by the preserved earlier pair.

The read-only diagnostic preview exposes source/destination, identifiers/generations/counts for history, notes, formulas, reports and executions, raw equality, migration/branch candidates, reasons, planned changes and protected targets, exact-raw preservation and post-operation observations. It is not connected to selective restore and grants no execution permission.

## Guarantees deliberately not claimed

No real data access/migration/rescue, production IDB authority, source deletion, automatic merging or UNKNOWN retry. No cross-backend atomicity, hostile same-origin protection, silent localStorage ABA detection, medium durability/power-loss guarantee, whole-store loss/rollback recovery, actual quota exhaustion or physical Safari acceptance. Future migration and authority cutover require separate design, independent acceptance and user approval.

The [verification ledger](../maintenance/storage-migration-stage3b5/verification.md) separates planned coverage from actual final-HEAD results, original failures and negative controls.

### Failed capture window

A source value observed during a failed rescue may not be durably captured: an old writer can replace it before the evidence append. VERIFIED rescue guarantees only its recorded pair, not lossless capture of every value ever observed. Precommit race returns UNKNOWN without claiming preservation; postappend race retains its already appended evidence but remains UNKNOWN. Metadata-only migration attempts are retry fences, not universal raw backups; expected source must match the existing frozen legacy head before target mutation. The independent reviewer classified this honest cross-backend limit separately from the repaired false-resumption defect.
