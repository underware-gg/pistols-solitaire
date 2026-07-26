import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Compose class names conditionally, resolving Tailwind utility conflicts.
 * The canonical way to build `className` values in this app (see specs/CODING_STYLE.md) —
 * use it instead of string concatenation or template literals.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
