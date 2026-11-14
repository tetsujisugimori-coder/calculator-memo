# Timeout fault-result parser fixed counterexamples

2026-11-14 JST, Refs #144 / PR #145. Independent reviewer fixed the mixed-reason counterexamples before changing the runner.

At 5141bfd the global reason check accepts one intended RED and one unrelated ENOENT failure. The corrected per-startup-block validator rejects the same immutable inputs. Both diagnostic-shaped mixed orders are covered. Normal GREEN 0/200ms and intended false-success/drop-log RED 0/200ms remain accepted. `runner-mixed-reason-red.json` and `runner-parser-green.json` retain the independent Windows Node24.20.0 before/after evidence; the input hashes are recorded there. This parser-only result does not replace final Linux subprocess execution or browser acceptance.

Original Node fixture budgets, marker order, timeout124, TERM, stage timing and shell/descendant reap assertions are unchanged. No claim is added about all descendants on outer watchdog expiry. Fault wrapper copies are isolated and cleaned; submitted wrapper and product are unchanged.
