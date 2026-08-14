import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditView } from '@/ui/components/AuditView';
import { appendAudit } from '@/core/vap/audit';
import { resetConnectionForTests } from '@/core/vault/storage';

const DB_NAME = 'veilpay';

beforeEach(async () => {
  resetConnectionForTests();
  indexedDB.deleteDatabase(DB_NAME);
});

describe('AuditView', () => {
  it('shows an empty state', async () => {
    render(<AuditView />);
    expect(await screen.findByText('No audit entries yet.')).toBeInTheDocument();
  });

  it('lists audit entries with their payloads', async () => {
    await appendAudit('grant.created', { grantId: 'g1' }, 1_000);
    render(<AuditView />);

    expect(await screen.findByText('grant.created')).toBeInTheDocument();
    expect(screen.getByText(/grantId/)).toBeInTheDocument();
  });

  it('verifies an unbroken chain', async () => {
    await appendAudit('grant.created', { grantId: 'g1' }, 1_000);
    await appendAudit('op.settled', { amount: '1' }, 2_000);

    const user = userEvent.setup();
    render(<AuditView />);
    await screen.findByText('grant.created');

    await user.click(screen.getByRole('button', { name: 'Verify chain' }));
    expect(await screen.findByText(/valid — no tampering/i)).toBeInTheDocument();
  });
});
