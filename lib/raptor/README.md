# RAPTOR Runtime Notes

Do not add new corridor ranking rules before a Step 0 diagnostic proves the
expected journey exists and explains why it loses. Wave 2 repeatedly showed that
apparent ranking issues can be candidate breadth, transfer graph, or display
issues instead.

Candidate breadth is a tradeoff, not a pure benefit. FU7 reduced routed pairs
from roughly 500 to 100 per broad query, improving native p95 and moving
`taras-volcan-irazu-pin-oeste` from ACCEPTABLE to strict PASS.

Keep `minotor` pinned to exact `11.2.2` and never import `minotor/parser` from
app code.
