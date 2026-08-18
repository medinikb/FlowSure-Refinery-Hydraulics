export const G = 9.80665;

export const units = {
  pressure: {
    bar: 100_000,
    'kg/cm²': 98_066.5,
    kPa: 1_000,
    Pa: 1,
  },
  flow: {
    'm³/h': 1 / 3600,
    'm³/s': 1,
  },
  length: {
    m: 1,
    mm: 0.001,
    inch: 0.0254,
  },
  viscosity: {
    'Pa·s': 1,
    cP: 0.001,
  },
} as const;

export function toSi(value: number, factor: number): number {
  if (!Number.isFinite(value)) throw new Error('Value must be a finite number.');
  return value * factor;
}

export function fromSi(value: number, factor: number): number {
  if (!Number.isFinite(value) || factor === 0) throw new Error('Invalid conversion.');
  return value / factor;
}

export function paToBar(pa: number): number {
  return pa / units.pressure.bar;
}

export function paToKgCm2(pa: number): number {
  return pa / units.pressure['kg/cm²'];
}

export function absolutePaToKgCm2G(pressurePaA: number, atmosphericPressurePaA: number): number {
  return paToKgCm2(pressurePaA - atmosphericPressurePaA);
}

export function kgCm2GToAbsolutePa(pressureKgCm2G: number, atmosphericPressurePaA: number): number {
  return pressureKgCm2G * units.pressure['kg/cm²'] + atmosphericPressurePaA;
}

export function paToHeadM(pa: number, densityKgM3: number): number {
  return pa / (densityKgM3 * G);
}
