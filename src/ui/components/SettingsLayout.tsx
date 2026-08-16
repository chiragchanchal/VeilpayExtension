import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@/ui/store/useWallet';
import type { ChainId } from '@/core/messaging/protocol';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { SecuritySetup } from '@/ui/components/SecuritySetup';
import { listPermissions, revokeOrigin, type OriginPermission } from '@/core/permissions';
import { getCustomNetworks, addCustomNetwork, removeCustomNetwork, type CustomNetwork } from '@/core/networks';
import { AddressBookView } from '@/ui/components/AddressBookView';
import { TransactionHistoryView } from '@/ui/components/TransactionHistoryView';
import { SessionManagementView } from '@/ui/components/SessionManagementView';
import { AuditView } from '@/ui/components/AuditView';
import {
  createGrant,
  listGrants,
  revokeGrant,
  type Grant,
  type GrantCaps,
} from '@/core/vap/grant';
import { appendAudit } from '@/core/vap/audit';

type SettingsTab = 'general' | 'security' | 'networks' | 'permissions' | 'vap' | 'addressbook' | 'transactions' | 'session' | 'audit' | 'about';

/**
 * Settings layout with sidebar navigation.
 * Sections: General, Security, Networks, Permissions, About.
 */
export function SettingsLayout({ onClose }: { onClose?: () => void }) {
  const [tab, setTab] = useState<SettingsTab>('general');
  const { securityStatus, loadSecurityStatus, refresh } = useWallet();

  const [permissions, setPermissions] = useState<OriginPermission[]>([]);
  const [isLoadingPerms, setIsLoadingPerms] = useState(false);

  const loadPermissions = useCallback(async () => {
    setIsLoadingPerms(true);
    try {
      const perms = await listPermissions();
      setPermissions(perms);
    } finally {
      setIsLoadingPerms(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void loadSecurityStatus();
    void loadPermissions();
  }, [refresh, loadSecurityStatus, loadPermissions]);

  const handleRevoke = async (origin: string) => {
    await revokeOrigin(origin);
    await loadPermissions();
  };

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'security', label: 'Security' },
    { key: 'networks', label: 'Networks' },
    { key: 'permissions', label: 'Permissions' },
    { key: 'vap', label: 'VAP Grants' },
    { key: 'addressbook', label: 'Address Book' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'session', label: 'Session' },
    { key: 'audit', label: 'Audit' },
    { key: 'about', label: 'About' },
  ];

  return (
    <div className="flex min-h-screen bg-surface-base">
      {/* Sidebar */}
      <nav className="flex w-48 flex-col gap-1 border-r border-surface-600 p-4">
        <h1 className="font-display text-base font-bold text-content-primary mb-4">Veilpay</h1>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`rounded-lg px-3 py-2 text-left font-body text-sm transition-colors ${
              tab === t.key
                ? 'bg-accent-primary/20 text-content-primary font-semibold'
                : 'text-content-secondary hover:bg-surface-700'
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
        {onClose !== undefined && (
          <Button variant="ghost" size="sm" className="mt-auto" onClick={onClose}>
            Close
          </Button>
        )}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'general' && <GeneralSettings />}
        {tab === 'security' && (
          <SecuritySettings
            hasPin={securityStatus?.pinEnabled ?? false}
            hasWebAuthn={securityStatus?.webauthnEnabled ?? false}
          />
        )}
        {tab === 'networks' && <NetworkSettings />}
        {tab === 'permissions' && (
          <PermissionsSettings
            permissions={permissions}
            isLoading={isLoadingPerms}
            onRevoke={handleRevoke}
            onRefresh={loadPermissions}
          />
        )}
        {tab === 'vap' && <VapGrantsSection />}
        {tab === 'addressbook' && <AddressBookView />}
        {tab === 'transactions' && <TransactionHistoryView />}
        {tab === 'session' && <SessionManagementView />}
        {tab === 'audit' && <AuditView />}
        {tab === 'about' && <AboutSection />}
      </div>
    </div>
  );
}

// ── General ──────────────────────────────────────────────────────────────

function GeneralSettings() {
  const { vaultState, lock } = useWallet();

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-semibold text-content-primary">General</h2>

      <Card title="Wallet state">
        <p className="font-body text-sm text-content-secondary">
          Status: <span className="font-semibold text-content-primary">{vaultState}</span>
        </p>
        {vaultState === 'unlocked' && (
          <Button variant="ghost" size="sm" className="mt-2" onClick={lock}>
            Lock wallet
          </Button>
        )}
      </Card>

      <Card title="Session timeout">
        <p className="font-body text-sm text-content-secondary">
          Auto-lock after 15 minutes of inactivity.
        </p>
      </Card>
    </div>
  );
}

// ── Security ──────────────────────────────────────────────────────────────

function SecuritySettings({ hasPin, hasWebAuthn }: { hasPin: boolean; hasWebAuthn: boolean }) {
  const [showSetup, setShowSetup] = useState(false);

  if (showSetup) {
    return <SecuritySetup onComplete={() => setShowSetup(false)} onSkip={() => setShowSetup(false)} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-semibold text-content-primary">Security</h2>

      <Card title="PIN">
        <p className="font-body text-sm text-content-secondary">
          {hasPin ? 'A PIN is configured.' : 'No PIN configured.'}
        </p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowSetup(true)}>
          {hasPin ? 'Change PIN' : 'Set up PIN'}
        </Button>
      </Card>

      <Card title="WebAuthn">
        <p className="font-body text-sm text-content-secondary">
          {hasWebAuthn ? 'A passkey is registered.' : 'No passkey registered.'}
        </p>
      </Card>
    </div>
  );
}

// ── Networks ──────────────────────────────────────────────────────────────

function NetworkSettings() {
  const [custom, setCustom] = useState<CustomNetwork[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newChain, setNewChain] = useState<ChainId>('evm');
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    void getCustomNetworks().then(setCustom);
  }, []);

  const handleAdd = async () => {
    setAddError(null);
    if (!newName || !newUrl) {
      setAddError('Name and RPC URL are required.');
      return;
    }
    const ok = await addCustomNetwork({ chain: newChain, name: newName, rpcUrl: newUrl });
    if (!ok) {
      setAddError('A network with that name already exists.');
      return;
    }
    setCustom(await getCustomNetworks());
    setShowAdd(false);
    setNewName('');
    setNewUrl('');
  };

  const handleRemove = async (name: string) => {
    await removeCustomNetwork(name);
    setCustom(await getCustomNetworks());
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-content-primary">Networks</h2>
        <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)}>
          Add custom
        </Button>
      </div>

      <Card title="EVM (Sepolia)">
        <p className="font-body text-xs text-content-tertiary">Chain ID: 11155111</p>
        <p className="font-body text-xs text-content-tertiary">RPC: sepolia.infura.io / sepolia.gateway.tenderly.co</p>
      </Card>

      <Card title="Solana (Devnet)">
        <p className="font-body text-xs text-content-tertiary">RPC: api.devnet.solana.com</p>
      </Card>

      <Card title="Stellar (Testnet)">
        <p className="font-body text-xs text-content-tertiary">RPC: horizon-testnet.stellar.org</p>
      </Card>

      {custom.map((n) => (
        <Card key={n.name} title={n.name}>
          <p className="font-body text-xs text-content-tertiary">{n.chain} — {n.rpcUrl}</p>
          <Button variant="ghost" size="sm" className="mt-1" onClick={() => handleRemove(n.name)}>
            Remove
          </Button>
        </Card>
      ))}

      {showAdd && (
        <Card title="Add custom network">
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-body text-xs text-content-secondary">Chain</span>
              <select
                className="rounded-lg bg-surface-800 px-3 py-2 text-sm text-content-primary"
                value={newChain}
                onChange={(e) => setNewChain(e.target.value as ChainId)}
              >
                <option value="evm">EVM</option>
                <option value="solana">Solana</option>
                <option value="stellar">Stellar</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-body text-xs text-content-secondary">Network name</span>
              <input
                className="rounded-lg bg-surface-800 px-3 py-2 text-sm text-content-primary"
                placeholder="Network name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-body text-xs text-content-secondary">RPC URL</span>
              <input
                className="rounded-lg bg-surface-800 px-3 py-2 text-sm text-content-primary"
                placeholder="RPC URL"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
              />
            </label>
            {addError !== null && (
              <p className="font-body text-xs text-error">{addError}</p>
            )}
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAdd}>
                Add
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Permissions ───────────────────────────────────────────────────────────

function PermissionsSettings({
  permissions,
  isLoading,
  onRevoke,
  onRefresh,
}: {
  permissions: OriginPermission[];
  isLoading: boolean;
  onRevoke: (origin: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-content-primary">Permissions</h2>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isLoading}>
          Refresh
        </Button>
      </div>

      {permissions.length === 0 ? (
        <Card title="Connected dapps">
          <p className="font-body text-sm text-content-secondary">
            No dapps have been granted access to your wallet.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {permissions.map((p) => (
            <Card key={p.origin} title={p.origin}>
              <div className="flex flex-col gap-2">
                <p className="font-body text-xs text-content-tertiary">
                  {p.addresses.length} address{p.addresses.length !== 1 ? 'es' : ''} shared
                </p>
                {p.addresses.slice(0, 3).map((addr) => (
                  <span key={addr} className="font-mono text-[10px] text-content-tertiary">
                    {addr.slice(0, 10)}…{addr.slice(-4)}
                  </span>
                ))}
                <Button variant="ghost" size="sm" className="mt-1" onClick={() => onRevoke(p.origin)}>
                  Revoke
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── VAP Grants ────────────────────────────────────────────────────────────

/**
 * Converts an ETH display string to a wei decimal string for the grant model.
 * The float path is acceptable here: caps are entered by hand in a settings
 * form, not computed by the wallet's money math.
 */
function ethToWei(eth: string): string {
  const value = Number.parseFloat(eth);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Amount must be a non-negative number.');
  }
  return BigInt(Math.round(value * 1e18)).toString();
}

/** Formats a wei decimal string as a short ETH figure for display. */
function formatEthAmount(wei: string): string {
  try {
    const value = BigInt(wei);
    const whole = value / 10n ** 18n;
    const fraction = value % 10n ** 18n;
    const frac = fraction.toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '');
    return `${whole}${frac.length > 0 ? `.${frac}` : ''} ETH`;
  } catch {
    return `${wei} wei`;
  }
}

function VapGrantsSection() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [origin, setOrigin] = useState('');
  const [maxPerOp, setMaxPerOp] = useState('');
  const [maxPerWindow, setMaxPerWindow] = useState('');
  const [windowHours, setWindowHours] = useState('24');
  const [threshold, setThreshold] = useState('');
  const [expiresDays, setExpiresDays] = useState('7');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<'idle' | 'counting' | 'ready'>('idle');
  const [confirmCount, setConfirmCount] = useState(3);

  useEffect(() => {
    void loadGrants();
  }, []);

  const loadGrants = async () => {
    setGrants(await listGrants());
  };

  const resetForm = () => {
    setShowCreate(false);
    setOrigin('');
    setMaxPerOp('');
    setMaxPerWindow('');
    setThreshold('');
    setFormError(null);
    setConfirmState('idle');
    setConfirmCount(3);
  };

  /**
   * Anti-clickjack: the first click starts a 3s countdown and the button stays
   * disabled until it elapses, so a granted cap cannot be created by a hidden
   * frame's programmatic click. The second click performs the creation.
   */
  const handleCreate = async () => {
    setFormError(null);
    if (confirmState === 'idle') {
      setConfirmState('counting');
      const timer = setInterval(() => {
        setConfirmCount((c) => {
          if (c <= 1) {
            clearInterval(timer);
            setConfirmState('ready');
            return 0;
          }
          return c - 1;
        });
      }, 1000);
      return;
    }
    if (confirmState !== 'ready') return;

    try {
      const caps: GrantCaps = {
        maxPerOperation: ethToWei(maxPerOp),
        maxPerWindow: ethToWei(maxPerWindow),
        windowSeconds: Math.max(60, Math.round(Number(windowHours) * 3600)),
        approvalThreshold: ethToWei(threshold),
        allowedOps: ['x402.pay'],
        allowedChains: ['evm'],
        allowlist: [],
      };
      const grant = await createGrant({
        clientId: origin.trim(),
        clientLabel: origin.trim(),
        caps,
        expiresAt: Date.now() + Math.max(1, Math.round(Number(expiresDays))) * 86_400_000,
      });
      void appendAudit('grant.created', {
        grantId: grant.id,
        clientId: grant.clientId,
        maxPerOperation: caps.maxPerOperation,
        maxPerWindow: caps.maxPerWindow,
        windowSeconds: caps.windowSeconds,
        approvalThreshold: caps.approvalThreshold,
      });
      resetForm();
      await loadGrants();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not create the grant.');
    }
  };

  const handleRevoke = async (id: string) => {
    await revokeGrant(id);
    void appendAudit('grant.revoked', { grantId: id });
    await loadGrants();
  };

  const inputClass = 'rounded-lg bg-surface-800 px-3 py-2 text-sm text-content-primary';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-content-primary">VAP Grants</h2>
        <Button variant="ghost" size="sm" onClick={() => (showCreate ? resetForm() : setShowCreate(true))}>
          {showCreate ? 'Cancel' : 'Create grant'}
        </Button>
      </div>

      <p className="font-body text-xs text-content-secondary">
        Grants pre-authorize an origin to pay x402 charges within hard caps, so low-value
        agent payments skip the prompt. Creating a grant for an origin replaces its previous
        active grant.
      </p>

      {showCreate && (
        <Card title="New grant">
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-body text-xs text-content-secondary">Origin</span>
              <input
                className={inputClass}
                placeholder="https://service.example"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-body text-xs text-content-secondary">Max per operation (ETH)</span>
              <input className={inputClass} value={maxPerOp} onChange={(e) => setMaxPerOp(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-body text-xs text-content-secondary">Max per window (ETH)</span>
              <input className={inputClass} value={maxPerWindow} onChange={(e) => setMaxPerWindow(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-body text-xs text-content-secondary">Window (hours)</span>
              <input className={inputClass} value={windowHours} onChange={(e) => setWindowHours(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-body text-xs text-content-secondary">Auto-approve under (ETH)</span>
              <input className={inputClass} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-body text-xs text-content-secondary">Expires in (days)</span>
              <input className={inputClass} value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} />
            </label>
            {formError !== null && (
              <p className="font-body text-xs text-danger">{formError}</p>
            )}
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={confirmState === 'counting'}
            >
              {confirmState === 'counting' ? `Hold to confirm (${confirmCount}s)` : 'Create grant'}
            </Button>
          </div>
        </Card>
      )}

      {grants.length === 0 ? (
        <Card title="Active grants">
          <p className="font-body text-sm text-content-secondary">No grants yet.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {grants.map((g) => (
            <Card key={g.id} title={g.clientLabel}>
              <div className="flex flex-col gap-1">
                <span className="font-mono text-xs text-content-tertiary">{g.clientId}</span>
                <span className="font-body text-xs text-content-secondary">
                  {formatEthAmount(g.caps.maxPerOperation)}/op ·{' '}
                  {formatEthAmount(g.caps.maxPerWindow)}/{g.caps.windowSeconds / 3600}h · auto under{' '}
                  {formatEthAmount(g.caps.approvalThreshold)}
                </span>
                <span className="font-body text-xs text-content-tertiary">
                  Expires {new Date(g.expiresAt).toLocaleDateString()}
                </span>
                <Button variant="ghost" size="sm" className="mt-1" onClick={() => handleRevoke(g.id)}>
                  Revoke
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── About ─────────────────────────────────────────────────────────────────

function AboutSection() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-semibold text-content-primary">About</h2>

      <Card title="Veilpay">
        <div className="flex flex-col gap-1">
          <p className="font-body text-sm text-content-secondary">Version 0.0.1</p>
          <p className="font-body text-xs text-content-tertiary">
            Self-custody multi-chain wallet with native agent payments and x402 support.
          </p>
          <p className="font-body text-xs text-content-tertiary mt-1">
            Testnet only. Not for use with real funds.
          </p>
        </div>
      </Card>
    </div>
  );
}