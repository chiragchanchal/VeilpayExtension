import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import type { ChainId } from '@/core/messaging/protocol';
import {
  getAddressBook,
  addAddressBookEntry,
  removeAddressBookEntry,
  importAddressBook,
  exportAddressBook,
  type AddressBookEntry,
} from '@/core/addressbook';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';

/**
 * Address book — CRUD view with JSON import/export.
 */
export function AddressBookView() {
  const [entries, setEntries] = useState<AddressBookEntry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [chain, setChain] = useState<ChainId>('evm');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    void loadEntries();
  }, []);

  const loadEntries = async () => {
    setEntries(await getAddressBook());
  };

  const handleAdd = async () => {
    setError(null);
    if (!label || !address) {
      setError(t('surfaces.labelAndAddressRequired'));
      return;
    }
    const ok = await addAddressBookEntry({ chain, label, address, ...(note ? { note } : {}) });
    if (!ok) {
      setError(t('surfaces.addressExists'));
      return;
    }
    await loadEntries();
    setShowAdd(false);
    setLabel('');
    setAddress('');
    setNote('');
  };

  const handleRemove = async (id: string) => {
    await removeAddressBookEntry(id);
    await loadEntries();
  };

  const handleImport = async () => {
    setError(null);
    try {
      const parsed = JSON.parse(importText) as Array<Omit<AddressBookEntry, 'id' | 'createdAt'>>;
      await importAddressBook(parsed);
      await loadEntries();
      setShowImport(false);
      setImportText('');
    } catch {
      setError(t('surfaces.invalidJson'));
    }
  };

  const handleExport = async () => {
    const json = await exportAddressBook();
    await navigator.clipboard.writeText(json);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-content-primary">Address Book</h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowImport(true)}>Import</Button>
          <Button variant="ghost" size="sm" onClick={handleExport}>Export</Button>
          <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)}>Add</Button>
        </div>
      </div>

      {showImport && (
        <Card title={t('surfaces.importJson')}>
          <textarea
            className="w-full rounded-lg bg-surface-800 p-2 text-xs font-mono text-content-primary"
            rows={4}
            placeholder={t('surfaces.importJsonPlaceholder')}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          {error !== null && <p className="font-body text-xs text-error mt-1">{error}</p>}
          <div className="flex gap-2 mt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowImport(false)}>{t('common.cancel')}</Button>
            <Button size="sm" onClick={handleImport}>{t('common.import')}</Button>
          </div>
        </Card>
      )}

      {showAdd && (
        <Card title={t('surfaces.addAddress')}>
          <div className="flex flex-col gap-2">
            <select
              className="rounded-lg bg-surface-800 px-3 py-2 text-sm text-content-primary"
              value={chain}
              onChange={(e) => setChain(e.target.value as ChainId)}
            >
              <option value="evm">EVM</option>
              <option value="solana">Solana</option>
              <option value="stellar">Stellar</option>
            </select>
            <input
              className="rounded-lg bg-surface-800 px-3 py-2 text-sm text-content-primary"
              placeholder="Label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <input
              className="rounded-lg bg-surface-800 px-3 py-2 text-sm text-content-primary"
              placeholder="Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <input
              className="rounded-lg bg-surface-800 px-3 py-2 text-sm text-content-primary"
              placeholder="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {error !== null && <p className="font-body text-xs text-error">{error}</p>}
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" onClick={handleAdd}>Save</Button>
            </div>
          </div>
        </Card>
      )}

      {entries.length === 0 ? (
        <Card title="Address book">
          <p className="font-body text-sm text-content-secondary">No saved addresses. Add one to get started.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((e) => (
            <Card key={e.id} title={e.label}>
              <p className="font-mono text-xs text-content-tertiary">{e.address}</p>
              <p className="font-body text-xs text-content-secondary">{e.chain}</p>
              {e.note !== undefined && <p className="font-body text-xs text-content-tertiary">{e.note}</p>}
              <div className="flex gap-2 mt-1">
                <Button variant="ghost" size="sm" onClick={() => handleRemove(e.id)}>Remove</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}