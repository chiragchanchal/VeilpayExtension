/**
 * Class-name composition helper.
 *
 * Filters out falsy values so conditional classes read as a single expression
 * instead of `.filter(Boolean).join(' ')` at every call site. Kept dependency-free
 * (no clsx/tailwind-merge) because this codebase assembles classes from fixed
 * literals rather than merging user-supplied overrides, so conflict resolution
 * would be unused weight in an extension already under a bundle-size gate.
 */
export type ClassValue = string | number | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
