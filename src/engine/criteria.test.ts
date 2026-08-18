import { describe, expect, it } from 'vitest';
import { defaultProject } from '../defaults';
import { calculateProject } from './calculate';
import { criterionFor } from './criteria';

describe('Technip / NRL line-sizing criteria', () => {
  it('identifies the updated NREP D4 design-basis source', () => {
    const project = structuredClone(defaultProject);
    project.designBasis = 'technip-nrl';
    expect(criterionFor(project).source).toBe('TP-1ZZZA-PR-BOD-0001_D4, Section 8.11 (pages 54-57)');
  });

  it('uses the NPS 3-6 subcooled pump-suction velocity limit during sizing', () => {
    const project = structuredClone(defaultProject);
    project.designBasis = 'technip-nrl';
    project.serviceType = 'pump-suction-subcooled';
    project.liquidFlowM3S = 0.02;
    project.segments[0] = { ...project.segments[0], serviceType: 'pump-suction-subcooled', nominalPipeSizeIn: 4, internalDiameterM: 0.10226, elevationChangeM: 0 };
    const warnings = calculateProject(project).warnings;
    expect(warnings.some((warning) => warning.code === 'VELOCITY_ABOVE_LIMIT' && warning.message.includes('1.20 m/s') && warning.message.includes('NPS 4'))).toBe(true);
  });

  it('uses the NPS 12-18 bubble-point suction velocity limit', () => {
    const project = structuredClone(defaultProject);
    project.designBasis = 'technip-nrl';
    project.serviceType = 'pump-suction-bubble-point';
    project.liquidFlowM3S = 0.15;
    project.segments[0] = { ...project.segments[0], serviceType: 'pump-suction-bubble-point', nominalPipeSizeIn: 12, internalDiameterM: 0.30323, elevationChangeM: 0 };
    const warnings = calculateProject(project).warnings;
    expect(warnings.some((warning) => warning.code === 'VELOCITY_ABOVE_LIMIT' && warning.message.includes('1.20 m/s') && warning.message.includes('NPS 12'))).toBe(true);
  });

  it('uses pressure-banded gas momentum limits', () => {
    const project = structuredClone(defaultProject);
    project.flowType = 'gas'; project.designBasis = 'technip-nrl'; project.serviceType = 'general-gas';
    project.inletPressurePaA = project.atmosphericPressurePaA + 10 * 98066.5;
    project.gasFlowM3S = 0.08;
    project.segments[0] = { ...project.segments[0], serviceType: 'general-gas', internalDiameterM: 0.06, elevationChangeM: 0 };
    const warnings = calculateProject(project).warnings;
    expect(warnings.some((warning) => warning.code === 'MOMENTUM_ABOVE_LIMIT' && warning.message.includes('6000 Pa'))).toBe(true);
  });

  it('uses the D4 7 m/s large-gas-line velocity limit at 30 kg/cm²(g)', () => {
    const project = structuredClone(defaultProject);
    project.flowType = 'gas'; project.designBasis = 'technip-nrl'; project.serviceType = 'general-gas';
    project.inletPressurePaA = project.atmosphericPressurePaA + 30 * 98066.5;
    project.gasFlowM3S = 1;
    project.segments[0] = { ...project.segments[0], serviceType: 'general-gas', internalDiameterM: 0.35, elevationChangeM: 0 };
    const warnings = calculateProject(project).warnings;
    expect(warnings.some((warning) => warning.code === 'VELOCITY_ABOVE_LIMIT' && warning.message.includes('7.00 m/s'))).toBe(true);
  });

  it('uses Technip mixed-phase condensate pressure-gradient and velocity criteria', () => {
    const project = structuredClone(defaultProject);
    project.flowType = 'two-phase'; project.designBasis = 'technip-nrl'; project.serviceType = 'mixed-phase-condensates';
    project.liquidFlowM3S = 0.01; project.gasFlowM3S = 0.03;
    project.segments[0] = { ...project.segments[0], serviceType: 'mixed-phase-condensates', internalDiameterM: 0.06, lengthM: 1000, elevationChangeM: 0 };
    const warnings = calculateProject(project).warnings;
    expect(warnings.some((warning) => warning.code === 'VELOCITY_ABOVE_LIMIT' || warning.code === 'PRESSURE_GRADIENT_ABOVE_LIMIT')).toBe(true);
  });
});
