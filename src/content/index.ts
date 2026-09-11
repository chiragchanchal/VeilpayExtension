/**
 * Content script — isolated world.
 *
 * Sits between the page and the service worker. Two jobs:
 *   1. Inject the page-world shim that defines `window.veilpay`.
 *   2. Relay a strictly allowlisted set of page requests to the background.
 *
 * The page is untrusted. Only `kind` values on ALLOWED_FROM_PAGE cross this
 * boundary, and the background stamps the real origin from the Chrome sender, so
 * a page cannot spoof who it is by editing the payload.
 */

import { newId } from '@/core/messaging/protocol';

const CHANNEL = 'veilpay:v1';

/** Kinds the page is allowed to request. No secrets or irreversible actions. */
const ALLOWED_FROM_PAGE = new Set([
  'ping',
  'vault.status',
  'eth.chainId',
  'eth.requestAccounts',
  'eth.accounts',
  'eth.sendTransaction',
  'eth.switchChain',
  'personal.sign',
  'eth.rpc',
  'eth.signTypedData',
  'solana.connect',
  'solana.signTransaction',
  'solana.signMessage',
  'x402.pay',
  'vap.grant.request',
]);

interface PageEnvelope {
  channel: typeof CHANNEL;
  direction: 'request';
  nonce: string;
  kind: string;
  payload: unknown;
}

function injectPageShim(): void {
  const script = document.createElement('script');
  script.type = 'module';
  // The BUNDLED shim, emitted as `assets/inpage.js` (see vite.config.ts). The
  // raw `.ts` source must never be referenced: Chrome has no MIME mapping for
  // `.ts`, serves it as `application/octet-stream`, and a module script refuses
  // to execute a non-JavaScript MIME type ("strict MIME type checking").
  script.src = chrome.runtime.getURL('assets/inpage.js');
  script.dataset.veilpay = 'shim';
  script.addEventListener('load', () => script.remove());
  (document.head ?? document.documentElement).appendChild(script);
}

function isPageEnvelope(value: unknown): value is PageEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.channel === CHANNEL &&
    candidate.direction === 'request' &&
    typeof candidate.nonce === 'string' &&
    typeof candidate.kind === 'string'
  );
}

function reply(nonce: string, body: Record<string, unknown>): void {
  window.postMessage({ channel: CHANNEL, direction: 'response', nonce, ...body }, window.origin);
}

window.addEventListener('message', (event) => {
  // Same-window only. A message from an iframe or another origin is not ours.
  if (event.source !== window) return;
  if (!isPageEnvelope(event.data)) return;

  const { nonce, kind, payload } = event.data;

  if (!ALLOWED_FROM_PAGE.has(kind)) {
    reply(nonce, {
      ok: false,
      error: { code: 'ORIGIN_DENIED', message: `"${kind}" is not available to pages.` },
    });
    return;
  }

  chrome.runtime
    .sendMessage({ id: newId(), v: 1, source: 'inpage', kind, payload })
    .then((response: unknown) => reply(nonce, response as Record<string, unknown>))
    .catch(() =>
      reply(nonce, {
        ok: false,
        error: { code: 'INTERNAL', message: 'The wallet is unavailable.' },
      }),
    );
});

injectPageShim();
