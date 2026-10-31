// Step animation for the character: stretches on take-off, squashes on landing.
// Maps step progress p (0..1) to a pose: sx/sy scale the sprite around its feet.

export const STEP_ANIM_MS = 150;
export const SLIDE = true;        // glide between cells instead of jumping
const STRENGTH = 0.5;

const arc = p => Math.sin(Math.PI * p); // 0 -> 1 -> 0

export function stepPose(p) {
  if (p < 0.5) {
    const s = arc(p * 2) * STRENGTH;
    return { sx: 1 - 0.12 * s, sy: 1 + 0.18 * s };
  }
  const s = arc(p * 2 - 1) * STRENGTH;
  return { sx: 1 + 0.14 * s, sy: 1 - 0.14 * s };
}
