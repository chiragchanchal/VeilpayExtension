/**
 * Key-value storage adapter for the WalletConnect SignClient using
 * chrome.storage.local.
 *
 * The interface is structural (matches `IKeyValueStorage` from
 * @walletconnect/keyvaluestorage) so we do not need to import that transitive
 * package directly. Sessions, pairings, and keys persist across service worker
 * restarts, which keeps an established pairing usable after MV3 eviction.
 */
export class ChromeStorageAdapter {
  private prefix: string;

  constructor(prefix = 'wc:') {
    this.prefix = prefix;
  }

  private key(k: string): string {
    return this.prefix + k;
  }

  async getKeys(): Promise<string[]> {
    const data = await chrome.storage.local.get(null);
    return Object.keys(data)
      .filter((k) => k.startsWith(this.prefix))
      .map((k) => k.slice(this.prefix.length));
  }

  async getEntries<T = unknown>(): Promise<[string, T][]> {
    const data = await chrome.storage.local.get(null);
    return Object.entries(data)
      .filter(([k]) => k.startsWith(this.prefix))
      .map(([k, v]) => [k.slice(this.prefix.length), v as T]);
  }

  async getItem<T = unknown>(key: string): Promise<T | undefined> {
    const data = await chrome.storage.local.get(this.key(key));
    return data[this.key(key)] as T | undefined;
  }

  async setItem<T = unknown>(key: string, value: T): Promise<void> {
    await chrome.storage.local.set({ [this.key(key)]: value });
  }

  async removeItem(key: string): Promise<void> {
    await chrome.storage.local.remove(this.key(key));
  }

  async clear(): Promise<void> {
    const keys = await this.getKeys();
    const fullKeys = keys.map((k) => this.key(k));
    if (fullKeys.length > 0) {
      await chrome.storage.local.remove(fullKeys);
    }
  }
}