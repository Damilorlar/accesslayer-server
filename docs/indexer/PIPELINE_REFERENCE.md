# Indexer Event Processing Pipeline Reference

This document is a comprehensive guide to the indexer's event processing pipeline. It explains how events flow from the polling worker, through deduplication and processing, how the system recovers from crashes, and where to find detailed documentation for each concern.

**Quick links:**

- [Event Processing](./EVENT_PROCESSING.md) — deduplication and idempotency detail
- [Retry and Backoff](./RETRY_BACKOFF.md) — retry strategy and exhaustion behaviour
- [Architecture](./ARCHITECTURE.md) — end-to-end write path and data models
- [Local Setup Guide](../README.md) — how to set up the indexer for development

---

## Table of Contents

1. [Polling Mechanism](#polling-mechanism)
2. [Event Ordering](#event-ordering)
3. [Retry Strategy](#retry-strategy)
4. [Crash Recovery](#crash-recovery)
5. [Processing Guarantees](#processing-guarantees)
6. [Troubleshooting](#troubleshooting)

---

## Polling Mechanism

### Overview

The indexer uses an external polling worker to fetch events from the Stellar blockchain. This server (access-layer-server) does not perform the polling itself — it receives events as `ChainEvent[]` payloads and processes them idempotently.

### Ledger Range Fetching

The external worker:

1. **Reads the resume point** from this server's `IndexedLedger` table (row ID = `1`)
   - Field `ledger`: the highest ledger already fully processed
   - Field `cursor`: an opaque pagination token for the Soroban RPC
   - Field `updatedAt`: ISO timestamp of the last update

2. **Fetches a batch** from the Stellar blockchain
   - Uses `STELLAR_SOROBAN_RPC_URL` and `STELLAR_HORIZON_URL` (configured in the external worker, not this server)
   - Retrieves all events in ledgers from `ledger + 1` to `ledger + BATCH_SIZE`
   - Typical batch size: 100–500 ledgers (configurable in the external worker)

3. **Polls continuously** at an interval
   - Typical polling interval: every 5–30 seconds (configurable in the external worker)
   - If no new events are found, the ledger range is advanced with the same retry logic

4. **Posts events to this server**
   - Calls the indexer event sink endpoint (typically `POST /api/v1/indexer/events`)
   - Sends the batch as `ChainEvent[]` JSON
   - This server returns synchronously after processing or moving to the DLQ

### Progress Tracking

After successfully processing a batch, the external worker calls `updateIndexedLedger(ledger, cursor)` to persist:

```typescript
// Located in src/modules/indexer/ledger-gap-detection.service.ts
export async function updateIndexedLedger(
   ledger: number,
   cursor: string
): Promise<void> {
   await prisma.indexedLedger.update({
      where: { id: 1 },
      data: { ledger, cursor, updatedAt: new Date() },
   });
}
```

If this call succeeds, the next fetch will start from `ledger + 1`. If it fails, the batch must be retried (see [Retry Strategy](#retry-strategy)).

### Gap Detection

The function `detectLedgerGap()` in `src/modules/indexer/ledger-gap-detection.service.ts` compares the server's `IndexedLedger.ledger` against the Stellar network head. If the gap exceeds **10 ledgers** (~50 seconds at 5 s/ledger):

```typescript
if (networkHeadLedger - indexedLedger.ledger > 10) {
   logger.warn(
      { gap, indexedLedger: indexedLedger.ledger },
      'Large ledger gap detected'
   );
}
```

**Note:** In development, the network head is mocked to `12_400`. A `// TODO` comment marks where the real RPC call will go. Do not rely on this in production until resolved.

### Cursor Staleness

If `IndexedLedger.updatedAt` is older than `INDEXER_CURSOR_STALE_AGE_WARNING_MS` (default: 5 minutes), the helper `checkIndexerCursorStalenessFromStore()` emits a warn log:

```
wallet_address: N/A
message: "Indexer cursor is stale (X minutes without progress)"
```

This warns that the external worker has not made progress recently. Enable/disable with the feature flag `ENABLE_INDEXER_CURSOR_STALENESS_WARNING` (see [Feature Flags](./FEATURE_FLAGS.md)).

---

## Event Ordering

### Order Within a Ledger

Events arrive as `ChainEvent[]` from the external worker, already sorted by the Stellar blockchain:

1. **Ledger sequence** — events are grouped by ledger (ascending)
2. **Transaction order** — within a ledger, events are sorted by transaction index
3. **Event index** — within a transaction, events are sorted by `eventIndex` (ascending)

This ordering is preserved by the Stellar RPC APIs (`STELLAR_SOROBAN_RPC_URL`), so events always flow downstream in a deterministic order.

### Processing Order

`processIndexerChainEvents(events, handler)` in `src/utils/indexer-event-processor.utils.ts`:

1. **Deduplicates** by `txHash:eventIndex` (removes duplicates from overlapping batches)
2. **Maintains order** — deduped events retain their original sequence
3. **Processes sequentially** — one event per iteration, using a `for` loop
4. **Emits one log per event** — after each event completes successfully

```typescript
export async function processIndexerChainEvents<T extends IndexerChainEvent>(
   events: T[],
   handler: (event: T) => Promise<void>
): Promise<void> {
   const uniqueEvents = dedupeChainEvents(events);

   for (const event of uniqueEvents) {
      await processIndexerChainEvent(event, handler);
   }
}
```

### Guarantees

- **No out-of-order processing**: events are handled in the order they appear on-chain
- **No skipped events**: every unique event is processed exactly once per batch (dedup removes only true duplicates)
- **No parallelization**: sequential processing ensures balance changes and price updates are idempotent

See [Event Processing](./EVENT_PROCESSING.md) for deduplication details.

---

## Retry Strategy

### What Triggers a Retry

A retry is triggered when:

1. **Database write fails** (e.g. constraint violation, connection timeout)
2. **Webhook dispatch fails** (event delivered to callback URL)
3. **Ledger cursor update fails** (the `updateIndexedLedger` call)
4. **External API timeout** (if any RPC calls occur during processing)

When any of these fails, the entire batch is retried (or the job is moved to the DLQ if retries are exhausted).

### How Many Retries

The retry count is determined by `INDEXER_MAX_RETRIES` or a sensible default (typically 5–10 attempts). Each retry uses an exponential backoff strategy:

```
delay = applyJitter( min(maxDelayMs, baseDelayMs * 2^attempt), jitterFactor )
```

**Default backoff schedule** (before jitter):

| Attempt | Delay   |
| ------- | ------- |
| 0       | 1s      |
| 1       | 2s      |
| 2       | 4s      |
| 3       | 8s      |
| 4       | 16s     |
| 5+      | 30s cap |

After applying jitter (default `INDEXER_JITTER_FACTOR = 0.1`), delays vary by ±10%.

See [Retry and Backoff](./RETRY_BACKOFF.md) for full details, including configuration env vars.

### Exhaustion Behavior

When a job exhausts all retries:

1. **Move to DLQ** — the batch is moved to the `indexerDLQ` table via `moveToDLQ()`
2. **Record captured** — stores `jobType`, `payload`, `retryCount`, `failureReason`, and `errorDetails`
3. **Job is paused** — no further retries are attempted automatically
4. **Observable** — `getDLQDepth()` exposes the DLQ backlog to monitoring

**If DLQ is disabled** (`ENABLE_INDEXER_DLQ=false`), retry-exhausted jobs are logged and dropped (silent job loss).

### Idempotency and Retries

Because retries may re-process the same event:

- **All writes must be idempotent** (upsert, not insert)
- The `activity` table uses a unique constraint on `(txHash, eventIndex)` (if present)
- `updateOwnership()` uses `upsert` with `{ increment: balanceChange }`
- `upsertPriceSnapshot()` checks `tradeAt ≤ lastTradeAt` to skip stale events

---

## Crash Recovery

### How Crash Recovery Works

If the indexer or this server crashes mid-batch:

1. **Last update persists** — `IndexedLedger` was last written after the previous batch
   - If batch N crashes, `IndexedLedger.ledger` still points to batch N−1
2. **Restart reads the resume point** — on restart, the external worker reads `IndexedLedger` again
3. **Re-fetches batch N** — the worker starts from `IndexedLedger.ledger + 1` (same as before the crash)
4. **Dedup absorbs overlaps** — events from batch N are deduped; any already-written events are skipped by idempotent operations

### Resume Point Logic

The resume point is determined by:

```typescript
const resumeLedger = indexedLedger.ledger; // Highest fully-processed ledger
const nextBatch = resumeLedger + 1; // Start here
```

This means:

- **After batch 100 succeeds**: `IndexedLedger.ledger = 100`, next fetch starts at ledger 101
- **If batch 101 crashes**: `IndexedLedger.ledger` is still 100, next restart fetches 101 again
- **On restart, batch 101 is retried**: events are deduped and idempotent ops (upsert) ensure no duplicates

### No Events Are Lost

Because:

1. **Ledger cursor is durable** — persisted to `IndexedLedger` table
2. **Batch requests are idempotent** — re-fetching the same ledger range yields the same events
3. **Event processing is idempotent** — re-processing the same event via upsert/check has no side-effect

---

## Processing Guarantees

### Exactly-Once Delivery (Per Event)

Events are processed exactly once per batch because:

1. **Deduplication** removes event duplicates (same `txHash:eventIndex`)
2. **Idempotent writes** ensure re-processing has no side-effect
3. **Cursor update is atomic** — either the batch succeeds fully, or it is retried in toto

### Strong Ordering

Events are processed in the order they appear on-chain:

1. **Ledger order preserved** — ledgers are processed sequentially
2. **Event order preserved** — within a ledger, events are in transaction order
3. **Sequential processing** — no parallelization within a batch

This ensures balance changes and price updates happen in the correct order.

### Atomic Cursor Advance

The batch is considered complete only after:

1. All events are processed (inserted to `activity`, upserted to `keyOwnership`, etc.)
2. All webhooks are dispatched (or queued for retry)
3. The cursor is updated via `updateIndexedLedger()`

If step 3 fails, the batch is retried. If steps 1–2 partially succeed but step 3 fails, re-processing is safe due to idempotency.

---

## Troubleshooting

### Indexer Falls Behind (Large Ledger Gap)

**Symptom**: `detectLedgerGap()` logs show gap > 10 ledgers

**Possible causes**:

1. External worker is not running or is paused
2. Network connectivity issue between worker and this server
3. Database is slow or unresponsive
4. Batch size is too small (fetch overhead dominates)

**Steps**:

1. Check if the external worker is running: `ps aux | grep indexer`
2. Check `IndexedLedger.updatedAt` — is it recent?
3. Check the server logs for errors during event processing
4. Increase the batch size in the external worker config if appropriate

### Cursor is Stale

**Symptom**: `checkIndexerCursorStalenessFromStore()` logs "cursor is stale"

**Possible causes**:

1. External worker crashed or is stuck
2. Event processing is very slow (bottleneck in database, webhooks, etc.)
3. Network latency or RPC timeout

**Steps**:

1. Check the external worker logs for errors
2. Check if this server is responsive: `curl http://localhost:3000/health`
3. Check database connection pool stats (if exposed)
4. Restart the external worker

### Dead-Letter Queue Growing

**Symptom**: `getDLQDepth()` increases; `indexerDLQ` table has many rows

**Possible causes**:

1. Systematic failure in event processing (e.g. bad contract data from RPC)
2. Feature flag misconfiguration (e.g. invalid rate limit values)
3. Database constraint violation (unique constraint on an already-inserted record)

**Steps**:

1. Inspect the DLQ records: `SELECT * FROM indexer_dlq ORDER BY createdAt DESC LIMIT 10;`
2. Check the `failureReason` and `errorDetails` for clues
3. Check the server logs during the failure period
4. Fix the root cause and replay the DLQ (see [Dead-Letter Queue Workflow](./DLQ_WORKFLOW.md))

### Duplicate Records Despite Deduplication

**Symptom**: Same event appears twice in the `activity` table

**Possible causes**:

1. Deduplication is disabled (`ENABLE_INDEXER_DEDUPE=false`)
2. Events have the same `txHash` but different `eventIndex` (not duplicates)
3. Multiple external workers are running without coordination (each posts a separate batch)

**Steps**:

1. Check the `eventIndex` — if different, they are separate events
2. Verify `ENABLE_INDEXER_DEDUPE=true` at startup
3. Ensure only one external worker is polling (or use a distributed lock)
4. Check the activity records' `createdAt` — did they come from different batches?

---

## See Also

- [Event Processing](./EVENT_PROCESSING.md) — in-depth deduplication and idempotency
- [Retry and Backoff](./RETRY_BACKOFF.md) — retry configuration and DLQ behavior
- [Architecture](./ARCHITECTURE.md) — write path, data models, and webhook dispatch
- [Dead-Letter Queue Workflow](./DLQ_WORKFLOW.md) — DLQ investigation and replay
- [Feature Flags](./FEATURE_FLAGS.md) — startup validation and flag reference
- [Recovery](./RECOVERY.md) — outage response and data consistency
- [Local Setup](../README.md) — how to run and test the indexer locally
