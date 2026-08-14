import {
  Response,
  newId,
  type MessageSource,
  type Request,
  type RequestKind,
  type ResponseData,
} from './protocol';

export const MESSAGE_TIMEOUT_MS = 15_000;

/**
 * Typed caller for UI surfaces (popup / options / side panel).
 *
 * Rejects with an Error carrying the protocol code so callers can branch on
 * `VAULT_LOCKED` without string matching. Every request is bounded: a stalled
 * service worker, blocked IndexedDB open, or lost message channel must become a
 * visible error rather than an infinite loading state.
 */
export class RequestFailed extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RequestFailed';
    this.code = code;
  }
}

async function sendWithTimeout(message: unknown): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      chrome.runtime.sendMessage(message),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new RequestFailed('INTERNAL', 'The wallet did not respond in time.'));
        }, MESSAGE_TIMEOUT_MS);
      }),
    ]);
  } catch (cause) {
    if (cause instanceof RequestFailed) throw cause;
    throw new RequestFailed('INTERNAL', 'The wallet is unavailable.');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function createClient(source: MessageSource) {
  return async function send<K extends RequestKind>(
    kind: K,
    payload: Extract<Request, { kind: K }>['payload'],
  ): Promise<ResponseData[K]> {
    const message = { id: newId(), v: 1 as const, source, kind, payload };
    const raw: unknown = await sendWithTimeout(message);

    const parsed = Response.safeParse(raw);
    if (!parsed.success) {
      throw new RequestFailed('INTERNAL', 'The wallet returned a malformed response.');
    }
    if (!parsed.data.ok) {
      throw new RequestFailed(parsed.data.error.code, parsed.data.error.message);
    }
    return parsed.data.data as ResponseData[K];
  };
}
