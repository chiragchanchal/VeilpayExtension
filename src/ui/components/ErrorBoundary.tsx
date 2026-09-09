import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Icon, type IconName } from '@/ui/components/Icon';
import { t } from '@/i18n';
import { Button } from '@/ui/components/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React error boundary — catches render errors and shows a fallback UI instead
 * of a blank or broken screen.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[veilpay] ErrorBoundary caught:', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }
      return (
        <ErrorState
          title={t('errors.somethingWentWrong')}
          message={this.state.error?.message ?? t('errors.unexpected')}
          onRetry={() => this.setState({ hasError: false, error: null })}
        />
      );
    }
    return this.props.children;
  }
}

/**
 * Full-screen error state shown when an operation fails.
 */
export function ErrorState({
  title = 'Error',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-[600px] w-[400px] flex-col items-center justify-center gap-4 p-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-error/20">
        <Icon name="warning" className="h-6 w-6" />
      </div>
      <h2 className="font-display text-base font-semibold text-content-primary">{title}</h2>
      <p className="font-body text-sm text-content-secondary text-center max-w-xs">{message}</p>
      {onRetry !== undefined && (
        <Button variant="primary" fullWidth onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/**
 * Empty state shown when a list or view has no data.
 */
export function EmptyState({
  icon = 'empty',
  title,
  message,
  action,
}: {
  icon?: IconName;
  title: string;
  message: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-700">
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <h3 className="font-display text-sm font-semibold text-content-primary">{title}</h3>
      <p className="font-body text-xs text-content-tertiary text-center max-w-[260px]">{message}</p>
      {action !== undefined && (
        <Button variant="ghost" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}