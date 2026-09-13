/**
 * Moving between the sides of one card in the lightbox.
 *
 * Clamped rather than wrapping: there are only ever two sides, and swiping off
 * the back to land on the front reads as a glitch rather than a loop. Pulled
 * out of the component because it is the only part of the lightbox that can be
 * tested — vitest here runs on `node` with no DOM, deliberately.
 */
export function stepIndex(current: number, delta: number, total: number): number {
  if (total <= 0) return 0;
  const next = current + delta;
  if (next < 0) return 0;
  if (next > total - 1) return total - 1;
  return next;
}
