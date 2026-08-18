import { describe, expect, it } from 'vitest';
import { defaultProject } from '../defaults';
import { calculateProject } from './calculate';
import { sizePipe } from './sizing';
import { absolutePaToKgCm2G, kgCm2GToAbsolutePa } from './units';

const atmospherePaA = 101_325;

function mottGasProject(inletKgCm2G: number, massFlowKgH: number, segments: Array<{ name: string; lengthM: number; internalDiameterM: number; massFlowChangeKgS?: number; requiredKgCm2G?: number }>) {
  const project = structuredClone(defaultProject);
  project.title = 'Mott Example 7 validation';
  project.flowType = 'gas';
  project.designBasis = 'mott-fgru';
  project.serviceType = 'compressor-discharge-header';
  project.gasFlowInputBasis = 'mass';
  project.massFlowKgS = massFlowKgH / 3600;
  project.gasFlowM3S = 0;
  project.inletPressurePaA = kgCm2GToAbsolutePa(inletKgCm2G, atmospherePaA);
  project.atmosphericPressurePaA = atmospherePaA;
  project.temperatureK = 338.15;
  project.fluid = {
    ...project.fluid,
    name: 'Mott FGRU flare gas', source: 'Mott Example 7', status: 'project-verified',
    gasViscosityPaS: 0.000013, molecularWeightKgKmol: 14.05, compressibilityZ: 0.997, gasHeatCapacityRatio: 1.318,
  };
  project.segments = segments.map((segment, index) => ({
    id: `mott-${index}`, name: segment.name, role: 'other', serviceType: 'compressor-discharge-header' as const,
    lengthM: segment.lengthM, internalDiameterM: segment.internalDiameterM, roughnessM: 0.0000457, elevationChangeM: 0,
    lossCoefficientK: 0, extraPressureLossPa: 0, massFlowChangeKgS: segment.massFlowChangeKgS,
    requiredOutletPressurePaA: segment.requiredKgCm2G === undefined ? undefined : kgCm2GToAbsolutePa(segment.requiredKgCm2G, atmospherePaA),
  }));
  return project;
}

describe('Mott Example 7 gas-network benchmark', () => {
  it('reproduces the 12-inch low-pressure suction-header result and selects 12 inch', () => {
    const project = mottGasProject(0.02, 1800, [{ name: 'Compressor suction header', lengthM: 330, internalDiameterM: 0.30323, requiredKgCm2G: 0.01 }]);
    project.serviceType = 'compressor-suction';
    project.segments[0].serviceType = 'compressor-suction';
    project.fluid.compressibilityZ = 1;
    const result = calculateProject(project);
    expect(absolutePaToKgCm2G(result.outletPressurePaA, atmospherePaA)).toBeCloseTo(0.01104, 4);
    expect(result.warnings.map((warning) => warning.code)).not.toContain('REQUIRED_PRESSURE_NOT_MET');
    expect(sizePipe(project, kgCm2GToAbsolutePa(0.01, atmospherePaA)).recommended?.npsIn).toBe(12);
  });

  it('reproduces the Mott 6-inch two-segment compressor discharge header', () => {
    const project = mottGasProject(7.308, 1800, [
      { name: 'Discharge header segment 1', lengthM: 1430, internalDiameterM: 0.15406 },
      { name: 'Discharge header segment 2', lengthM: 1430, internalDiameterM: 0.15406, requiredKgCm2G: 7 },
    ]);
    const result = calculateProject(project);
    expect(absolutePaToKgCm2G(result.outletPressurePaA, atmospherePaA)).toBeCloseTo(7.023, 2);
    expect(result.segments[0].velocityMS).toBeCloseTo(6.60, 1);
    expect(result.warnings.map((warning) => warning.code)).not.toContain('REQUIRED_PRESSURE_NOT_MET');
  });

  it('applies a downstream gas addition at a junction and checks the named pressure point', () => {
    const project = mottGasProject(7.020, 7806.8, [
      { name: 'Compressor discharge to absorber tie', lengthM: 46, internalDiameterM: 0.20272, massFlowChangeKgS: 3393.6 / 3600, requiredKgCm2G: 7.004 },
      { name: 'LP amine absorber inlet', lengthM: 6.5, internalDiameterM: 0.20272, requiredKgCm2G: 7.0 },
    ]);
    project.temperatureK = 315.15;
    project.fluid = { ...project.fluid, gasViscosityPaS: 0.00001, molecularWeightKgKmol: 16.3, compressibilityZ: 0.99, gasHeatCapacityRatio: 1.2 };
    const result = calculateProject(project);
    expect(result.segments[0].gasMassFlowKgS! * 3600).toBeCloseTo(7806.8, 4);
    expect(result.segments[1].gasMassFlowKgS! * 3600).toBeCloseTo(11200.4, 4);
    expect(absolutePaToKgCm2G(result.outletPressurePaA, atmospherePaA)).toBeCloseTo(7.0, 2);
    expect(result.warnings.map((warning) => warning.code)).not.toContain('REQUIRED_PRESSURE_NOT_MET');
  });
});
