import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary, ErrorState, EmptyState } from '@/ui/components/ErrorBoundary';

describe('ErrorBoundary', () => {
  it('renders children normally', () => {
    render(
      <ErrorBoundary>
        <div>Rendered fine</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Rendered fine')).toBeInTheDocument();
  });
});

describe('ErrorState / EmptyState', () => {
  it('renders an error state with the message', () => {
    render(<ErrorState title="Load failed" message="Could not load account." />);
    expect(screen.getByText('Load failed')).toBeInTheDocument();
    expect(screen.getByText('Could not load account.')).toBeInTheDocument();
  });

  it('renders an empty state with an action', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No transactions"
        message="You have no transactions yet."
        action={{ label: 'Send', onClick }}
      />,
    );
    expect(screen.getByText('No transactions')).toBeInTheDocument();
    screen.getByText('Send').click();
    expect(onClick).toHaveBeenCalled();
  });
});

describe('ErrorState / EmptyState', () => {
  it('renders an error state with the message', () => {
    render(<ErrorState title="Load failed" message="Could not load account." />);
    expect(screen.getByText('Load failed')).toBeInTheDocument();
    expect(screen.getByText('Could not load account.')).toBeInTheDocument();
  });

  it('renders an empty state with an action', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No transactions"
        message="You have no transactions yet."
        action={{ label: 'Send' , onClick }}
      />,
    );
    expect(screen.getByText('No transactions')).toBeInTheDocument();
    screen.getByText('Send').click();
    expect(onClick).toHaveBeenCalled();
  });
});