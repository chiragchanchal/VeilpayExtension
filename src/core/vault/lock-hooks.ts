export type LockListener = () => void;

const listeners = new Set<LockListener>();

export function registerLockListener(listener: LockListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyLockListeners(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Lock cleanup must continue even if one listener fails.
    }
  }
}
