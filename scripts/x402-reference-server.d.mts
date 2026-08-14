/**
 * Type declarations for `scripts/x402-reference-server.mjs` (a plain JS script
 * kept outside the TS build on purpose). Kept minimal — only the surface the
 * round-trip test exercises.
 */
import type { X402Challenge } from '@/core/x402/types';

export const PORT: number;
export const PAY_TO: string;
export const AMOUNT_WEI: string;
export function issueChallenge(now?: number): X402Challenge;
export function canonicalizePayload(payload: unknown): string;
export function recoverAddress(signatureHex: string, digest: Uint8Array): string;
export function verifyHeader(header: string, now?: number): string | null;
