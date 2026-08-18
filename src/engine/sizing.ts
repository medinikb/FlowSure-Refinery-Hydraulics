import { pipeSizeCandidates, pipeSizingBasis } from '../data/pipe-size-library';
import type { CalculationResult, Project } from '../types';
import { calculateProject } from './calculate';

export interface PipeSizeCandidate {
  npsIn: number;
  npsDisplay: string;
  schedule: string;
  wallThicknessMm: number;
  insideDiameterMm: number;
  acceptable: boolean;
  velocityMS: number;
  pressureGradientKgCm2Km: number;
  outletPressurePaA: number;
  totalPressureLossPa: number;
  reasons: string[];
  result: CalculationResult;
}

export interface PipeSizingResult {
  supported: boolean;
  /** A preliminary hydraulic screen, deliberately not a final design recommendation. */
  preliminary?: boolean;
  basis: string;
  message?: string;
  candidates: PipeSizeCandidate[];
  recommended?: PipeSizeCandidate;
}

const disqualifyingWarningCodes = new Set([
  'VELOCITY_ABOVE_LIMIT',
  'VELOCITY_BELOW_LIMIT',
  'PRESSURE_GRADIENT_ABOVE_LIMIT',
  'PRESSURE_GRADIENT_ABOVE_NORMAL',
  'MOMENTUM_ABOVE_LIMIT',
  'MOMENTUM_ABOVE_NORMAL',
  'LOW_PRESSURE',
  'NO_CONVERGENCE',
  'NPSH_INADEQUATE',
  'NO_SUCTION_SEGMENT',
  'VAPORIZATION_RISK',
]);

export function sizePipe(project: Project, minimumOutletPressurePaA: number): PipeSizingResult {
  if (project.flowType === 'steam' && project.designBasis !== 'technip-nrl') {
    return { supported: false, basis: pipeSizingBasis, message: 'Automatic steam sizing requires the Technip / NRL project basis because no steam criterion is configured for the selected basis.', candidates: [] };
  }
  if (!Number.isFinite(minimumOutletPressurePaA) || minimumOutletPressurePaA < project.atmosphericPressurePaA) {
    return { supported: false, basis: pipeSizingBasis, message: 'Minimum outlet pressure must be zero gauge or higher.', candidates: [] };
  }

  const candidates = pipeSizeCandidates.map((size): PipeSizeCandidate => {
    const candidateProject = structuredClone(project);
    candidateProject.segments = candidateProject.segments.map((segment) => ({ ...segment, internalDiameterM: size.insideDiameterMm / 1000, nominalPipeSizeIn: size.npsIn }));
    const result = calculateProject(candidateProject);
    const npshApplies = candidateProject.serviceType.startsWith('pump-suction') || candidateProject.segments.some((segment) => segment.role === 'suction');
    const reasons = result.warnings
      .filter((warning) => !(warning.code === 'NO_SUCTION_SEGMENT' && !npshApplies))
      .filter((warning) => warning.severity === 'critical' || disqualifyingWarningCodes.has(warning.code))
      .map((warning) => warning.message);
    if (result.outletPressurePaA < minimumOutletPressurePaA) reasons.push('Calculated outlet pressure is below the required minimum outlet pressure.');
    const velocityMS = Math.max(...result.segments.map((segment) => segment.velocityMS));
    const pressureGradientKgCm2Km = Math.max(...result.segments.map((segment) => segment.pressureGradientKgCm2Km ?? 0));
    return { ...size, acceptable: reasons.length === 0 && result.converged, velocityMS, pressureGradientKgCm2Km, outletPressurePaA: result.outletPressurePaA, totalPressureLossPa: result.totalPressureLossPa, reasons, result };
  });

  const preliminary = project.flowType === 'two-phase';
  return {
    supported: true,
    preliminary,
    basis: pipeSizingBasis,
    message: preliminary ? 'Preliminary two-phase hydraulic screen only. It holds phase split, liquid properties, Z and temperature fixed, and does not assess slugging, flashing, condensation, terrain-induced instability or transient operation.' : undefined,
    candidates,
    recommended: candidates.find((candidate) => candidate.acceptable),
  };
}
