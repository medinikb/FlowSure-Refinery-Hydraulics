import type { Project } from '../types';

/** Creates a separate review case; it never changes the user's live project. */
export function projectForFutureCase(project: Project, capacityIncreasePercent: number, roughnessIncreasePercent: number): Project {
  const flowFactor = 1 + Math.max(0, capacityIncreasePercent) / 100;
  const roughnessFactor = 1 + Math.max(0, roughnessIncreasePercent) / 100;
  return {
    ...project,
    liquidFlowM3S: project.liquidFlowM3S * flowFactor,
    gasFlowM3S: project.gasFlowM3S * flowFactor,
    massFlowKgS: project.massFlowKgS * flowFactor,
    steamMassFlowKgS: (project.steamMassFlowKgS ?? 0) * flowFactor,
    segments: project.segments.map((segment) => ({ ...segment, roughnessM: segment.roughnessM * roughnessFactor })),
  };
}
