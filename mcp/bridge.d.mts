/** Types for the MCP bridge (`mcp/bridge.mjs`). */

export declare const LONG_POLL_MS: number;
export declare const SEND_TIMEOUT_MS: number;
export declare const DEFAULT_TIMEOUT_MS: number;
export declare const STALE_REQUEST_MS: number;
export declare const CONNECTED_WINDOW_MS: number;

export interface BridgeRequest {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  enqueuedAt: number;
}

export interface BridgeOptions {
  token?: string;
  longPollMs?: number;
  sendTimeoutMs?: number;
  defaultTimeoutMs?: number;
  staleRequestMs?: number;
  now?: () => number;
}

export interface Bridge {
  handle(req: unknown, res: unknown): Promise<void>;
  /** Starts listening and resolves the actual port (pass 0 for an ephemeral one). */
  start(port?: number): Promise<number>;
  stop(): Promise<void>;
  dispatch(tool: string, args: unknown): Promise<unknown>;
  settle(id: string, payload: { ok?: boolean; data?: unknown; error?: unknown }): boolean;
  enqueue(tool: string, args: unknown): BridgeRequest;
  nextRequest(): Promise<BridgeRequest | null>;
  extensionConnected(): boolean;
  pendingCount(): number;
  queuedCount(): number;
}

export declare function tokenMatches(expected: unknown, provided: unknown): boolean;
export declare function createBridge(options?: BridgeOptions): Bridge;
