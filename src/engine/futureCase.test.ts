import { describe, expect, it } from 'vitest';
import { defaultProject } from '../defaults';
import { projectForFutureCase } from './futureCase';

describe('future capacity and fouling review case', () => {
  it('scales every active flow basis and segment roughness without mutating the design case', () => {
    const project = structuredClone(defaultProject);
    project.liquidFlowM3S = 0.1; project.gasFlowM3S = 0.2; project.massFlowKgS = 0.3; project.steamMassFlowKgS = 0.4;
    project.segments[0].roughnessM = 0.00004;
    const future = projectForFutureCase(project, 20, 25);
    expect(future.liquidFlowM3S).toBeCloseTo(0.12);
    expect(future.gasFlowM3S).toBeCloseTo(0.24);
    expect(future.massFlowKgS).toBeCloseTo(0.36);
    expect(future.steamMassFlowKgS).toBeCloseTo(0.48);
    expect(future.segments[0].roughnessM).toBeCloseTo(0.00005);
    expect(project.liquidFlowM3S).toBeCloseTo(0.1);
    expect(project.segments[0].roughnessM).toBeCloseTo(0.00004);
  });
});
