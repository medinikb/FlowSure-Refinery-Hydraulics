import { describe, expect, it } from 'vitest';
import { defaultProject } from '../defaults';
import { pipeSizeCandidates } from '../data/pipe-size-library';
import { sizePipe } from './sizing';

describe('safe pipe sizing', () => {
  it('selects the smallest acceptable candidate and keeps candidates ordered', () => {
    const project = structuredClone(defaultProject);
    project.flowType = 'liquid';
    project.serviceType = 'general-liquid';
    project.segments[0].role = 'other';
    project.segments[0].serviceType = 'general-liquid';
    project.segments[0].elevationChangeM = 0;
    const result = sizePipe(project, project.atmosphericPressurePaA);
    expect(result.supported).toBe(true);
    expect(result.recommended).toBeDefined();
    expect(result.recommended?.acceptable).toBe(true);
    expect(result.candidates.map((item) => item.npsIn)).toEqual([...result.candidates.map((item) => item.npsIn)].sort((a, b) => a - b));
    expect(result.candidates.filter((item) => item.npsIn < (result.recommended?.npsIn ?? 0)).every((item) => !item.acceptable)).toBe(true);
  });

  it('uses the supplied PipeData STD dimensions, including sizes omitted by the legacy list', () => {
    const halfInch = pipeSizeCandidates.find((candidate) => candidate.npsIn === 0.5);
    const fortyTwoInch = pipeSizeCandidates.find((candidate) => candidate.npsIn === 42);
    expect(halfInch).toMatchObject({ npsDisplay: '1/2\"', schedule: 'STD', insideDiameterMm: 15.8 });
    expect(fortyTwoInch).toMatchObject({ npsDisplay: '42\"', schedule: 'STD', insideDiameterMm: 1047.74 });
  });

  it('rejects a candidate when required outlet pressure is not achieved', () => {
    const project = structuredClone(defaultProject);
    project.segments[0].role = 'other';
    const result = sizePipe(project, project.inletPressurePaA + 100_000);
    expect(result.recommended).toBeUndefined();
    expect(result.candidates.every((candidate) => !candidate.acceptable)).toBe(true);
  });

  it('returns a clearly marked preliminary two-phase size screen', () => {
    const project = structuredClone(defaultProject);
    project.flowType = 'two-phase';
    project.serviceType = 'mixed-phase';
    const result = sizePipe(project, project.atmosphericPressurePaA);
    expect(result.supported).toBe(true);
    expect(result.preliminary).toBe(true);
    expect(result.message).toContain('Preliminary two-phase hydraulic screen');
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it('sizes dry saturated steam with Technip steam velocity criteria', () => {
    const project = structuredClone(defaultProject);
    project.flowType = 'steam'; project.designBasis = 'technip-nrl'; project.serviceType = 'steam-subheader-low-pressure';
    project.inletPressurePaA = 2 * 100_000; project.steamCondition = 'saturated-dry'; project.steamMassFlowKgS = 0.1;
    project.segments[0].role = 'other'; project.segments[0].serviceType = 'steam-subheader-low-pressure'; project.segments[0].elevationChangeM = 0;
    const result = sizePipe(project, project.atmosphericPressurePaA);
    expect(result.supported).toBe(true); expect(result.recommended).toBeDefined();
    expect(result.candidates.some((candidate) => candidate.reasons.some((reason) => reason.includes('steam-subheader-low-pressure')))).toBe(true);
  });
});
