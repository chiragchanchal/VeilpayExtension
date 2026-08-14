/** Minimal types for jest-axe (the package ships no declarations). */
declare module 'jest-axe' {
  export interface AxeResults {
    violations: Array<{
      id: string;
      impact?: string;
      help: string;
      nodes: Array<{ html: string; target: string[]; failureSummary?: string }>;
    }>;
    incomplete: Array<{ id: string; impact?: string; help: string }>;
  }

  export function axe(container: HTMLElement): Promise<AxeResults>;

  export const toHaveNoViolations: Record<string, unknown>;
}
