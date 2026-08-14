import { beforeEach, describe, expect, it } from 'vitest';
import { openStorageDatabase, resetConnectionForTests } from '@/core/vault/storage';
import {
  appendAudit,
  computeEntryHash,
  exportAudit,
  verifyAuditChain,
} from '@/core/vap/audit';

const DB_NAME = 'veilpay';

beforeEach(async () => {
  resetConnectionForTests();
  indexedDB.deleteDatabase(DB_NAME);
});

describe('audit ledger', () => {
  it('appends entries with chained hashes and verifies', async () => {
    const first = await appendAudit('grant.created', { grantId: 'g1' }, 1_000);
    const second = await appendAudit('op.settled', { amount: '1' }, 2_000);

    expect(first.sequence).toBe(0);
    expect(first.previousHash).toBeNull();
    expect(second.sequence).toBe(1);
    expect(second.previousHash).toBe(first.entryHash);
    expect(await verifyAuditChain()).toEqual({ valid: true });
  });

  it('detects a tampered entry', async () => {
    await appendAudit('grant.created', { grantId: 'g1' }, 1_000);

    const db = await openStorageDatabase();
    const records = await db.getAll('auditLedger');
    const first = records[0];
    if (first === undefined) throw new Error('Expected an audit entry.');
    first.sanitizedPayload = { grantId: 'tampered' };
    await db.put('auditLedger', first);

    expect(await verifyAuditChain()).toEqual({ valid: false, brokenAt: 0 });
  });

  it('detects a broken linkage (missing middle entry)', async () => {
    await appendAudit('grant.created', { grantId: 'g1' }, 1_000);
    await appendAudit('op.settled', { amount: '1' }, 2_000);

    const db = await openStorageDatabase();
    await db.delete('auditLedger', 0);

    expect(await verifyAuditChain()).toEqual({ valid: false, brokenAt: 1 });
  });

  it('exports all entries oldest first', async () => {
    await appendAudit('grant.created', { n: 1 }, 1_000);
    await appendAudit('grant.revoked', { n: 2 }, 2_000);

    const entries = await exportAudit();
    expect(entries.map((e) => e.operationType)).toEqual(['grant.created', 'grant.revoked']);
  });

  it('computeEntryHash is deterministic and inputsensitive', () => {
    const entry = { timestamp: 1, operationType: 'x', sanitizedPayload: { a: 1 } };
    expect(computeEntryHash('prev', entry)).toBe(computeEntryHash('prev', entry));
    expect(computeEntryHash('prev', entry)).not.toBe(computeEntryHash('other', entry));
    expect(computeEntryHash(null, entry)).not.toBe(computeEntryHash('prev', entry));
  });
});
