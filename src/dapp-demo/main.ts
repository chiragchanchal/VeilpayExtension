/**
 * dApp demo page — exercises the extension's `window.veilpay` provider.
 *
 * The content script injects the provider into http://localhost pages, so this
 * page (served by the Vite dev server) can call the real wallet end-to-end:
 * connect, approve, send, and sign. See ../dapp-demo.html for the layout.
 */
import { createX402Interceptor } from '@/core/x402/interceptor';
import { buildDemoSolanaTransfer } from '@/dapp-demo/wire';

interface VeilpayProvider {
  version: string;
  isVeilpay: boolean;
  ping(): Promise<{ receivedAt: number }>;
  status(): Promise<{ state: 'uninitialized' | 'locked' | 'unlocked' }>;
  ethereum: {
    isVeilpay: boolean;
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  };
  solana: {
    isVeilpay: boolean;
    connect(): Promise<{ publicKey: { toString: () => string } }>;
    signTransaction(transaction: string): Promise<{ signature: string; signedTransaction: string }>;
    signMessage(message: string, publicKey?: string): Promise<{ signature: string; publicKey: string }>;
  };
  agent?: {
    payChallenge(challenge: unknown): Promise<{ paymentHeader: string }>;
    requestGrant(request: unknown): Promise<{ grantId: string }>;
    listGrants(): Promise<unknown>;
    revokeGrant(id: string): Promise<{ ok: boolean }>;
    getCapabilities(): Promise<{ x402: boolean; grants: boolean }>;
  };
}

declare global {
  interface Window {
    veilpay?: VeilpayProvider;
  }
}

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id}`);
  return el as T;
}

function log(el: HTMLElement, label: string, value: unknown): void {
  const isErr = value instanceof Error;
  const text = isErr
    ? `${value.name}: ${value.message}`
    : typeof value === 'string'
      ? value
      : JSON.stringify(value, null, 2);
  el.textContent = `▸ ${label}\n${text}`;
  el.className = `out ${isErr ? 'err' : 'ok'}`;
}

function setProviderBadge(): void {
  const badge = $<HTMLElement>('provider-badge');
  if (window.veilpay?.isVeilpay === true) {
    badge.textContent = 'veilpay detected';
    badge.className = 'badge on';
  } else {
    badge.textContent = 'not detected';
    badge.className = 'badge off';
  }
}

function requireProvider(): VeilpayProvider {
  if (window.veilpay?.isVeilpay !== true) {
    throw new Error('window.veilpay is not available. Load the extension and open this page on http://localhost.');
  }
  return window.veilpay;
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function bind(id: string, fn: () => Promise<unknown> | unknown, outId: string): void {
  $(id).addEventListener('click', () => {
    const out = $(outId);
    Promise.resolve()
      .then(fn)
      .then((value) => log(out, id.replace(/^btn-/, ''), value))
      .catch((cause: unknown) => log(out, id.replace(/^btn-/, ''), cause));
  });
}

bind('btn-ping', async () => {
  const provider = requireProvider();
  return provider.ping();
}, 'out-status');

bind('btn-status', async () => {
  const provider = requireProvider();
  return provider.status();
}, 'out-status');

bind('btn-chainid', async () => {
  const provider = requireProvider();
  return provider.ethereum.request({ method: 'eth_chainId' });
}, 'out-evm');

bind('btn-switch', async () => {
  const provider = requireProvider();
  const chainId = $<HTMLInputElement>('switch-chain').value.trim();
  if (!/^0x[0-9a-fA-F]+$/.test(chainId)) {
    throw new Error('Chain ID must be hex, e.g. 0xaa36a7 (Sepolia).');
  }
  // EIP-1193 returns null on success; unsupported chains throw 4902.
  return provider.ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId }],
  });
}, 'out-evm');

bind('btn-accounts', async () => {
  const provider = requireProvider();
  return provider.ethereum.request({ method: 'eth_accounts' });
}, 'out-evm');

bind('btn-connect', async () => {
  const provider = requireProvider();
  return provider.ethereum.request({ method: 'eth_requestAccounts' });
}, 'out-evm');

bind('btn-send', async () => {
  const provider = requireProvider();
  const to = $<HTMLInputElement>('tx-to').value.trim();
  const value = $<HTMLInputElement>('tx-value').value.trim();
  if (!/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error('Value must be hex wei, e.g. 0xde0b6b3a7640000 (1 ETH).');
  }
  return provider.ethereum.request({
    method: 'eth_sendTransaction',
    params: [{ from: undefined, to, value }],
  });
}, 'out-evm');

bind('btn-sign', async () => {
  const provider = requireProvider();
  const accounts = (await provider.ethereum.request({ method: 'eth_requestAccounts' })) as {
    accounts: string[];
  };
  const address = accounts.accounts[0];
  if (address === undefined) throw new Error('No connected EVM account.');
  return provider.ethereum.request({
    method: 'personal_sign',
    params: [$<HTMLInputElement>('sign-msg').value, address],
  });
}, 'out-evm');

bind('btn-sol-connect', async () => {
  const provider = requireProvider();
  const result = await provider.solana.connect();
  return { publicKey: result.publicKey.toString() };
}, 'out-sol');

bind('btn-sol-signmsg', async () => {
  const provider = requireProvider();
  const connected = await provider.solana.connect();
  const publicKey = connected.publicKey.toString();
  return provider.solana.signMessage($<HTMLInputElement>('sol-msg').value, publicKey);
}, 'out-sol');

bind('btn-sol-mktx', async () => {
  // Build a demo transfer from the connected Solana account to a fixed address.
  const provider = requireProvider();
  const connected = await provider.solana.connect();
  const feePayer = connected.publicKey.toString();
  const to = '11111111111111111111111111111111'; // SystemProgram id as a no-op destination
  const lamports = 1_000_000n; // 0.001 SOL
  const blockhash = '11111111111111111111111111111111'; // zero-ish blockhash (demo only)
  const serialized = buildDemoSolanaTransfer(feePayer, to, lamports, blockhash);
  $<HTMLInputElement>('sol-tx').value = serialized;
  return { note: 'Built demo transfer; click signTransaction to sign it.', serialized };
}, 'out-sol');

bind('btn-sol-signtx', async () => {
  const provider = requireProvider();
  const serialized = $<HTMLInputElement>('sol-tx').value.trim();
  if (serialized.length === 0) throw new Error('Paste or build a serialized transaction first.');
  return provider.solana.signTransaction(serialized);
}, 'out-sol');

// ---------------------------------------------------------------------------
// x402 agent payments
// ---------------------------------------------------------------------------

// The challenge fetched from the reference server, kept for the pay step.
let x402Challenge: unknown = null;

bind('btn-x402-fetch', async () => {
  const server = $<HTMLInputElement>('x402-server').value.trim().replace(/\/+$/, '');
  // The interceptor annotates 402 responses with a parsed x402 challenge, so a
  // real challenge arriving on WWW-Authenticate / X-402-Challenge is detected
  // automatically rather than assumed from a JSON body.
  const intercepted = createX402Interceptor(fetch);
  const response = (await intercepted(`${server}/challenge`)) as Response & {
    x402Challenge?: { scheme: 'x402' } & Record<string, unknown>;
  };
  if (response.status === 402 && response.x402Challenge !== undefined) {
    x402Challenge = response.x402Challenge;
    return {
      note: '402 + x402 challenge detected by the interceptor. Click "Pay & replay" to approve and pay.',
      challenge: response.x402Challenge,
    };
  }
  const data = (await response.json()) as { challenge: unknown };
  x402Challenge = data.challenge;
  return {
    note: 'Challenge fetched. Click "Pay & replay" to approve and pay.',
    challenge: data.challenge,
  };
}, 'out-x402');

bind('btn-grant-request', async () => {
  const provider = requireProvider();
  if (typeof provider.agent?.requestGrant !== 'function') {
    throw new Error('window.veilpay.agent.requestGrant is not available in this build.');
  }
  // Request a small grant: 0.01 ETH/op, 0.1 ETH/window, auto under 0.001 ETH.
  // The wallet's approval overlay must be approved (3s hold) before it exists.
  const { grantId } = await provider.agent.requestGrant({
    caps: {
      maxPerOperation: '10000000000000000', // 0.01 ETH
      maxPerWindow: '100000000000000000', // 0.1 ETH
      windowSeconds: 86_400, // 24h
      approvalThreshold: '1000000000000000', // 0.001 ETH
      allowedOps: ['x402.pay'],
      allowedChains: ['evm'],
      allowlist: [],
    },
    expiresInSeconds: 604_800, // 7 days
  });
  return {
    grantId,
    note: 'Grant created. x402 payments under the threshold now auto-approve.',
  };
}, 'out-x402');

bind('btn-x402-pay', async () => {
  if (x402Challenge === null) {
    throw new Error('Fetch a challenge from the reference server first.');
  }
  const provider = requireProvider();
  if (typeof provider.agent?.payChallenge !== 'function') {
    throw new Error('window.veilpay.agent.payChallenge is not available in this build.');
  }

  // Approve in the wallet overlay, then replay the protected request with the
  // returned X-PAYMENT header — the server verifies the signature statelessly.
  const { paymentHeader } = await provider.agent.payChallenge(x402Challenge);
  const server = $<HTMLInputElement>('x402-server').value.trim().replace(/\/+$/, '');
  const response = await fetch(`${server}/protected`, {
    method: 'POST',
    headers: { 'X-PAYMENT': paymentHeader },
  });
  const body = (await response.json()) as unknown;
  return {
    status: response.status,
    body,
    paymentHeader,
  };
}, 'out-x402');

window.addEventListener('veilpay#initialized', () => setProviderBadge());
setProviderBadge();
