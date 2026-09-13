/** Types for the Veilpay MCP server (`mcp/veilpay-mcp.mjs`). */

import type { Bridge } from './bridge.mjs';

export declare const VERSION: string;
export declare const PROTOCOL_VERSION: string;
export declare const DEFAULT_PORT: number;

export declare function configPath(): string;
export declare function loadConfig(path?: string): { token: string; created: boolean };

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export declare const TOOLS: McpTool[];

export type ValidationResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

export declare function validateArgs(
  tool: string,
  args?: Record<string, unknown>,
): ValidationResult;

export declare function handleMcpMessage(message: unknown, bridge: Bridge): Promise<unknown>;

export declare function createStdioTransport(
  bridge: Bridge,
  out: { write(chunk: string): unknown },
): (chunk: string) => void;
