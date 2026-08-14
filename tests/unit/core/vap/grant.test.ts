import { beforeEach, describe, expect, it } from 'vitest';
import { resetConnectionForTests } from '@/core/vault/storage';
import {
  createGrant,
  getActiveGrantByOrigin,
  getGrantById,
  listAllGrants,
  listGrants,
  revokeGrant,
  type GrantCaps,
} from '@/core/vap/grant';

const DB_NAME = 'veilpay';

const CAPS: GrantCaps = {
  maxPerOperation: '1000000000000000000', // 1 ETH
  maxPerWindow: '5000000000000000000', // 5 ETH
  windowSeconds: 86_400, // 24h
  approvalThreshold: '100000000000000000', // 0.1 ETH
  allowedOps: ['x402.pay'],
  allowedChains: ['evm'],
  allowlist: [],
};

const ORIGIN = 'https://service.example';

beforeEach(async () => {
  resetConnectionForTests();
  indexedDB.deleteDatabase(DB_NAME);
});

describe('GrantService', () => {
  it('creates a grant and lists it as active', async () => {
    const grant = await createGrant({
      clientId: ORIGIN,
      clientLabel: ORIGIN,
      caps: CAPS,
      expiresAt: Date.now() + 86_400_000,
    });

    expect(grant.id).toBeTruthy();
    expect(grant.approvalMode).toBe('autonomous');
    expect(await listGrants()).toEqual([grant]);
  });

  it('looks up an active grant by origin and misses others', async () => {
    await createGrant({
      clientId: ORIGIN,
      clientLabel: ORIGIN,
      caps: CAPS,
      expiresAt: Date.now() + 86_400_000,
    });

    const found = await getActiveGrantByOrigin(ORIGIN);
    expect(found?.clientId).toBe(ORIGIN);
    expect(await getActiveGrantByOrigin('https://other.example')).toBeNull();
  });

  it('does not return an expired grant as active', async () => {
    const now = 1_700_000_000_000;
    await createGrant({
      clientId: ORIGIN,
      clientLabel: ORIGIN,
      caps: CAPS,
      expiresAt: now + 1000,
    });

    expect(await getActiveGrantByOrigin(ORIGIN, now)).not.toBeNull();
    expect(await getActiveGrantByOrigin(ORIGIN, now + 2000)).toBeNull();
  });

  it('revokes a grant so it is no longer active', async () => {
    const grant = await createGrant({
      clientId: ORIGIN,
      clientLabel: ORIGIN,
      caps: CAPS,
      expiresAt: Date.now() + 86_400_000,
    });

    await revokeGrant(grant.id);
    expect(await listGrants()).toEqual([]);
    expect(await getActiveGrantByOrigin(ORIGIN)).toBeNull();
    expect(await getGrantById(grant.id)).toMatchObject({ revokedAt: expect.any(Number) });
  });

  it('replacing a grant revokes the prior active grant for the same origin', async () => {
    const first = await createGrant({
      clientId: ORIGIN,
      clientLabel: ORIGIN,
      caps: CAPS,
      expiresAt: Date.now() + 86_400_000,
    });
    const second = await createGrant({
      clientId: ORIGIN,
      clientLabel: ORIGIN,
      caps: CAPS,
      expiresAt: Date.now() + 86_400_000,
    });

    expect(second.id).not.toBe(first.id);
    expect(await listGrants()).toEqual([second]);
    expect(await getGrantById(first.id)).toMatchObject({ revokedAt: expect.any(Number) });
  });

  it('rejects malformed caps', async () => {
    await expect(
      createGrant({
        clientId: ORIGIN,
        clientLabel: ORIGIN,
        caps: { ...CAPS, maxPerOperation: 'not-a-number' },
        expiresAt: Date.now() + 86_400_000,
      }),
    ).rejects.toThrow();
  });

  it('listAllGrants includes revoked grants for the audit path', async () => {
    const grant = await createGrant({
      clientId: ORIGIN,
      clientLabel: ORIGIN,
      caps: CAPS,
      expiresAt: Date.now() + 86_400_000,
    });
    await revokeGrant(grant.id);

    expect(await listGrants()).toEqual([]);
    expect(await listAllGrants()).toHaveLength(1);
  });
});
