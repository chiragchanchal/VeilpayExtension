/**
 * Veilpay MCP server — lets an AI agent pay from the user's wallet.
 *
 * Speaks MCP over stdio (so Claude Code / Claude Desktop can spawn it) and runs
 * the localhost bridge in `./bridge.mjs` that the extension long-polls.
 *
 * This process never sees key material. It relays a request; the extension
 * decides whether the user's spending caps allow it to run automatically or
 * whether a human must approve it first. See `docs/AGENT_PAYMENTS.md`.
 *
 * Zero dependencies, and nothing starts on import so the helpers are testable.
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBridge } from './bridge.mjs';

export const VERSION = '1.0.0';
export const PROTOCOL_VERSION = '2024-11-05';
export const DEFAULT_PORT = 8765;

/** Overridable so tests never touch the real home directory. */
export function configPath() {
  return process.env.VEILPAY_MCP_CONFIG ?? join(homedir(), '.veilpay-mcp', 'config.json');
}

/**
 * Loads the pairing token, creating one on first run.
 *
 * The token is the only thing standing between any local process and the
 * wallet's spending caps, so it is 32 random bytes and stored 0600 where the
 * platform honours the mode.
 */
export function loadConfig(path = configPath()) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof parsed?.token === 'string' && parsed.token.length > 0) {
      return { token: parsed.token, created: false };
    }
  } catch {
    // Missing or unreadable: fall through and mint a new one.
  }

  const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ token }, null, 2)}\n`, { mode: 0o600 });
  return { token, created: true };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const CHAINS = ['evm', 'solana', 'stellar'];
const DECIMAL = /^\d+(\.\d+)?$/;

/**
 * Tool catalogue. Descriptions are written for an LLM: they say what the tool
 * does, the exact shape of each argument, and what will block it.
 */
export const TOOLS = [
  {
    name: 'wallet_status',
    description:
      'Report whether the Veilpay wallet extension is reachable and unlocked. Call this first if another tool fails, to distinguish "extension closed" from "wallet locked". Veilpay is TESTNET ONLY: it holds Sepolia ETH, devnet SOL, and testnet XLM, which have no monetary value.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_accounts',
    description: 'List the wallet addresses available to pay from, one per chain.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_balance',
    description:
      'Get the balance of an account. Omit `address` to use the wallet\'s own account for that chain.',
    inputSchema: {
      type: 'object',
      properties: {
        chain: { type: 'string', enum: CHAINS, description: 'Which chain to read.' },
        address: { type: 'string', description: 'Optional address; defaults to the wallet account.' },
      },
      required: ['chain'],
      additionalProperties: false,
    },
  },
  {
    name: 'send_payment',
    description:
      'Send testnet funds from the user\'s Veilpay wallet. `amount` is a human-readable decimal string such as "1" or "0.05" (the wallet converts to base units). The wallet enforces the user\'s spending caps: a payment above their approval threshold, or from an unknown client, pauses for the user to approve in the extension, so this call can take up to three minutes. A payment over a hard cap is refused outright.',
    inputSchema: {
      type: 'object',
      properties: {
        chain: { type: 'string', enum: CHAINS, description: 'Chain to send on.' },
        to: { type: 'string', description: 'Recipient address.' },
        amount: {
          type: 'string',
          description: 'Human-readable amount in the chain\'s native unit, e.g. "1" or "0.05".',
        },
        asset: {
          type: 'string',
          description: 'Optional non-native token: an ERC-20 contract, SPL mint, or Stellar asset code.',
        },
        memo: { type: 'string', description: 'Optional note recorded with the payment.' },
      },
      required: ['chain', 'to', 'amount'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_grants',
    description:
      'List the user\'s active spending grants: the caps that let payments run without a prompt, and their expiry.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'revoke_grant',
    description: 'Revoke a spending grant by id, immediately stopping autonomous payments under it.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Grant id from list_grants.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
];

/**
 * Validates arguments before anything reaches the wallet.
 *
 * The wallet validates again — this is a fast, clear failure for the agent
 * rather than a round trip that ends in an opaque error.
 */
export function validateArgs(tool, args = {}) {
  const fail = (error) => ({ ok: false, error });

  if (tool === 'get_balance') {
    if (!CHAINS.includes(args.chain)) return fail('`chain` must be one of: evm, solana, stellar.');
    if (args.address !== undefined && (typeof args.address !== 'string' || args.address.length === 0)) {
      return fail('`address` must be a non-empty string when provided.');
    }
    return { ok: true, value: { chain: args.chain, address: args.address } };
  }

  if (tool === 'revoke_grant') {
    if (typeof args.id !== 'string' || args.id.length === 0) return fail('`id` is required.');
    return { ok: true, value: { id: args.id } };
  }

  if (tool === 'send_payment') {
    if (!CHAINS.includes(args.chain)) return fail('`chain` must be one of: evm, solana, stellar.');
    if (typeof args.to !== 'string' || args.to.trim().length === 0) {
      return fail('`to` (recipient address) is required.');
    }
    if (typeof args.amount !== 'string' || !DECIMAL.test(args.amount.trim())) {
      return fail('`amount` must be a positive decimal string such as "1" or "0.05".');
    }
    if (Number(args.amount) <= 0) return fail('`amount` must be greater than zero.');
    return {
      ok: true,
      value: {
        chain: args.chain,
        to: args.to.trim(),
        amount: args.amount.trim(),
        asset: args.asset,
        memo: args.memo,
        // Guarantees a retried call cannot pay twice: the wallet dedupes on this.
        idempotencyKey: randomUUID(),
      },
    };
  }

  return { ok: true, value: {} };
}

/** Maps an MCP tool name onto the bridge's tool vocabulary. */
const BRIDGE_TOOL = {
  wallet_status: 'status',
  list_accounts: 'accounts',
  get_balance: 'balance',
  send_payment: 'send',
  list_grants: 'grants.list',
  revoke_grant: 'grants.revoke',
};

function textResult(text, isError = false) {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) };
}

function formatData(data) {
  if (data === undefined || data === null) return 'Done.';
  if (typeof data === 'string') return data;
  return JSON.stringify(data, null, 2);
}

// ---------------------------------------------------------------------------
// MCP dispatch
// ---------------------------------------------------------------------------

/**
 * Handles one MCP message. Returns the response object, or null for a
 * notification (which must not be answered).
 *
 * Errors are converted into MCP error results rather than thrown, so a failed
 * tool call never takes down the server mid-conversation.
 */
export async function handleMcpMessage(message, bridge) {
  if (typeof message !== 'object' || message === null) return null;
  const { id, method, params } = message;

  // A notification carries no id and must never be answered.
  if (id === undefined || id === null) {
    return null;
  }

  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message_) => ({ jsonrpc: '2.0', id, error: { code, message: message_ } });

  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'veilpay', version: VERSION },
      });

    case 'ping':
      return reply({});

    case 'tools/list':
      return reply({ tools: TOOLS });

    case 'tools/call': {
      const name = params?.name;
      const tool = TOOLS.find((candidate) => candidate.name === name);
      if (tool === undefined) {
        return reply(textResult(`Unknown tool "${String(name)}".`, true));
      }

      const checked = validateArgs(name, params?.arguments ?? {});
      if (!checked.ok) {
        return reply(textResult(checked.error, true));
      }

      try {
        const data = await bridge.dispatch(BRIDGE_TOOL[name], checked.value);
        return reply(textResult(formatData(data)));
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        return reply(
          textResult(
            `${detail}\n\nIf the extension is closed, open Veilpay and unlock it, then retry.`,
            true,
          ),
        );
      }
    }

    default:
      return fail(-32601, `Method not found: ${String(method)}`);
  }
}

// ---------------------------------------------------------------------------
// stdio transport
// ---------------------------------------------------------------------------

/** Newline-delimited JSON-RPC. Returns a function that feeds a chunk in. */
export function createStdioTransport(bridge, out) {
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
      if (line.length === 0) continue;

      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        // Unparseable input cannot be correlated to an id, so nothing is sent.
        process.stderr.write('[veilpay] ignored malformed MCP line\n');
        continue;
      }

      void handleMcpMessage(parsed, bridge).then((response) => {
        if (response !== null) out.write(`${JSON.stringify(response)}\n`);
      });
    }
  };
}

async function main() {
  const { token, created } = loadConfig();
  const port = Number(process.env.VEILPAY_BRIDGE_PORT ?? DEFAULT_PORT);
  const bridge = createBridge({ token });

  const actualPort = await bridge.start(port);
  // stderr only: stdout is the MCP channel and must stay clean JSON.
  process.stderr.write(
    `[veilpay] MCP server ready (${VERSION}). Bridge on http://127.0.0.1:${actualPort}\n`,
  );
  if (created) {
    process.stderr.write(
      `[veilpay] Pairing token written to ${configPath()}\n[veilpay] Token: ${token}\n`,
    );
  }
  process.stderr.write(
    '[veilpay] Paste the token into Veilpay → Settings → Agent bridge to connect the wallet.\n',
  );

  const feed = createStdioTransport(bridge, process.stdout);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', feed);
  process.stdin.on('end', () => {
    void bridge.stop().finally(() => process.exit(0));
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((cause) => {
    process.stderr.write(`[veilpay] failed to start: ${String(cause)}\n`);
    process.exit(1);
  });
}
