# Virginia selected-origin negative balances

Five read-only requests to the existing official `storeNearby` endpoint on October 29 returned HTTP 200 with the exact requested product and origin store. The original response bodies and SHA-256 digests are retained here. No authentication, alternate host, proxy, or source-access override was used.

These are the same five product/origin pairs that prevented complete partitions in workflow `40846038572`: 103/019880 (-8), 330/022092 (-1), 103/020376 (-5), 134/018006 (-12), and 312/016483 (-6).

The parser previously rejected the negative number, then reported that the selected origin was absent. The repair preserves the original accounting balance and exact response identity. The internal quantity placeholder is zero with `quantityIsExact: false`, availability is unknown, and inventory/watch alerts are disabled. This observation completes response accounting only; it does not confirm stock or an exact zero. Nearby stores cannot substitute for the selected origin.

All statewide completeness, supported-premise, positive-stock, freshness, and publication guards remain in force. These diagnostic captures are fixtures, not a production coverage result. A fresh accepted production collection is still required.
