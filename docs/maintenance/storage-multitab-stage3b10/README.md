# Stage 3B-10: real browser multi-tab synthetic acceptance

Refs Issue #142. Stage 3B remains HOLD, executionAllowed=false, writeAllowed=false,
authority=NOT_ESTABLISHED. No production imports, UI, writer, migration or final
product writes are added. Existing formal GUI 6 / 1128 / 592 / 132 is unchanged.

## Boundary and implementation

The runner owns a random-port 127.0.0.1 HTTP server. Each of 15 cases in Chromium
and WebKit creates a fresh, isolated browser context with three actual pages.
External origin requests and service workers are blocked. The only test database
is a UUID-prefixed stage3b10-test namespace. A separately named synthetic sentinel
database and localStorage sentinel are established on that otherwise empty
origin, compared byte-for-byte after deletion of the test namespace, and retained
until the context is disposed. Browser profiles/context state are not reused.

The existing Stage 3B-8 createDecisionLifecycle and Stage 3B-9 syntheticObservation
are imported by a test-only bundle, not copied or imported into the app. The IDB
record is a synthetic Observation envelope, NOT the production database schema or
a Stage 3B-4 writer adapter. Reads use real readonly IDB transactions under shared
Web Locks. Cooperative synthetic writes use exclusive locks and native readwrite
transactions. The nonparticipant case writes from C while B holds the lock,
showing that Web Locks do not fence nonparticipants.

Cases cover bidirectional A/B plus three-tab BroadcastChannel delivery; a held
old notification delivered after a newer one and then duplicated; stale evidence;
generation-bearing A/B/A; initial successful review then changed state before
review-use; reload and real page close/replacement; disconnect, missed message
and reconnect; session closure and physical page closure during pending reads;
channel failure; unavailable reads; a contended real lock; a noncooperative writer;
and an older delayed response after explicit newer evidence generation.

Notifications only invalidate, never grant authority. Raw durable-read generation
and message generation are separate. Controlled pause/release barriers are test
orchestration, not a claim that browser scheduling itself is deterministic.
A successful review grants only matching-observation review reuse at the existing
useForReview boundary. It does NOT close any gap after the final read, establish
atomic product writes, or prove unobserved ABA with a nonincremented generation.
Physical Safari, real user media/data, production coordination and arbitrary
nonparticipant safety remain unverified. Stage 3B-11 is a separate design only.

## Evidence and negative controls

Every event records a logical page ID, browser-binding-assigned page ordinal,
boot UUID, monotonic per-boot sequence, wall and monotonic timestamps, observed
generation, message send/receive IDs where relevant, decision ID/fingerprint,
status/checking/reusable and fixed HOLD authority. The runner verifies binding
source page and frame. Snapshot checks reference exact raw event sequence/boot.
Raw page events, computed checks, trace ZIPs, bundle, SHA/tree/dirty state and
browser versions are saved under ignored gui-evidence/multitab-HEAD-MODE-UUID.
The verifier rejects incomplete/duplicate cases, page errors, missing/uncorrelated
messages, invalidated evidence revival, inconsistent checkpoints and cleanup.
Artifact verification hashes bundle/raw/trace and compares raw rows with summary.
This is reproducible evidence, not a tamper-proof proof: the PR can modify its own
harness/workflow, so independent review remains necessary.

At a clean committed HEAD with pinned dependencies and installed browsers:

```
node --test e2e/storage-multitab-evidence.node-test.mjs
EXPECTED_SHA=$(git rev-parse HEAD) node e2e/run-storage-multitab.mjs
node e2e/multitab-negative-controls.mjs
```

The last command first validates a complete same-HEAD normal run and its files,
then rejects 12 damaged evidence variants. It launches two explicit browser
mutants: accepting cached stale observations and disabling real communication.
Both must exit 1 with the specific expected failed case; their summaries remain
FAIL/RED and are never counted as successful normal cases. The control campaign
is separately labeled PASS-controls-only. The dedicated pinned workflow runs
normal acceptance and the negative controls separately, fails closed on missing
artifacts, and retains outcomes/artifacts for seven days. Missing browser setup,
timeouts, absent cases and page failures are failures, not skips.

Local commands and exact tested commits/results will be reported separately.
No CI or browser success is claimed by this document before execution.
