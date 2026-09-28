# Outage & Gap Recovery

How the indexer behaves during Stellar RPC outages, how ledger gaps are detected, and how to replay missed events after recovery.

## RPC Outage Behaviour

The Stellar RPC polling loop runs in an **external worker** separate from this server. When the RPC node becomes unreachable:

- **Polling pauses** — the worker cannot fetch new `ChainEvent[]` batches. No events are pushed to this server.
- **No data loss** — as long as the RPC node retains historical ledger data (typically ~48 h on public nodes), no events are permanently missed. The cursor is preserved in the `indexed_ledgers` table.
- **Heartbeat degrades** — the worker stops calling `POST /api/v1/health/indexer/heartbeat`. After `INDEXER_HEARTBEAT_STALE_THRESHOLD_MS` (default: 5 min), `GET /api/v1/health/indexer` returns `status: "degraded"` with HTTP 503.
- **Cursor staleness warning** — `warnIfIndexerCursorStale()` in `src/utils/indexer-cursor-staleness.utils.ts` emits a structured warn log when `IndexedLedger.updatedAt` exceeds `INDEXER_CURSOR_STALE_AGE_WARNING_MS` (default: 5 min). Gated by `ENABLE_INDEXER_CURSOR_STALENESS_WARNING`.

Once the RPC node is reachable again, the worker resumes polling from the stored cursor. No events are missed as long as the RPC node still has the ledgers in its history.

## Ledger Gap Detection

`detectLedgerGap()` in `src/modules/indexer/ledger-gap-detection.service.ts` compares the last processed ledger against the Stellar network head:

```
gapSize = networkHead - indexedLedger.ledger
```

A structured `warn` log is emitted when `gapSize > 10` (~50 seconds at 5 s/ledger):

```json
{
   "event": "ledger_gap_detected",
   "lastProcessed": 12340,
   "networkHead": 12400,
   "gapSize": 60,
   "gapRange": { "start": 12341, "end": 12400 }
}
```

The function is called on indexer startup and can be called periodically during operation. It returns a `LedgerGap` object with range details.

> **Note:** `fetchStellarNetworkHead()` currently returns a mock value (`12_400`) in development. A `// TODO` marks where the real Stellar RPC call should be wired. Do not rely on gap detection in production until that TODO is resolved.

## Manual Replay

When a gap is detected after an outage, an admin can replay missed ledgers via the replay endpoint.

### Endpoint

```
POST /api/v1/admin/indexer/replay
```

**Headers:** `x-admin-id` (required), `Authorization: Bearer <admin-token>` (required)

**Body:**

| Field         | Type    | Required | Description                                                                                      |
| ------------- | ------- | -------- | ------------------------------------------------------------------------------------------------ |
| `startLedger` | number  | yes      | First ledger sequence to replay (must be >= 1)                                                   |
| `endLedger`   | number  | no       | Last ledger to replay (must be >= startLedger). Omit to replay through the current network head. |
| `dryRun`      | boolean | no       | Validate input and acquire lock without processing events (default: `false`).                    |

### Behaviour

1. **Validation** — `startLedger` is required and must be a positive integer. `endLedger` is optional but must be >= `startLedger`.
2. **Lock acquisition** — a background job lock (`indexer-replay`) is acquired to prevent concurrent replays. Returns HTTP 409 `CONFLICT` if a replay is already running.
3. **Audit** — on a non-dry-run replay, an audit event is emitted via `emitAuditEvent()` with action `replay_indexer_events`.
4. **Processing** — each replayed ledger batch goes through the full write path:
   - Activity feed inserts
   - Ownership read-model upserts (`updateOwnership()` with balance deltas)
   - Price snapshot upserts (`upsertPriceSnapshot()` — idempotency guard prevents stale data from overwriting newer trades)
   - Cursor advancement (`updateIndexedLedger()`)

### Concurrent replay protection

```json
// HTTP 409
{
   "success": false,
   "error": {
      "code": "CONFLICT",
      "message": "Indexer replay job is already running",
      "details": [
         {
            "field": "indexerReplayLock",
            "message": "Lock is held by admin-abc until 2026-07-19T14:00:00Z"
         }
      ]
   }
}
```

### Dry-run mode

Set `dryRun: true` to validate the request, check the lock, and emit the audit event without processing any ledgers. Useful for verifying the range before committing to a replay.

## Consequences of an Unreplayed Gap

If a ledger gap is **not** replayed after an outage, the following data becomes permanently inaccurate:

| Area                   | Impact                                                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Price snapshots**    | `currentPrice` and `price24hAgo` in `creator_price_snapshots` reflect pre-outage prices. Trades that occurred during the gap are missing. The 24-hour rotation logic (`price24hAgo` promoted from `currentPrice`) will calculate against the wrong baseline. |
| **Ownership balances** | `keyOwnership` rows show incorrect `balance` values. Every buy/sell during the gap is absent, so holder balances are off by the sum of missed deltas.                                                                                                        |
| **Activity feed**      | No `KEY_BOUGHT` / `KEY_SOLD` records for trades during the gap. The feed is permanently incomplete.                                                                                                                                                          |
| **Webhooks**           | Registered callback URLs never receive delivery for missed trade events. Creators relying on webhook-driven workflows will not be notified.                                                                                                                  |

Recovery requires a manual replay (`POST /api/v1/admin/indexer/replay`) with the correct `startLedger` through `endLedger` range.

---

See also:

- [Indexer Architecture](./ARCHITECTURE.md) — overview of the polling and write pipeline
- [Event Processing](./EVENT_PROCESSING.md) — deduplication and idempotency guarantees
- [Retry and Backoff](./RETRY_BACKOFF.md) — retry strategy on transient failures
- [Dead-Letter Queue Workflow](./DLQ_WORKFLOW.md) — handling events that exhaust retries
