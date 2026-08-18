import { describe, expect, it } from 'vitest';
import { defaultProject } from '../defaults';
import { validateProject } from './validation';
import { migrateLegacyDefaultElevation, migrateLegacyDefaultRoughness } from '../storage';

describe('project import validation', () => {
  it('accepts the current project schema', () => expect(validateProject(defaultProject).valid).toBe(true));
  it('uses 0.15 mm as the default pipe roughness', () => expect(defaultProject.segments[0].roughnessM).toBe(0.00015));
  it('uses 15 m as the default elevation change', () => expect(defaultProject.segments[0].elevationChangeM).toBe(15));
  it('migrates only the former 0.045 mm default roughness', () => {
    const saved = structuredClone(defaultProject);
    saved.segments = [
      { ...saved.segments[0], id: 'old-default', roughnessM: 0.000045 },
      { ...saved.segments[0], id: 'user-value', roughnessM: 0.0001 },
    ];
    const migrated = migrateLegacyDefaultRoughness(saved);
    expect(migrated.segments[0].roughnessM).toBe(0.00015);
    expect(migrated.segments[1].roughnessM).toBe(0.0001);
  });
  it('migrates only the former 5 m starter elevation', () => {
    const saved = structuredClone(defaultProject);
    saved.segments = [
      { ...saved.segments[0], id: 'starter', elevationChangeM: 5 },
      { ...saved.segments[0], id: 'level-pipe', elevationChangeM: 0 },
    ];
    const migrated = migrateLegacyDefaultElevation(saved);
    expect(migrated.segments[0].elevationChangeM).toBe(15);
    expect(migrated.segments[1].elevationChangeM).toBe(0);
  });
  it('rejects malformed and unsafe engineering inputs', () => {
    const invalid = structuredClone(defaultProject); invalid.segments[0].internalDiameterM = 0;
    const result = validateProject(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.join(' ')).toContain('diameter');
  });
  it('rejects unsupported schema versions', () => expect(validateProject({ ...defaultProject, schemaVersion: 2 }).valid).toBe(false));
  it('migrates legacy projects with safe refinery defaults', () => {
    const legacy = structuredClone(defaultProject) as unknown as Record<string, unknown>;
    delete legacy.designBasis; delete legacy.operatingCase; delete legacy.serviceType;
    const segments = legacy.segments as Array<Record<string, unknown>>; delete segments[0].role;
    const result = validateProject(legacy);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.project.segments[0].role).toBe('suction');
  });
  it('repairs a previously saved natural-gas project that was incorrectly liquid', () => {
    const saved = structuredClone(defaultProject);
    saved.flowType = 'liquid'; saved.fluid.id = 'natural-gas-25c'; delete saved.fluid.phase;
    const result = validateProject(saved);
    expect(result.valid).toBe(true);
    if (result.valid) { expect(result.project.flowType).toBe('gas'); expect(result.project.serviceType).toBe('general-gas'); expect(result.project.segments[0].role).toBe('other'); expect(result.project.segments[0].name).toBe('Gas pipeline segment'); }
  });
  it('accepts a gas project entered by mass flow without requiring actual volume flow', () => {
    const gas = structuredClone(defaultProject);
    gas.flowType = 'gas'; gas.gasFlowInputBasis = 'mass'; gas.massFlowKgS = 0.5; gas.gasFlowM3S = 0;
    gas.fluid.gasHeatCapacityRatio = 1.3;
    const result = validateProject(gas);
    expect(result.valid).toBe(true);
  });
  it('preserves a selected gas design criterion without mutating the live project', () => {
    const gas = structuredClone(defaultProject);
    gas.flowType = 'gas'; gas.fluid.phase = 'gas';
    gas.serviceType = 'compressor-suction'; gas.segments[0].serviceType = 'compressor-discharge-header';
    const result = validateProject(gas);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.project.serviceType).toBe('compressor-suction');
      expect(result.project.segments[0].serviceType).toBe('compressor-discharge-header');
    }
    expect(gas.serviceType).toBe('compressor-suction');
    expect(gas.segments[0].serviceType).toBe('compressor-discharge-header');
  });
});
