import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/sidepanel/App';
import { useWallet } from '@/ui/store/useWallet';

const INITIAL_STORE = {
  vaultState: 'uninitialized' as const,
  unlockedUntil: null,
  accounts: [] as { chain: 'evm' | 'solana' | 'stellar'; index: number; address: string; path: string }[],
  accountIndex: 0,
  balances: {},
  zkCapability: null,
  pendingApproval: null,
  isLoading: false,
  error: null,
};

type Incoming = { kind: string; payload: unknown };
type Responder = (message: Incoming) => unknown;

function uuid() { return crypto.randomUUID(); }

function buildResponder(overrides: Partial<Record<string, unknown>> = {}): Responder {
  return (message) => {
    const kind = message.kind as string;
    const data = overrides[kind];
    if (data === undefined) return { id: uuid(), ok: true, data: undefined };
    return { id: uuid(), ok: true, data };
  };
}

function installResponder(overrides: Partial<Record<string, unknown>> = {}): void {
  const responder = buildResponder(overrides);
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(
    (...args: unknown[]) => {
      const message = args.length >= 2 ? args[1] : args[0];
      return responder(message as Incoming);
    },
  );
}

beforeEach(() => {
  useWallet.setState(INITIAL_STORE);
  installResponder({
    'vault.status': { state: 'uninitialized', unlockedUntil: null },
    'zk.capability': null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  useWallet.setState(INITIAL_STORE);
});

describe('side panel', () => {
  it('shows a loading indicator while initializing', () => {
    useWallet.setState({ isLoading: true, vaultState: 'uninitialized' });
    render(<App />);
    expect(screen.getByText('Loading wallet…')).toBeInTheDocument();
  });

  it('shows the no-wallet prompt for an uninitialized vault', async () => {
    render(<App />);
    // The mount effect calls refresh(), which toggles isLoading before resolving;
    // await the steady state where the store settles on uninitialized.
    expect(await screen.findByText('No wallet yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Veilpay popup' })).toBeInTheDocument();
  });

  it('shows the unlock screen when the vault is locked', async () => {
    useWallet.setState({ vaultState: 'locked' });
    installResponder({
      'vault.status': { state: 'locked', unlockedUntil: null },
      'zk.capability': null,
    });

    render(<App />);

    expect(await screen.findByText('Wallet is locked')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Passphrase')).toBeInTheDocument();
  });

  it('renders the dashboard when the vault is unlocked', async () => {
    const accounts = [
      { chain: 'evm' as const, index: 0, address: '0x0000000000000000000000000000000000000001', path: "m/44'/60'/0'" },
    ];
    useWallet.setState({ vaultState: 'unlocked', accounts });
    installResponder({
      'vault.status': { state: 'unlocked', unlockedUntil: Date.now() + 60_000 },
      'zk.capability': null,
      'account.balance': {
        chain: 'evm',
        address: '0x0000000000000000000000000000000000000001',
        balance: '1000000000000000000',
      },
    });

    render(<App />);

    expect(await screen.findByText('Veilpay')).toBeInTheDocument();
    expect(screen.getByText('Portfolio')).toBeInTheDocument();
    expect(screen.getByText('Assets')).toBeInTheDocument();
  });

  it('redirects to the popup for send/receive/import when the flow lives there', async () => {
    const accounts = [
      { chain: 'evm' as const, index: 0, address: '0x0000000000000000000000000000000000000001', path: "m/44'/60'/0'" },
    ];
    const user = userEvent.setup();
    useWallet.setState({ vaultState: 'unlocked', accounts });
    installResponder({
      'vault.status': { state: 'unlocked', unlockedUntil: Date.now() + 60_000 },
      'zk.capability': null,
      'account.balance': {
        chain: 'evm',
        address: '0x0000000000000000000000000000000000000001',
        balance: '1000000000000000000',
      },
    });

    render(<App />);

    const sendBtn = await screen.findByRole('button', { name: 'Send' });
    await user.click(sendBtn);

    // The side panel calls chrome.action.openPopup() when a send/receive/import
    // button is clicked (those flows live in the popup).
    expect(chrome.action.openPopup).toHaveBeenCalled();
  });

  it('surfaces a pending dapp transaction approval over the dashboard', async () => {
    useWallet.setState({
      vaultState: 'unlocked',
      accounts: [],
      pendingApproval: {
        id: 'req-1',
        kind: 'tx',
        origin: 'https://dapp.example',
        address: '0x0000000000000000000000000000000000000001',
        to: '0x0000000000000000000000000000000000000002',
        value: '1000000000000000000',
        createdAt: 1_000,
      },
    });
    installResponder({
      'vault.status': { state: 'unlocked', unlockedUntil: Date.now() + 60_000 },
      'zk.capability': null,
      // The mount effect re-reads the pending approval; keep the same record.
      'tx.pending': {
        id: 'req-1',
        kind: 'tx',
        origin: 'https://dapp.example',
        address: '0x0000000000000000000000000000000000000001',
        to: '0x0000000000000000000000000000000000000002',
        value: '1000000000000000000',
        createdAt: 1_000,
      },
    });

    render(<App />);

    expect(await screen.findByText('Approve transaction')).toBeInTheDocument();
    expect(screen.getByText(/dapp\.example/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });
});
