/**
 * A damped spring, simulated once and handed to CSS as a `linear()` easing curve, so the settle runs on the
 * compositor like any CSS transition but moves like a physical spring (including the finger's release speed).
 */
export interface Spring {
  stiffness: number
  damping: number
  mass: number
}

/**
 * Easing + duration for moving `distance` px (signed) with a starting `velocity` (px/ms, signed on the same axis).
 * Returns a CSS `linear(...)` string where 0 is the start and 1 the target.
 */
export function springCurve(distance: number, velocity: number, s: Spring): { easing: string; ms: number } {
  if (Math.abs(distance) < 0.5) return { easing: 'linear', ms: 0 }
  // Simulate the normalised spring x: 0 → 1. Velocity in normalised units per second.
  const v0 = (velocity * 1000) / distance
  const dt = 1 / 240
  let x = 0
  let v = v0
  const samples: number[] = [0]
  let t = 0
  let still = 0
  while (t < 2) {
    const a = (-s.stiffness * (x - 1) - s.damping * v) / s.mass
    v += a * dt
    x += v * dt
    t += dt
    samples.push(x)
    // Settled: within 0.1 px and nearly stopped for a few frames.
    if (Math.abs(1 - x) * Math.abs(distance) < 0.1 && Math.abs(v * distance) < 5) {
      if (++still > 6) break
    } else still = 0
  }
  samples[samples.length - 1] = 1
  // Keep the curve light: about one point per 1/60 s.
  const step = Math.max(1, Math.round(samples.length / Math.max(8, Math.round(t * 60))))
  const pts: string[] = []
  for (let i = 0; i < samples.length; i += step) pts.push(samples[i].toFixed(4))
  if (pts[pts.length - 1] !== '1.0000') pts.push('1')
  return { easing: `linear(${pts.join(', ')})`, ms: Math.round(t * 1000) }
}
