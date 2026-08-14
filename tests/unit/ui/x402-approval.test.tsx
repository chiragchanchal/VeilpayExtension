import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { X402Approval } from '@/ui/components/X402Approval';
import type { PendingX402Payment } from '@/ui/store/useWallet';

const PAYMENT: PendingX402Payment = {
  id: 'pay-1',
  origin: 'https://service.example',
  challenge: {
    scheme: 'x402',
    amount: '1500000000000000000', // 1.5 ETH
    asset: 'ETH',
    chain: 'evm',
    payTo: '0x1111111111111111111111111111111111111111',
    nonce: 'nonce-1',
    expiry: 1_700_000_060_000,
    resource: '/protected',
    description: 'Paid API access',
  },
  createdAt: 1_000,
};

const TINY_PAYMENT: PendingX402Payment = {
  ...PAYMENT,
  challenge: { ...PAYMENT.challenge, amount: '1000' }, // 1000 wei
};

describe('X402Approval', () => {
  it('shows the service, resource, chain, amount, and recipient', () => {
    render(<X402Approval payment={PAYMENT} onApprove={() => {}} onReject={() => {}} />);

    expect(screen.getByText('Approve payment')).toBeInTheDocument();
    expect(screen.getByText(/service\.example/)).toBeInTheDocument();
    expect(screen.getByText('Paid API access')).toBeInTheDocument();
    expect(screen.getByText('/protected')).toBeInTheDocument();
    expect(screen.getByText('evm')).toBeInTheDocument();
    expect(screen.getByText('1.5 ETH')).toBeInTheDocument();
    expect(screen.getByText(/0x1111/)).toBeInTheDocument(); // recipient
    expect(screen.getByRole('button', { name: 'Pay' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('falls back to base units for a sub-displayable amount', () => {
    render(<X402Approval payment={TINY_PAYMENT} onApprove={() => {}} onReject={() => {}} />);

    expect(screen.getByText('1000 ETH (base units)')).toBeInTheDocument();
  });

  it('calls onReject when the user rejects', async () => {
    const user = userEvent.setup();
    const onReject = vi.fn(async () => undefined);
    render(<X402Approval payment={PAYMENT} onApprove={() => {}} onReject={onReject} />);

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('calls onApprove when the user approves', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn(async () => undefined);
    render(<X402Approval payment={PAYMENT} onApprove={onApprove} onReject={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Pay' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });
});
