import type { ReactNode } from 'react';

interface Props {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Card({ title, children, className = '' }: Props) {
  return (
    <section
      className={['rounded-xl bg-surface-800 p-4', className].filter(Boolean).join(' ')}
    >
      {title !== undefined && (
        <h2 className="mb-3 font-display text-sm font-semibold text-content-secondary">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
