# Stage 3B-11: isolated atomic compare/use research

2026-11-14 JST. Refs #144. Base main `164dcaf0e630cc5a1464283b9847656d602fa734`, tree `80ae73825f52d627c7957770b7b39c8bc3b1dc14`; PR #143 merged. Existing Stage 3B-4 token/receipt inspection and Stage 3B-10 native-page evidence are reference contracts, not automatically new acceptance.

**Stage 3B HOLD; executionAllowed=false; writeAllowed=false; authority=NOT_ESTABLISHED.** Only UUID-named synthetic IDB databases in fresh browser contexts may be written. No application imports, real profiles, production storage switch, migration, restoration or automatic retries. A synthetic commit is not product authority or physical durability.

## Fixed plan before execution

Same readwrite transaction must re-read all dependent stores, compare token/incarnation/generation/operation and complete target binding, then atomically update current, preserved copy and receipt. No network, timer or user waiting inside the transaction. Read request success, commit completion and independent readback are separately evidenced. UNKNOWN stays HOLD; later receipt diagnosis cannot authorize replay.

Normal/race cases A–R: same-token two-page race; other writer after check; pre-transaction change; queued overlapping writer; abort; close during transaction; post-complete ack loss; delayed/duplicate/missing notification; older-session response; content ABA; generation/incarnation rollback; lock failure/waiter close; nonparticipant writer; reload/reconnect; IDB/localStorage divergence; target/namespace mismatch; missing/overflow generation/invalid receipt; operation reuse after UNKNOWN.

Expected control properties: at most one conditional commit from a shared token; stale/mismatched dependencies reject without a conditional mutation; abort never reports success; uncertain interruption/ack/readback yields UNKNOWN and no retry. Native actual state and observation outcome are kept separate. Full unobserved ABA with no version change and legacy localStorage exclusion remain UNKNOWN, not falsely proven.

Negative controls must detect: external comparison; removed generation/incarnation/operation validation; excluded dependent store; stale-token acceptance; success on abort; success before complete; accepting stale-session reply; ignored receipt/raw mismatch; missing competing-writer rows; cross-trial evidence. Semantic RED, startup/environment failure and normal GREEN are separate. Auditor tests reject dropped/tampered/reordered/duplicate/foreign-HEAD records.

## Evidence and limits

Record exact HEAD/tree/branch, CI run/attempt, browser version, case, page/boot/session/operation/transaction IDs, sequence/timing, precondition token, request and committed state, receipt/readback, abort/complete, UNKNOWN/HOLD, cleanup and sentinel state. Preserve raw JSON/trace/source fingerprints and hashes. Reaggregate originals independently; incomplete case/cleanup/inventory is not PASS.

Formal product GUI remains 6 conditions / 1128 checks / 592 geometry / 132 PNG, separate from new isolated acceptance. Existing tests/lint/types/both builds and storage contracts remain unchanged. New exact-HEAD CI and independent review required. Windows archival preferred; private Space handoff may be prepared, but incomplete Windows transfer is not ARCHIVE PASS.

Physical Safari, private browsing, real quota/eviction, physical media, OS kill, old client enumeration/control and malicious same-origin interference are NOT_TESTED/UNKNOWN. No merge, Draft release or deployment.

## Status

Implementation/browser tests/negative controls/CI/independent review/archive: NOT_TESTED at plan commit. Results must be recorded with tested SHA in PR, not inferred from prior successes.
