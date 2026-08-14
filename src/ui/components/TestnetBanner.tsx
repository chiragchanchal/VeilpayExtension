/**
 * Non-negotiable banner for every surface that touches testnet funds or
 * unaudited privacy code. Required by the plan's document conventions.
 */
export function TestnetBanner({ scope = 'testnet' }: { scope?: 'testnet' | 'privacy' }) {
  const copy =
    scope === 'privacy'
      ? 'Testnet only. Privacy code is unaudited — do not use with real funds.'
      : 'Testnet only. Do not send mainnet funds to these addresses.';

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2"
    >
      <span aria-hidden="true" className="text-warning">
        &#9888;
      </span>
      <p className="font-body text-xs leading-snug text-warning">{copy}</p>
    </div>
  );
}
