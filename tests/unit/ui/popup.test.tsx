import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/popup/App';
import { useWallet } from '@/ui/store/useWallet';

/**
 * Popup onboarding smoke tests.
 *
 * The popup talks to the background over `chrome.runtime.sendMessage`, which the
 * test shim stubs with `vi.fn()`. These tests replace it with a responder that
 * returns a valid protocol `Response` for each kind, so the store's `refresh`
 * resolves and the UI reaches a deterministic state.
 */

type Incoming = { kind: string; payload: unknown };
type Responder = (message: Incoming) => unknown;

function uuid(): string {
  return crypto.randomUUID();
}

const VALID_PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function buildResponder(overrides: Partial<Record<string, unknown>> = {}): Responder {
  return (message) => {
    const kind = message.kind as string;
    const data = overrides[kind];
    if (data === undefined) {
      return { id: uuid(), ok: true, data: undefined };
    }
    return { id: uuid(), ok: true, data };
  };
}

const INITIAL_STORE = {
  vaultState: 'uninitialized' as const,
  unlockedUntil: null,
  accounts: [],
  accountIndex: 0,
  balances: {},
  zkCapability: null,
  pendingApproval: null,
  isLoading: false,
  error: null,
};

/** Install a stub that answers protocol requests from the background. */
function installResponder(overrides: Partial<Record<string, unknown>> = {}): void {
  const responder = buildResponder(overrides);
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(
    (...args: unknown[]) => {
      // chrome.runtime.sendMessage has overloads:
      //   sendMessage(message, ...)  — extension sends to itself
      //   sendMessage(extensionId, message, ...) — cross-extension
      // The message is either args[0] or args[1] depending on the overload.
      const message = args.length >= 2 ? args[1] : args[0];
      return responder(message as Incoming) as never;
    },
  );
}

beforeEach(() => {
  useWallet.setState(INITIAL_STORE);
  installResponder({
    'vault.status': { state: 'uninitialized', unlockedUntil: null },
    'zk.capability': null,
    'mnemonic.generate': { mnemonic: VALID_PHRASE },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  useWallet.setState(INITIAL_STORE);
});

describe('popup onboarding', () => {
  it('shows the welcome screen for an uninitialized vault', async () => {
    render(<App />);
    expect(await screen.findByText('Welcome to Veilpay')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create new wallet' })).toBeInTheDocument();
  });

  it('walks through phrase generation to the passphrase step', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Create new wallet' }));

    // First, the phrase is hidden behind a reveal gate.
    expect(await screen.findByText('Recovery phrase')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reveal recovery phrase' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reveal recovery phrase' }));

    // Words are shown (11× "abandon" + "about").
    expect(screen.getAllByText('abandon', { selector: 'span' })).toHaveLength(11);
    expect(screen.getByText('about', { selector: 'span' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: "I've saved it" }));
    expect(await screen.findByText('Set a passphrase')).toBeInTheDocument();
  });

  it('requires matching passphrases before creating the wallet', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Create new wallet' }));
    await user.click(await screen.findByRole('button', { name: 'Reveal recovery phrase' }));
    await user.click(screen.getByRole('button', { name: "I've saved it" }));

    const [first, second] = screen.getAllByPlaceholderText(/passphrase/i);
    if (first === undefined || second === undefined) {
      throw new Error('Expected two passphrase inputs.');
    }
    await user.type(first, 'correct horse battery');
    await user.type(second, 'different passphrase');

    const create = screen.getByRole('button', { name: 'Create wallet' });
    expect(create).toBeEnabled();

    await user.click(create);
    expect(await screen.findByText('Passphrases do not match.')).toBeInTheDocument();
  });

  it('creates a vault and reaches the success screen', async () => {
    const create = vi.fn(async () => ({ state: 'unlocked' }));
    installResponder({
      'vault.status': { state: 'uninitialized', unlockedUntil: null },
      'zk.capability': null,
      'mnemonic.generate': { mnemonic: VALID_PHRASE },
      'vault.create': await create(),
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Create new wallet' }));
    await user.click(await screen.findByRole('button', { name: 'Reveal recovery phrase' }));
    await user.click(screen.getByRole('button', { name: "I've saved it" }));

    const [first, second] = screen.getAllByPlaceholderText(/passphrase/i);
    if (first === undefined || second === undefined) {
      throw new Error('Expected two passphrase inputs.');
    }
    await user.type(first, 'correct horse battery');
    await user.type(second, 'correct horse battery');

    await user.click(screen.getByRole('button', { name: 'Create wallet' }));
    expect(await screen.findByText('Wallet created')).toBeInTheDocument();
  });
});

describe('popup unlocked dashboard', () => {
  const ACCOUNTS = [
    { chain: 'evm' as const, index: 0, address: '0x0000000000000000000000000000000000000001', path: 'm/44\'/60\'/0\'' },
    { chain: 'solana' as const, index: 0, address: '11111111111111111111111111111111', path: 'm/44\'/501\'/0\'' },
    { chain: 'stellar' as const, index: 0, address: 'GD6Q6Q6Q6Q6Q6Q6Q6Q6Q6Q6Q6Q6Q6Q6Q6Q6Q6Q6Q6Q6', path: 'm/44\'/148\'/0\'' },
  ];

  it('shows the portfolio and asset list for an unlocked vault', async () => {
    useWallet.setState({ vaultState: 'unlocked', accounts: ACCOUNTS });
    installResponder({
      'vault.status': { state: 'unlocked', unlockedUntil: Date.now() + 60_000 },
      'zk.capability': null,
      'account.balance': { chain: 'evm', address: '0x0000000000000000000000000000000000000001', balance: '1000000000000000000' },
    });

    render(<App />);

    // Dashboard shows portfolio and asset sections.
    expect(await screen.findByText('Portfolio')).toBeInTheDocument();
    expect(screen.getByText('Assets')).toBeInTheDocument();
    expect(screen.getByText(/Recent Transactions/)).toBeInTheDocument();

    // Send/Receive buttons exist for each account.
    expect(screen.getAllByRole('button', { name: 'Send' }).length).toBe(3);
    expect(screen.getAllByRole('button', { name: 'Receive' }).length).toBe(3);
  });

  it('opens the send form for an account', async () => {
    const user = userEvent.setup();
    useWallet.setState({ vaultState: 'unlocked', accounts: [ACCOUNTS[0]!] });
    installResponder({
      'vault.status': { state: 'unlocked', unlockedUntil: Date.now() + 60_000 },
      'zk.capability': null,
      'account.balance': { chain: 'evm', address: '0x0000000000000000000000000000000000000001', balance: '1000000000000000000' },
    });

    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Send' }));

    expect(await screen.findByText(/Send from/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Recipient address')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Amount (base units)')).toBeInTheDocument();
  });

  it('opens the export-key modal from the asset list and reveals the key', async () => {
    const user = userEvent.setup();
    useWallet.setState({ vaultState: 'unlocked', accounts: [ACCOUNTS[0]!] });
    installResponder({
      'vault.status': { state: 'unlocked', unlockedUntil: Date.now() + 60_000 },
      'zk.capability': null,
      'account.exportKey': {
        privateKey: '0xdeadbeef',
        address: '0x0000000000000000000000000000000000000001',
      },
    });

    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Export evm private key' }));
    expect(screen.getByText(/Reveal the private key/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Export private key' }));

    expect(await screen.findByText('0xdeadbeef')).toBeInTheDocument();
  });
});
