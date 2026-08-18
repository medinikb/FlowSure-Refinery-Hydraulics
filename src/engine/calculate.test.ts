import { describe, expect, it } from 'vitest';
import { defaultProject } from '../defaults';
import { calculateProject } from './calculate';
import { frictionFactor, flowRegime } from './friction';
import { absolutePaToKgCm2G, kgCm2GToAbsolutePa, paToKgCm2, units } from './units';

describe('engineering primitives', () => {
  it('converts common refinery units to SI', () => {
    expect(10 * units.pressure['kg/cm²']).toBeCloseTo(980665, 6);
    expect(360 * units.flow['m³/h']).toBeCloseTo(0.1, 10);
    expect(10 * units.length.inch).toBeCloseTo(0.254, 10);
  });
  it('converts absolute internal pressure to and from gauge kg/cm²', () => {
    const atmospheric = 101_325;
    const absolute = kgCm2GToAbsolutePa(9.5, atmospheric);
    expect(absolutePaToKgCm2G(absolute, atmospheric)).toBeCloseTo(9.5, 10);
    expect(paToKgCm2(980_665)).toBeCloseTo(10, 10);
  });
  it('uses the exact laminar Darcy factor', () => expect(frictionFactor(1000, 0)).toBeCloseTo(0.064, 10));
  it('classifies Reynolds thresholds', () => {
    expect(flowRegime(2299)).toBe('Laminar');
    expect(flowRegime(2300)).toBe('Transitional');
    expect(flowRegime(4000)).toBe('Turbulent');
  });
});

describe('calculation modes', () => {
  it('reconciles a liquid segment with Darcy-Weisbach', () => {
    const project = structuredClone(defaultProject);
    project.flowType = 'liquid'; project.liquidFlowM3S = 0.05; project.inletPressurePaA = 1_000_000;
    project.fluid.densityKgM3 = 1000; project.fluid.viscosityPaS = 0.001; project.fluid.vaporPressureBarA = 0.02;
    project.segments = [{ id: 's1', name: 'Test', role: 'suction', lengthM: 100, internalDiameterM: 0.2, roughnessM: 0.000045, elevationChangeM: 0, lossCoefficientK: 0, extraPressureLossPa: 0 }];
    const result = calculateProject(project);
    expect(result.converged).toBe(true);
    expect(result.totalPressureLossPa).toBeGreaterThan(10_000);
    expect(result.outletPressurePaA).toBeCloseTo(project.inletPressurePaA - result.totalPressureLossPa, 8);
  });
  it('increases liquid loss strongly with flow', () => {
    const low = structuredClone(defaultProject); low.liquidFlowM3S = 0.02; low.segments[0].elevationChangeM = 0;
    const high = structuredClone(low); high.liquidFlowM3S = 0.04;
    expect(calculateProject(high).totalPressureLossPa).toBeGreaterThan(calculateProject(low).totalPressureLossPa * 2.5);
  });
  it('flags a pressure change at or above ten percent of inlet absolute pressure', () => {
    const project = structuredClone(defaultProject);
    project.inletPressurePaA = 1_000_000; project.liquidFlowM3S = 0.05;
    project.segments[0] = { ...project.segments[0], lengthM: 100, internalDiameterM: 0.1, elevationChangeM: 0 };
    const result = calculateProject(project);
    expect(result.totalPressureLossPa / project.inletPressurePaA).toBeGreaterThanOrEqual(0.1);
    expect(result.warnings.map((warning) => warning.code)).toContain('PRESSURE_CHANGE_REVIEW');
  });
  it('solves a gas case without negative pressure', () => {
    const project = structuredClone(defaultProject); project.flowType = 'gas'; project.gasFlowM3S = 0.1; project.inletPressurePaA = 1_000_000;
    const result = calculateProject(project);
    expect(result.converged).toBe(true); expect(result.outletPressurePaA).toBeGreaterThan(0); expect(result.totalPressureLossPa).toBeGreaterThan(0);
  });
  it('calculates superheated-steam loss from IF97 properties', () => {
    const project = structuredClone(defaultProject);
    project.flowType = 'steam'; project.designBasis = 'technip-nrl'; project.serviceType = 'steam-subheader-medium-pressure';
    project.inletPressurePaA = 11 * 100_000; project.temperatureK = 573.15; project.steamCondition = 'superheated'; project.steamMassFlowKgS = 1000 / 3600;
    project.segments = [{ id: 'steam', name: 'Steam subheader', role: 'other', serviceType: 'steam-subheader-medium-pressure', lengthM: 100, internalDiameterM: 0.10226, roughnessM: 0.000045, elevationChangeM: 0, lossCoefficientK: 1, extraPressureLossPa: 0 }];
    const result = calculateProject(project);
    expect(result.converged).toBe(true); expect(result.totalPressureLossPa).toBeGreaterThan(0); expect(result.outletPressurePaA).toBeLessThan(project.inletPressurePaA);
    expect(result.warnings.map((warning) => warning.code)).toContain('STEAM_SCREENING');
  });
  it('rejects a superheated-steam entry at or below saturation', () => {
    const project = structuredClone(defaultProject);
    project.flowType = 'steam'; project.designBasis = 'technip-nrl'; project.serviceType = 'steam-subheader-low-pressure';
    project.inletPressurePaA = 2 * 100_000; project.temperatureK = 350; project.steamCondition = 'superheated'; project.steamMassFlowKgS = 0.1;
    const result = calculateProject(project);
    expect(result.converged).toBe(false); expect(result.warnings.map((warning) => warning.code)).toContain('STEAM_STATE_UNSUPPORTED');
  });
  it('returns two-phase holdup and component losses', () => {
    const project = structuredClone(defaultProject); project.flowType = 'two-phase'; project.liquidFlowM3S = 0.01; project.gasFlowM3S = 0.05;
    const result = calculateProject(project);
    expect(result.segments[0].liquidHoldup).toBeGreaterThan(0); expect(result.segments[0].liquidHoldup).toBeLessThanOrEqual(1); expect(result.method).toContain('Beggs');
    expect(result.segments[0].gasInletDensityKgM3).toBeGreaterThan(result.segments[0].gasOutletDensityKgM3 ?? Infinity);
    expect(result.segments[0].gasOutletActualFlowM3S).toBeGreaterThan(result.segments[0].gasInletActualFlowM3S ?? Infinity);
  });
  it('warns when a two-phase calculation crosses the entered liquid vapour pressure', () => {
    const project = structuredClone(defaultProject); project.flowType = 'two-phase'; project.inletPressurePaA = 200_000; project.fluid.vaporPressureBarA = 1.5;
    project.liquidFlowM3S = 0.01; project.gasFlowM3S = 0.2; project.segments[0] = { ...project.segments[0], lengthM: 10_000, internalDiameterM: 0.025, elevationChangeM: 0 };
    expect(calculateProject(project).warnings.map((warning) => warning.code)).toContain('TWO_PHASE_FLASH_REVIEW');
  });
  it('uses only suction-classified losses for NPSH', () => {
    const suctionOnly = structuredClone(defaultProject);
    suctionOnly.segments[0].role = 'suction';
    suctionOnly.segments[0].elevationChangeM = 0;
    const withDischarge = structuredClone(suctionOnly);
    withDischarge.segments.push({ ...structuredClone(suctionOnly.segments[0]), id: 'discharge', name: 'Discharge', role: 'discharge', extraPressureLossPa: 500_000 });
    expect(calculateProject(withDischarge).npshaM).toBeCloseTo(calculateProject(suctionOnly).npshaM ?? 0, 10);
  });
  it('reports project pressure-gradient criteria breaches', () => {
    const project = structuredClone(defaultProject);
    project.designBasis = 'technip-nrl'; project.serviceType = 'pump-suction-bubble-point';
    project.liquidFlowM3S = 0.2; project.segments[0].internalDiameterM = 0.1; project.segments[0].elevationChangeM = 0;
    const codes = calculateProject(project).warnings.map((w) => w.code);
    expect(codes).toContain('VELOCITY_ABOVE_LIMIT');
    expect(codes).toContain('PRESSURE_GRADIENT_ABOVE_LIMIT');
  });
});
