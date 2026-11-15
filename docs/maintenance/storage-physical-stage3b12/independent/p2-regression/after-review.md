# Independent repair verification
Scope: three reopened P2 classes; working audit.mjs revision after f643. No production/native browser rerun in this review.

- Original unchanged 20-row native CI evidence remains accepted. Legitimate abort/quota UNKNOWN attempts and runtime HOLD plus reload new boot/session are positive controls, not falsely rejected.
- Supplied original script and identical 12 mutations: before 12 FALSE_ACCEPT; after all 12 rejected. Original raw bytes preserved.
- Implementation's 53 Node cases pass independently.
- Additional reviewer mutations: 46 rejected for expected semantic reasons (both engines): each abort/quota payload field separately, one main/retry event identity altered with sequence repaired, duplicated complete/readback-match/result, invented reload boot, mismatched reload native receipt count/readwrite scope, duplicate retry request.
- Source inspection: exact main/retry lifecycle cardinality and order, page/boot/session/op binding; abort current/head/receipts/copies preservation with explicit UNKNOWN attempt/HOLD; reload durable payload equality separated from changed runtime identity and native readonly chain.

No remaining P1/P2 found in these finite repair checks. This does not prove no other verifier blind spots. Three known P2 classes are closed at code-review/local regression level; formal final-HEAD CI/source/trace and preservation still must be collected for release recommendation. Previous d679 CI cannot be relabeled as repaired HEAD CI. Existing prior reports and failures stay preserved.

Limits: native reload event exposes receipt count and head/current, not full copies/attempt payload; full payload equality therefore additionally depends on captured snapshot evidence. This is not malicious-forgery-proof attestation, physical Safari, OS eviction, or storage-media durability. HOLD and real-data prohibition remain.
