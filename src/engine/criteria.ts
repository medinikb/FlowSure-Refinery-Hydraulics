import criteriaData from '../data/refinery-criteria.json';
import { pipeSizeCandidates } from '../data/pipe-size-library';
import type { DesignBasis, EngineeringWarning, Project, SegmentResult, ServiceType } from '../types';

interface ValueBand { maxNpsIn?: number; maxPressureKgCm2G?: number; valueMS?: number; valuePa?: number }
interface Criterion { source?: string; velocityMinMS?: number; velocityMaxMS?: number; velocityMaxByNpsIn?: ValueBand[]; steamVelocityMaxByNpsIn?: { saturatedDry: ValueBand[]; superheated: ValueBand[] }; gasVelocityCoefficient?: number; gasVelocityCapMS?: number; largeLineVelocityMaxByPressureKgCm2G?: ValueBand[]; pressureGradientNormalKgCm2Km?: number; pressureGradientMaxKgCm2Km?: number; pressureDropFractionMax?: number; momentumNormalMaxPa?: number; momentumMaxPa?: number; momentumMaxByPressureKgCm2G?: ValueBand[] }
const profiles = criteriaData.profiles as unknown as Record<DesignBasis, { label: string; source: string; services: Partial<Record<ServiceType, Criterion>> }>;

function firstBand<T extends keyof ValueBand, U extends keyof ValueBand>(bands: ValueBand[] | undefined, input: number, threshold: T, value: U): number | undefined {
  const band = bands?.find((item) => item[threshold] === undefined || input <= (item[threshold] as number));
  return band?.[value] as number | undefined;
}

function nominalSizeIn(project: Project, segmentId: string): number {
  const segment = project.segments.find((item) => item.id === segmentId);
  if (!segment) return 0;
  if (segment.nominalPipeSizeIn !== undefined) return segment.nominalPipeSizeIn;
  const diameterMm = segment.internalDiameterM * 1000;
  return pipeSizeCandidates.reduce((nearest, size) => Math.abs(size.insideDiameterMm - diameterMm) < Math.abs(nearest.insideDiameterMm - diameterMm) ? size : nearest).npsIn;
}

export function criterionFor(project: Project) {
  const profile = profiles[project.designBasis];
  return { criterion: profile.services[project.serviceType], source: profile.source, label: profile.label };
}

export function criteriaWarnings(project: Project, result: SegmentResult): EngineeringWarning[] {
  const segment = project.segments.find((item) => item.id === result.segmentId);
  const serviceType = segment?.serviceType ?? project.serviceType;
  const profile = profiles[project.designBasis];
  const criterion = profile.services[serviceType];
  const source = criterion?.source ?? profile.source;
  if (!criterion) return [{ severity: 'warning', code: 'CRITERION_NOT_CONFIGURED', message: `No ${serviceType} criterion is configured in ${source}.` }];
  const warnings: EngineeringWarning[] = [];
  const densityRuleLimit = criterion.gasVelocityCoefficient !== undefined && result.gasDensityKgM3 !== undefined
    ? Math.min(criterion.gasVelocityCoefficient / Math.sqrt(result.gasDensityKgM3), criterion.gasVelocityCapMS ?? Infinity)
    : undefined;
  const inletPressureKgCm2G = (result.inletPressurePaA - project.atmosphericPressurePaA) / 98066.5;
  const npsIn = nominalSizeIn(project, result.segmentId);
  const npsVelocityLimit = firstBand(criterion.velocityMaxByNpsIn, npsIn, 'maxNpsIn', 'valueMS');
  const steamBands = project.flowType === 'steam'
    ? (project.steamCondition === 'saturated-dry' ? criterion.steamVelocityMaxByNpsIn?.saturatedDry : criterion.steamVelocityMaxByNpsIn?.superheated)
    : undefined;
  const steamVelocityLimit = firstBand(steamBands, npsIn, 'maxNpsIn', 'valueMS');
  const largeLineVelocityLimit = project.designBasis === 'technip-nrl' && segment && segment.internalDiameterM > 0.3
    ? firstBand(criterion.largeLineVelocityMaxByPressureKgCm2G, inletPressureKgCm2G, 'maxPressureKgCm2G', 'valueMS')
    : undefined;
  const velocityLimit = [densityRuleLimit, criterion.velocityMaxMS, npsVelocityLimit, steamVelocityLimit, largeLineVelocityLimit].filter((value): value is number => value !== undefined).reduce((minimum, value) => Math.min(minimum, value), Infinity);
  if (velocityLimit !== Infinity && result.velocityMS > velocityLimit) {
    const sizeNote = npsVelocityLimit !== undefined || steamVelocityLimit !== undefined ? ` at NPS ${npsIn}` : '';
    warnings.push({ severity: 'critical', code: 'VELOCITY_ABOVE_LIMIT', message: `${result.name}: ${result.velocityMS.toFixed(2)} m/s exceeds the ${velocityLimit.toFixed(2)} m/s limit for ${serviceType}${sizeNote} (${source}).` });
  }
  if (criterion.velocityMinMS !== undefined && result.velocityMS < criterion.velocityMinMS) warnings.push({ severity: 'warning', code: 'VELOCITY_BELOW_LIMIT', message: `${result.name}: ${result.velocityMS.toFixed(2)} m/s is below the ${criterion.velocityMinMS} m/s minimum for ${serviceType} (${source}).` });
  const gradient = result.pressureGradientKgCm2Km ?? 0;
  if (criterion.pressureGradientMaxKgCm2Km !== undefined && gradient > criterion.pressureGradientMaxKgCm2Km) warnings.push({ severity: 'critical', code: 'PRESSURE_GRADIENT_ABOVE_LIMIT', message: `${result.name}: ${gradient.toFixed(2)} kg/cm2/km exceeds the ${criterion.pressureGradientMaxKgCm2Km} maximum (${source}).` });
  else if (project.operatingCase === 'normal' && criterion.pressureGradientNormalKgCm2Km !== undefined && gradient > criterion.pressureGradientNormalKgCm2Km) warnings.push({ severity: 'warning', code: 'PRESSURE_GRADIENT_ABOVE_NORMAL', message: `${result.name}: ${gradient.toFixed(2)} kg/cm2/km exceeds the ${criterion.pressureGradientNormalKgCm2Km} normal criterion (${source}).` });
  if (criterion.pressureDropFractionMax !== undefined) {
    const fraction = (result.inletPressurePaA - result.outletPressurePaA) / result.inletPressurePaA;
    if (fraction > criterion.pressureDropFractionMax) warnings.push({ severity: 'critical', code: 'PRESSURE_DROP_FRACTION_ABOVE_LIMIT', message: `${result.name}: pressure drop is ${(fraction * 100).toFixed(2)}% of inlet absolute pressure; maximum is ${(criterion.pressureDropFractionMax * 100).toFixed(2)}% (${source}).` });
  }
  const momentum = result.momentumPressurePa ?? 0;
  const pressureBandedMomentumLimit = firstBand(criterion.momentumMaxByPressureKgCm2G, inletPressureKgCm2G, 'maxPressureKgCm2G', 'valuePa');
  const momentumLimit = pressureBandedMomentumLimit ?? criterion.momentumMaxPa;
  if (momentumLimit !== undefined && momentum > momentumLimit) warnings.push({ severity: 'critical', code: 'MOMENTUM_ABOVE_LIMIT', message: `${result.name}: rho*v2 ${momentum.toFixed(0)} Pa exceeds the ${momentumLimit} Pa maximum (${source}).` });
  else if (criterion.momentumNormalMaxPa !== undefined && momentum > criterion.momentumNormalMaxPa) warnings.push({ severity: 'warning', code: 'MOMENTUM_ABOVE_NORMAL', message: `${result.name}: rho*v2 ${momentum.toFixed(0)} Pa exceeds the ${criterion.momentumNormalMaxPa} Pa normal criterion (${source}).` });
  return warnings;
}
