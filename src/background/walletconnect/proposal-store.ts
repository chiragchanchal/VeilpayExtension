import type { SignClientTypes } from '@walletconnect/types';

const STORAGE_KEY = 'veilpay:wc:pendingProposal';

export interface PendingWcProposal {
  id: number;
  proposer: SignClientTypes.EventArguments['session_proposal']['params']['proposer'];
  requiredNamespaces: SignClientTypes.EventArguments['session_proposal']['params']['requiredNamespaces'];
  optionalNamespaces?: SignClientTypes.EventArguments['session_proposal']['params']['optionalNamespaces'];
  relays: SignClientTypes.EventArguments['session_proposal']['params']['relays'];
  expiryTimestamp: number;
}

export async function setPendingWcProposal(proposal: PendingWcProposal): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEY]: proposal });
}

export async function getPendingWcProposal(): Promise<PendingWcProposal | null> {
  const data = await chrome.storage.session.get(STORAGE_KEY);
  const value = data[STORAGE_KEY];
  if (!isPendingWcProposal(value)) return null;
  return value;
}

export async function clearPendingWcProposal(): Promise<void> {
  await chrome.storage.session.remove(STORAGE_KEY);
}

function isPendingWcProposal(value: unknown): value is PendingWcProposal {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'number' &&
    typeof record.proposer === 'object' &&
    record.proposer !== null &&
    typeof (record.proposer as Record<string, unknown>).metadata === 'object' &&
    typeof record.requiredNamespaces === 'object' &&
    record.requiredNamespaces !== null &&
    Array.isArray(record.relays) &&
    typeof record.expiryTimestamp === 'number'
  );
}