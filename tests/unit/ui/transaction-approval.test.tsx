import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionApproval } from '@/ui/components/TransactionApproval';
import type { PendingApproval } from '@/ui/store/useWallet';

const TX_APPROVAL: PendingApproval = {
  id: 'req-1',
  kind: 'tx',
  origin: 'https://dapp.example',
  address: '0x1111111111111111111111111111111111111111',
  to: '0x2222222222222222222222222222222222222222',
  value: '1500000000000000000', // 1.5 ETH
  createdAt: 1_000,
};

const SIGN_APPROVAL: PendingApproval = {
  id: 'req-2',
  kind: 'sign',
  origin: 'https://dapp.example',
  address: '0x1111111111111111111111111111111111111111',
  message: '0x68656c6c6f20776f726c64', // "hello world"
  createdAt: 1_000,
};

describe('TransactionApproval', () => {
  it('shows transaction details and approve/reject actions', () => {
    render(
      <TransactionApproval approval={TX_APPROVAL} onApprove={() => {}} onReject={() => {}} />,
    );

    expect(screen.getByText('Approve transaction')).toBeInTheDocument();
    expect(screen.getByText(/dapp\.example/)).toBeInTheDocument();
    expect(screen.getByText(/0x2222/)).toBeInTheDocument(); // recipient
    expect(screen.getByText('1.5000 ETH')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('shows the message to sign for a signature request', () => {
    render(
      <TransactionApproval approval={SIGN_APPROVAL} onApprove={() => {}} onReject={() => {}} />,
    );

    expect(screen.getByText('Approve signature')).toBeInTheDocument();
    expect(screen.getByText('0x68656c6c6f20776f726c64')).toBeInTheDocument();
  });

  it('calls onReject when the user rejects', async () => {
    const user = userEvent.setup();
    const onReject = vi.fn(async () => undefined);
    render(<TransactionApproval approval={TX_APPROVAL} onApprove={() => {}} onReject={onReject} />);

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('calls onApprove when the user approves', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn(async () => undefined);
    render(<TransactionApproval approval={SIGN_APPROVAL} onApprove={onApprove} onReject={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });
});
