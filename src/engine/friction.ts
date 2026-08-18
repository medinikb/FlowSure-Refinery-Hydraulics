import limits from '../data/limits.json';

export function reynoldsNumber(densityKgM3: number, velocityMS: number, diameterM: number, viscosityPaS: number): number {
  return (densityKgM3 * Math.abs(velocityMS) * diameterM) / viscosityPaS;
}

export function flowRegime(reynolds: number): string {
  if (reynolds < limits.transitionReynoldsLow) return 'Laminar';
  if (reynolds < limits.transitionReynoldsHigh) return 'Transitional';
  return 'Turbulent';
}

/** Darcy friction factor. Colebrook is iterated for turbulent flow; Churchill is a robust fallback. */
export function frictionFactor(reynolds: number, relativeRoughness: number): number {
  if (!Number.isFinite(reynolds) || reynolds <= 0) return 0;
  if (reynolds < 2300) return 64 / reynolds;

  let f = 0.25 / Math.pow(Math.log10(relativeRoughness / 3.7 + 5.74 / Math.pow(reynolds, 0.9)), 2);
  for (let i = 0; i < 30; i += 1) {
    const next = 1 / Math.pow(-2 * Math.log10(relativeRoughness / 3.7 + 2.51 / (reynolds * Math.sqrt(f))), 2);
    if (!Number.isFinite(next)) return churchillFrictionFactor(reynolds, relativeRoughness);
    if (Math.abs(next - f) < 1e-10) return next;
    f = next;
  }
  return churchillFrictionFactor(reynolds, relativeRoughness);
}

export function churchillFrictionFactor(reynolds: number, relativeRoughness: number): number {
  const a = Math.pow(2.457 * Math.log(1 / (Math.pow(7 / reynolds, 0.9) + 0.27 * relativeRoughness)), 16);
  const b = Math.pow(37530 / reynolds, 16);
  return 8 * Math.pow(Math.pow(8 / reynolds, 12) + 1 / Math.pow(a + b, 1.5), 1 / 12);
}
