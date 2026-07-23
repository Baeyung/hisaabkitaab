/**
 * Viewport-safe placement for a `position: fixed` popup hanging off a trigger.
 * Anchored below the trigger, but flipped above it when the popup would run off
 * the bottom (a filter toolbar mid-page, not just in a page header), and clamped
 * horizontally so a popup wider than its trigger stays on screen — which is what
 * bites in RTL and near the right edge.
 *
 * `pop` is null on the first call of an open (the element isn't in the DOM yet);
 * the raw anchor is used then and the caller re-runs once it renders.
 */
export function anchorPopup(
  trigger: DOMRect,
  pop: HTMLElement | null | undefined,
): { top: number; left: number } {
  const gap = 4;
  const edge = 8; // breathing room against the viewport edges
  const h = pop?.offsetHeight ?? 0;
  const w = pop?.offsetWidth ?? 0;
  const below = trigger.bottom + gap;
  const flip = h > 0 && below + h > innerHeight - edge && trigger.top - gap - h > edge;
  return {
    top: flip ? trigger.top - gap - h : Math.max(edge, Math.min(below, innerHeight - h - edge)),
    left: Math.max(edge, Math.min(trigger.left, innerWidth - w - edge)),
  };
}
