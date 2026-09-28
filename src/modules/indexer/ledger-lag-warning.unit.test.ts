// src/modules/indexer/ledger-lag-warning.unit.test.ts
// Unit tests for #602 — structured warn log when indexer falls behind by > 50 ledgers.
//
// Uses jest mocks — no database required.

import { detectLedgerGap } from './ledger-gap-detection.service';
import { prisma } from '../../utils/prisma.utils';
import { logger } from '../../utils/logger.utils';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../utils/prisma.utils', () => ({
   prisma: {
      indexedLedger: {
         findFirst: jest.fn(),
      },
   },
}));

jest.mock('../../utils/logger.utils', () => ({
   logger: {
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
   },
}));

// The service hard-codes the mock network head at 12_400.
// We test against that value.
const MOCK_NETWORK_HEAD = 12_400;

const mockPrisma = prisma as unknown as {
   indexedLedger: { findFirst: jest.Mock };
};

const mockLogger = logger as unknown as {
   warn: jest.Mock;
   error: jest.Mock;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLedgerRecord(ledger: number) {
   return {
      id: 1,
      ledger,
      cursor: `${ledger}-000`,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
   };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('#602 indexer lag warning log', () => {
   beforeEach(() => {
      jest.clearAllMocks();
   });

   // ── Warning emitted when gap > 50 ─────────────────────────────────────────

   it('emits a warn log when gap exceeds 50 ledgers', async () => {
      // gap = 12_400 - 100 = 12_300 (> 50)
      mockPrisma.indexedLedger.findFirst.mockResolvedValue(
         makeLedgerRecord(100)
      );

      await detectLedgerGap();

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
   });

   it('warn log contains latest_processed_ledger field', async () => {
      mockPrisma.indexedLedger.findFirst.mockResolvedValue(
         makeLedgerRecord(100)
      );

      await detectLedgerGap();

      const [logContext] = mockLogger.warn.mock.calls[0];
      expect(logContext).toHaveProperty('latest_processed_ledger', 100);
   });

   it('warn log contains latest_network_ledger field', async () => {
      mockPrisma.indexedLedger.findFirst.mockResolvedValue(
         makeLedgerRecord(100)
      );

      await detectLedgerGap();

      const [logContext] = mockLogger.warn.mock.calls[0];
      expect(logContext).toHaveProperty(
         'latest_network_ledger',
         MOCK_NETWORK_HEAD
      );
   });

   it('warn log contains gap field with correct value', async () => {
      const processedLedger = 100;
      mockPrisma.indexedLedger.findFirst.mockResolvedValue(
         makeLedgerRecord(processedLedger)
      );

      await detectLedgerGap();

      const [logContext] = mockLogger.warn.mock.calls[0];
      expect(logContext).toHaveProperty(
         'gap',
         MOCK_NETWORK_HEAD - processedLedger
      );
   });

   it('warn log contains detected_at field as ISO string', async () => {
      mockPrisma.indexedLedger.findFirst.mockResolvedValue(
         makeLedgerRecord(100)
      );

      await detectLedgerGap();

      const [logContext] = mockLogger.warn.mock.calls[0];
      expect(logContext).toHaveProperty('detected_at');
      // Must be a valid ISO 8601 timestamp
      expect(() => new Date(logContext.detected_at as string)).not.toThrow();
      expect(new Date(logContext.detected_at as string).toISOString()).toBe(
         logContext.detected_at
      );
   });

   it('all four required fields are present in a single warn call', async () => {
      mockPrisma.indexedLedger.findFirst.mockResolvedValue(
         makeLedgerRecord(100)
      );

      await detectLedgerGap();

      const [logContext] = mockLogger.warn.mock.calls[0];
      expect(logContext).toHaveProperty('latest_processed_ledger');
      expect(logContext).toHaveProperty('latest_network_ledger');
      expect(logContext).toHaveProperty('gap');
      expect(logContext).toHaveProperty('detected_at');
   });

   it('returns detected: true when gap > 50', async () => {
      mockPrisma.indexedLedger.findFirst.mockResolvedValue(
         makeLedgerRecord(100)
      );

      const result = await detectLedgerGap();

      expect(result.detected).toBe(true);
      expect(result.gapSize).toBeGreaterThan(50);
   });

   // ── Warning NOT emitted when gap ≤ 50 ─────────────────────────────────────

   it('does not emit a warn log when gap is exactly 50', async () => {
      // gap = 12_400 - 12_350 = 50 (not > 50)
      mockPrisma.indexedLedger.findFirst.mockResolvedValue(
         makeLedgerRecord(MOCK_NETWORK_HEAD - 50)
      );

      await detectLedgerGap();

      expect(mockLogger.warn).not.toHaveBeenCalled();
   });

   it('does not emit a warn log when gap is 0', async () => {
      mockPrisma.indexedLedger.findFirst.mockResolvedValue(
         makeLedgerRecord(MOCK_NETWORK_HEAD)
      );

      await detectLedgerGap();

      expect(mockLogger.warn).not.toHaveBeenCalled();
   });

   it('does not emit a warn log when gap is less than 50', async () => {
      // gap = 12_400 - 12_360 = 40 (< 50)
      mockPrisma.indexedLedger.findFirst.mockResolvedValue(
         makeLedgerRecord(MOCK_NETWORK_HEAD - 40)
      );

      await detectLedgerGap();

      expect(mockLogger.warn).not.toHaveBeenCalled();
   });

   it('returns detected: false when gap is ≤ 50', async () => {
      mockPrisma.indexedLedger.findFirst.mockResolvedValue(
         makeLedgerRecord(MOCK_NETWORK_HEAD - 30)
      );

      const result = await detectLedgerGap();

      expect(result.detected).toBe(false);
   });

   // ── Warn emitted on every tick while gap persists ─────────────────────────

   it('emits a warn log on every call while gap persists', async () => {
      mockPrisma.indexedLedger.findFirst.mockResolvedValue(
         makeLedgerRecord(100)
      );

      await detectLedgerGap();
      await detectLedgerGap();
      await detectLedgerGap();

      expect(mockLogger.warn).toHaveBeenCalledTimes(3);
   });
});
