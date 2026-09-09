import type { ReactNode } from 'react';

interface Props {
  title?: string;
  children: ReactNode;
  className?: string;
  /** Small helper text next to the title, e.g. a count badge. */
  aside?: ReactNode;
}

export function Card({ title, children, className = '', aside }: Props) {
  return (
    <section
      className={[
        'rounded-2xl border border-surface-700/60 bg-surface-800/70 p-3.5',
        'shadow-[0_1px_2px_rgba(0,0,0,0.25)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {(title !== undefined || aside !== undefined) && (
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="font-display text-[13px] font-semibold uppercase tracking-wide text-content-secondary">
            {title}
          </h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
