import limits from '../data/limits.json';
import { solvePT, solvePx } from 'iapws-if97';
import type { CalculationResult, EngineeringWarning, Project, Segment, SegmentResult } from '../types';
import { flowRegime, frictionFactor, reynoldsNumber } from './friction';
import { G } from './units';
import { criteriaWarnings } from './criteria';

const R = 8314.462618; // J/(kmol K)

function area(diameterM: number): number {
  return Math.PI * diameterM ** 2 / 4;
}

function commonWarnings(project: Project, result: SegmentResult, type: Project['flowType']): EngineeringWarning[] {
  const warnings: EngineeringWarning[] = [];
  warnings.push(...criteriaWarnings(project, result));
  if (result.outletPressurePaA <= limits.minimumAbsolutePressurePa) warnings.push({ severity: 'critical', code: 'LOW_PRESSURE', message: `${result.name}: calculated absolute outlet pressure is too low for a reliable screening result.` });
  const segment = project.segments.find((item) => item.id === result.segmentId);
  if (segment?.requiredOutletPressurePaA !== undefined && result.outletPressurePaA < segment.requiredOutletPressurePaA) warnings.push({ severity: 'critical', code: 'REQUIRED_PRESSURE_NOT_MET', message: `${result.name}: calculated outlet pressure is below its required minimum pressure.` });
  return warnings;
}

function pressureVariationWarnings(project: Project, outletPressurePaA: number): EngineeringWarning[] {
  const pressureChangeFraction = Math.abs(project.inletPressurePaA - outletPressurePaA) / project.inletPressurePaA;
  if (pressureChangeFraction < 0.1) return [];
  const percentage = (pressureChangeFraction * 100).toFixed(1);
  const message = project.flowType === 'liquid'
    ? `Total pressure change is ${percentage}% of inlet absolute pressure. The liquid model holds entered properties constant; verify actual density, viscosity and vapour-pressure behaviour along the line.`
    : `Total pressure change is ${percentage}% of inlet absolute pressure. Verify property variation and compare this screening result with a suitably detailed hydraulic review.`;
  return [{ severity: 'warning', code: 'PRESSURE_CHANGE_REVIEW', message }];
}

function calculateLiquid(project: Project): CalculationResult {
  let pressure = project.inletPressurePaA;
  const warnings: EngineeringWarning[] = [];
  const results: SegmentResult[] = [];
  for (const segment of project.segments) {
    const a = area(segment.internalDiameterM);
    const velocity = project.liquidFlowM3S / a;
    const re = reynoldsNumber(project.fluid.densityKgM3, velocity, segment.internalDiameterM, project.fluid.viscosityPaS);
    const f = frictionFactor(re, segment.roughnessM / segment.internalDiameterM);
    const dynamic = project.fluid.densityKgM3 * velocity ** 2 / 2;
    const frictionLoss = f * segment.lengthM / segment.internalDiameterM * dynamic;
    const minorLoss = segment.lossCoefficientK * dynamic + segment.extraPressureLossPa;
    const staticLoss = project.fluid.densityKgM3 * G * segment.elevationChangeM;
    const totalLoss = frictionLoss + minorLoss + staticLoss;
    const row: SegmentResult = { segmentId: segment.id, name: segment.name, inletPressurePaA: pressure, outletPressurePaA: pressure - totalLoss, velocityMS: velocity, reynolds: re, frictionFactor: f, flowRegime: flowRegime(re), frictionLossPa: frictionLoss, staticLossPa: staticLoss, accelerationLossPa: 0, minorLossPa: minorLoss, totalLossPa: totalLoss, pressureGradientKgCm2Km: (frictionLoss + minorLoss) / 98066.5 / (segment.lengthM / 1000), momentumPressurePa: project.fluid.densityKgM3 * velocity ** 2 };
    results.push(row); warnings.push(...commonWarnings(project, row, 'liquid')); pressure = row.outletPressurePaA;
  }
  const suctionIds = new Set(project.segments.filter((s) => s.role === 'suction').map((s) => s.id));
  const suctionLossPa = results.filter((r) => suctionIds.has(r.segmentId)).reduce((sum, r) => sum + r.frictionLossPa + r.minorLossPa, 0);
  if (suctionIds.size === 0) warnings.push({ severity: 'critical', code: 'NO_SUCTION_SEGMENT', message: 'NPSH requires at least one segment classified as pump suction.' });
  const npsha = (project.atmosphericPressurePaA - project.fluid.vaporPressureBarA * 100_000 - suctionLossPa) / (project.fluid.densityKgM3 * G) + project.staticSuctionHeadM;
  const margin = npsha - project.pumpNpshrM;
  if (suctionIds.size > 0 && margin < 0) warnings.push({ severity: 'critical', code: 'NPSH_INADEQUATE', message: `NPSH available is ${Math.abs(margin).toFixed(2)} m below NPSH required.` });
  if (pressure <= project.fluid.vaporPressureBarA * 100_000) warnings.push({ severity: 'critical', code: 'VAPORIZATION_RISK', message: 'Calculated pressure reaches or falls below the entered vapour pressure.' });
  warnings.push(...pressureVariationWarnings(project, pressure));
  return { method: 'Darcy–Weisbach / Colebrook–White', totalPressureLossPa: project.inletPressurePaA - pressure, outletPressurePaA: pressure, npshaM: suctionIds.size ? npsha : undefined, npshMarginM: suctionIds.size ? margin : undefined, converged: true, segments: results, warnings };
}

function gasDensity(project: Project, pressurePaA: number): number {
  return pressurePaA * project.fluid.molecularWeightKgKmol / (project.fluid.compressibilityZ * R * project.temperatureK);
}

function calculateGas(project: Project): CalculationResult {
  let pressure = project.inletPressurePaA;
  const initialDensity = gasDensity(project, pressure);
  let massFlow = project.gasFlowInputBasis === 'mass' ? project.massFlowKgS : project.gasFlowM3S * initialDensity;
  const results: SegmentResult[] = [];
  const warnings: EngineeringWarning[] = [];
  let allConverged = true;
  for (const segment of project.segments) {
    let outlet = Math.max(pressure * 0.98, 1000);
    let converged = false;
    let final: SegmentResult | undefined;
    for (let i = 0; i < 100; i += 1) {
      const avgPressure = Math.max((pressure + outlet) / 2, 1000);
      const density = gasDensity(project, avgPressure);
      const velocity = massFlow / (density * area(segment.internalDiameterM));
      const re = reynoldsNumber(density, velocity, segment.internalDiameterM, project.fluid.gasViscosityPaS);
      const f = frictionFactor(re, segment.roughnessM / segment.internalDiameterM);
      const dynamic = density * velocity ** 2 / 2;
      const frictionLoss = f * segment.lengthM / segment.internalDiameterM * dynamic;
      const minorLoss = segment.lossCoefficientK * dynamic + segment.extraPressureLossPa;
      const staticLoss = density * G * segment.elevationChangeM;
      const totalLoss = frictionLoss + minorLoss + staticLoss;
      const next = Math.max(pressure - totalLoss, 1000);
      final = { segmentId: segment.id, name: segment.name, inletPressurePaA: pressure, outletPressurePaA: next, velocityMS: velocity, reynolds: re, frictionFactor: f, flowRegime: flowRegime(re), frictionLossPa: frictionLoss, staticLossPa: staticLoss, accelerationLossPa: 0, minorLossPa: minorLoss, totalLossPa: totalLoss, pressureGradientKgCm2Km: (frictionLoss + minorLoss) / 98066.5 / (segment.lengthM / 1000), momentumPressurePa: density * velocity ** 2, gasDensityKgM3: density, gasMassFlowKgS: massFlow, gasActualFlowM3S: massFlow / density };
      if (Math.abs(next - outlet) < 1) { converged = true; break; }
      outlet = 0.5 * (outlet + next);
    }
    if (!final) throw new Error('Gas solver could not initialize.');
    allConverged &&= converged;
    if (!converged) warnings.push({ severity: 'critical', code: 'NO_CONVERGENCE', message: `${segment.name}: gas pressure iteration did not converge.` });
    const soundSpeed = Math.sqrt((project.fluid.gasHeatCapacityRatio ?? 1.3) * project.fluid.compressibilityZ * R * project.temperatureK / project.fluid.molecularWeightKgKmol);
    if (final.velocityMS / soundSpeed > limits.machWarning) warnings.push({ severity: 'warning', code: 'HIGH_MACH', message: `${segment.name}: Mach number exceeds ${limits.machWarning}; use a rigorous compressible-flow review.` });
    results.push(final); warnings.push(...commonWarnings(project, final, 'gas')); pressure = final.outletPressurePaA;
    massFlow += segment.massFlowChangeKgS ?? 0;
    if (massFlow <= 0) {
      warnings.push({ severity: 'critical', code: 'NONPOSITIVE_GAS_FLOW', message: `${segment.name}: downstream junction leaves zero or negative gas mass flow.` });
      massFlow = 1e-9;
    }
  }
  warnings.push(...pressureVariationWarnings(project, pressure));
  return { method: 'Steady isothermal compressible Darcy model', totalPressureLossPa: project.inletPressurePaA - pressure, outletPressurePaA: pressure, converged: allConverged, segments: results, warnings };
}

function steamStateAt(project: Project, pressurePaA: number) {
  const pressureMPa = pressurePaA / 1_000_000;
  if (project.steamCondition === 'saturated-dry') return solvePx(pressureMPa, 1);
  const state = solvePT(pressureMPa, project.temperatureK);
  // At subcritical pressure, a temperature at or below saturation is not dry
  // superheated steam and requires a separate wet-steam/two-phase model.
  if (pressureMPa < 22.064 && project.temperatureK <= solvePx(pressureMPa, 1).temperature) {
    throw new Error('Entered temperature is at or below saturation; select dry saturated steam or use a validated wet-steam calculation.');
  }
  return state;
}

function calculateSteam(project: Project): CalculationResult {
  let pressure = project.inletPressurePaA;
  const massFlow = project.steamMassFlowKgS ?? 0;
  const results: SegmentResult[] = [];
  const warnings: EngineeringWarning[] = [
    { severity: 'info', code: 'STEAM_SCREENING', message: 'Steam pressure drop uses IAPWS-IF97 properties in a steady single-phase Darcy screening model. Verify heat loss, condensate formation, start-up and transient cases separately.' },
  ];
  if (project.designBasis !== 'technip-nrl') warnings.push({ severity: 'critical', code: 'STEAM_CRITERIA_NOT_CONFIGURED', message: 'Select the Technip / NRL project basis before using steam results for pipe-sizing decisions.' });
  if (project.steamCondition === 'saturated-dry') warnings.push({ severity: 'warning', code: 'SATURATED_STEAM_ASSUMPTION', message: 'Dry saturated steam is modelled at quality x=1 along the line. Any inlet moisture, condensate or pressure-induced phase change requires a wet-steam/two-phase review.' });
  let allConverged = true;

  for (const segment of project.segments) {
    let outlet = Math.max(pressure * 0.98, 1000);
    let converged = false;
    let final: SegmentResult | undefined;
    try {
      for (let i = 0; i < 100; i += 1) {
        const avgPressure = Math.max((pressure + outlet) / 2, 1000);
        const state = steamStateAt(project, avgPressure);
        if (state.viscosity === null || state.viscosity <= 0) throw new Error('Steam viscosity is unavailable for this thermodynamic state.');
        const density = state.density;
        const velocity = massFlow / (density * area(segment.internalDiameterM));
        const re = reynoldsNumber(density, velocity, segment.internalDiameterM, state.viscosity);
        const f = frictionFactor(re, segment.roughnessM / segment.internalDiameterM);
        const dynamic = density * velocity ** 2 / 2;
        const frictionLoss = f * segment.lengthM / segment.internalDiameterM * dynamic;
        const minorLoss = segment.lossCoefficientK * dynamic + segment.extraPressureLossPa;
        const staticLoss = density * G * segment.elevationChangeM;
        const totalLoss = frictionLoss + minorLoss + staticLoss;
        const next = Math.max(pressure - totalLoss, 1000);
        final = { segmentId: segment.id, name: segment.name, inletPressurePaA: pressure, outletPressurePaA: next, velocityMS: velocity, reynolds: re, frictionFactor: f, flowRegime: flowRegime(re), frictionLossPa: frictionLoss, staticLossPa: staticLoss, accelerationLossPa: 0, minorLossPa: minorLoss, totalLossPa: totalLoss, pressureGradientKgCm2Km: (frictionLoss + minorLoss) / 98066.5 / (segment.lengthM / 1000), momentumPressurePa: density * velocity ** 2 };
        if (Math.abs(next - outlet) < 1) { converged = true; break; }
        outlet = 0.5 * (outlet + next);
      }
    } catch (error) {
      allConverged = false;
      warnings.push({ severity: 'critical', code: 'STEAM_STATE_UNSUPPORTED', message: `${segment.name}: ${error instanceof Error ? error.message : 'Steam state could not be evaluated.'}` });
      final = { segmentId: segment.id, name: segment.name, inletPressurePaA: pressure, outletPressurePaA: pressure, velocityMS: 0, reynolds: 0, frictionFactor: 0, flowRegime: 'Unsupported', frictionLossPa: 0, staticLossPa: 0, accelerationLossPa: 0, minorLossPa: 0, totalLossPa: 0, pressureGradientKgCm2Km: 0, momentumPressurePa: 0 };
      converged = true;
    }
    if (!final) throw new Error('Steam solver could not initialize.');
    allConverged &&= converged;
    if (!converged) warnings.push({ severity: 'critical', code: 'NO_CONVERGENCE', message: `${segment.name}: steam pressure iteration did not converge.` });
    results.push(final); warnings.push(...commonWarnings(project, final, 'gas')); pressure = final.outletPressurePaA;
  }
  warnings.push(...pressureVariationWarnings(project, pressure));
  return { method: 'IAPWS-IF97 single-phase steam / Darcy screening model', totalPressureLossPa: project.inletPressurePaA - pressure, outletPressurePaA: pressure, converged: allConverged, segments: results, warnings };
}

type Pattern = 'segregated' | 'intermittent' | 'distributed' | 'transition';
function beggsBrillPattern(lambda: number, nfr: number): Pattern {
  const l1 = 316 * lambda ** 0.302;
  const l2 = 0.0009252 * lambda ** -2.4684;
  const l3 = 0.1 * lambda ** -1.4516;
  const l4 = 0.5 * lambda ** -6.738;
  if ((lambda < 0.01 && nfr < l1) || (lambda >= 0.01 && nfr < l2)) return 'segregated';
  if (lambda >= 0.01 && nfr >= l2 && nfr <= l3) return 'transition';
  if ((lambda >= 0.01 && lambda < 0.4 && nfr > l3 && nfr <= l1) || (lambda >= 0.4 && nfr > l3 && nfr <= l4)) return 'intermittent';
  return 'distributed';
}

function horizontalHoldup(pattern: Pattern, lambda: number, nfr: number): number {
  const coeff = pattern === 'segregated' ? [0.98, 0.4846, 0.0868] : pattern === 'intermittent' || pattern === 'transition' ? [0.845, 0.5351, 0.0173] : [1.065, 0.5824, 0.0609];
  return Math.max(lambda, Math.min(1, coeff[0] * lambda ** coeff[1] / Math.max(nfr, 1e-9) ** coeff[2]));
}

function inclinationHoldup(pattern: Pattern, lambda: number, nfr: number, nlv: number, angleRad: number): number {
  const base = horizontalHoldup(pattern, lambda, nfr);
  if (Math.abs(angleRad) < 1e-8 || pattern === 'distributed') return base;
  const uphill = angleRad > 0;
  const c = uphill
    ? (pattern === 'segregated' ? [0.011, -3.768, 3.539, -1.614] : [2.96, 0.305, -0.4473, 0.0978])
    : [4.7, -0.3692, 0.1244, -0.5056];
  const logArgument = c[0] * lambda ** c[1] * nlv ** c[2] * Math.max(nfr, 1e-9) ** c[3];
  const correction = Math.max(0, (1 - lambda) * Math.log(Math.max(logArgument, 1e-12)));
  const s = Math.sin(1.8 * angleRad);
  return Math.max(lambda, Math.min(1, base * (1 + correction * (s - s ** 3 / 3))));
}

function twoPhaseSegment(project: Project, segment: Segment, inletPressurePaA: number, averagePressurePaA: number, gasMassFlowKgS: number): SegmentResult {
  const a = area(segment.internalDiameterM);
  const vsl = project.liquidFlowM3S / a;
  const gasDensityAtAverage = gasDensity(project, averagePressurePaA);
  const gasActualFlowM3S = gasMassFlowKgS / gasDensityAtAverage;
  const vsg = gasActualFlowM3S / a;
  const vm = vsl + vsg;
  const lambda = vm > 0 ? vsl / vm : 1;
  const nfr = vm ** 2 / (G * segment.internalDiameterM);
  const pattern = beggsBrillPattern(Math.max(lambda, 1e-6), nfr);
  const angle = Math.atan2(segment.elevationChangeM, segment.lengthM);
  const nlv = vsl * (project.fluid.densityKgM3 / (G * project.fluid.surfaceTensionNm)) ** 0.25;
  const holdup = inclinationHoldup(pattern, Math.max(lambda, 1e-6), nfr, Math.max(nlv, 1e-9), angle);
  const rhoNoSlip = lambda * project.fluid.densityKgM3 + (1 - lambda) * gasDensityAtAverage;
  const muNoSlip = lambda * project.fluid.viscosityPaS + (1 - lambda) * project.fluid.gasViscosityPaS;
  const re = reynoldsNumber(rhoNoSlip, vm, segment.internalDiameterM, muNoSlip);
  const fNoSlip = frictionFactor(re, segment.roughnessM / segment.internalDiameterM);
  const y = lambda / Math.max(holdup ** 2, 1e-12);
  const lnY = Math.log(Math.max(y, 1e-12));
  const s = y > 1 && y < 1.2 ? Math.log(2.2 * y - 1.2) : lnY / (-0.0523 + 3.182 * lnY - 0.8725 * lnY ** 2 + 0.01853 * lnY ** 4);
  const fTwoPhase = fNoSlip * Math.exp(Number.isFinite(s) ? s : 0);
  const frictionLoss = fTwoPhase * segment.lengthM / segment.internalDiameterM * rhoNoSlip * vm ** 2 / 2;
  const rhoHoldup = holdup * project.fluid.densityKgM3 + (1 - holdup) * gasDensityAtAverage;
  const staticLoss = rhoHoldup * G * segment.elevationChangeM;
  const minorLoss = segment.lossCoefficientK * rhoNoSlip * vm ** 2 / 2 + segment.extraPressureLossPa;
  const ek = Math.min(0.8, Math.max(0, rhoNoSlip * vm * vsg / Math.max(averagePressurePaA, 1000)));
  const baseLoss = frictionLoss + staticLoss + minorLoss;
  const totalLoss = baseLoss / (1 - ek);
  return { segmentId: segment.id, name: segment.name, inletPressurePaA, outletPressurePaA: inletPressurePaA - totalLoss, velocityMS: vm, superficialLiquidVelocityMS: vsl, superficialGasVelocityMS: vsg, reynolds: re, frictionFactor: fTwoPhase, flowRegime: pattern[0].toUpperCase() + pattern.slice(1), liquidHoldup: holdup, frictionLossPa: frictionLoss, staticLossPa: staticLoss, accelerationLossPa: totalLoss - baseLoss, minorLossPa: minorLoss, totalLossPa: totalLoss, pressureGradientKgCm2Km: (frictionLoss + minorLoss) / 98066.5 / (segment.lengthM / 1000), momentumPressurePa: rhoNoSlip * vm ** 2, gasDensityKgM3: gasDensityAtAverage, gasMassFlowKgS, gasActualFlowM3S };
}

function calculateTwoPhase(project: Project): CalculationResult {
  let pressure = project.inletPressurePaA;
  const segments: SegmentResult[] = [];
  const warnings: EngineeringWarning[] = [
    { severity: 'info', code: 'EMPIRICAL_METHOD', message: 'Beggs–Brill is empirical. Confirm its applicability and compare important cases with validated software.' },
    { severity: 'info', code: 'TWO_PHASE_FIXED_PHASE_SPLIT', message: 'Gas density and actual gas volume are recalculated from pressure in every segment. Gas and liquid mass split, liquid properties, Z and temperature remain fixed; flashing, condensation and composition change are not modelled.' },
  ];
  const inletGasDensity = gasDensity(project, pressure);
  const gasMassFlowKgS = project.gasFlowM3S * inletGasDensity;
  let allConverged = true;
  for (const segment of project.segments) {
    let outlet = Math.max(pressure * 0.98, 1000);
    let converged = false;
    let row: SegmentResult | undefined;
    for (let i = 0; i < 100; i += 1) {
      const averagePressure = Math.max((pressure + outlet) / 2, 1000);
      const trial = twoPhaseSegment(project, segment, pressure, averagePressure, gasMassFlowKgS);
      const next = Math.max(pressure - trial.totalLossPa, 1000);
      row = {
        ...trial,
        outletPressurePaA: next,
        gasInletDensityKgM3: gasDensity(project, pressure),
        gasOutletDensityKgM3: gasDensity(project, next),
        gasInletActualFlowM3S: gasMassFlowKgS / gasDensity(project, pressure),
        gasOutletActualFlowM3S: gasMassFlowKgS / gasDensity(project, next),
      };
      if (Math.abs(next - outlet) < 1) { converged = true; break; }
      outlet = 0.5 * (outlet + next);
    }
    if (!row) throw new Error('Two-phase solver could not initialize.');
    allConverged &&= converged;
    if (!converged) warnings.push({ severity: 'critical', code: 'NO_CONVERGENCE', message: `${segment.name}: pressure-dependent two-phase iteration did not converge.` });
    segments.push(row); warnings.push(...commonWarnings(project, row, 'two-phase')); pressure = row.outletPressurePaA;
    if ((row.liquidHoldup ?? 0) < 0.01 || (row.liquidHoldup ?? 0) > 0.99) warnings.push({ severity: 'warning', code: 'PHASE_LIMIT', message: `${row.name}: phase fraction is near a single-phase limit; compare with the corresponding single-phase model.` });
    const vaporPressurePaA = project.fluid.vaporPressureBarA * 100_000;
    if (vaporPressurePaA > 0 && row.inletPressurePaA >= vaporPressurePaA && row.outletPressurePaA < vaporPressurePaA) warnings.push({ severity: 'critical', code: 'TWO_PHASE_FLASH_REVIEW', message: `${row.name}: calculated pressure crosses the entered liquid vapour pressure. The model does not calculate the resulting flash or phase split; use approved PVT/flash data and specialist review.` });
    if (vaporPressurePaA > 0 && row.inletPressurePaA < vaporPressurePaA) warnings.push({ severity: 'critical', code: 'TWO_PHASE_FLASH_REVIEW', message: `${row.name}: inlet pressure is below the entered liquid vapour pressure. The model does not calculate flash or phase split; use approved PVT/flash data and specialist review.` });
  }
  warnings.push(...pressureVariationWarnings(project, pressure));
  return { method: 'Pressure-dependent Beggs–Brill steady gas–liquid screening correlation', totalPressureLossPa: project.inletPressurePaA - pressure, outletPressurePaA: pressure, converged: allConverged, segments, warnings };
}

export function calculateProject(project: Project): CalculationResult {
  if (project.flowType === 'liquid') return calculateLiquid(project);
  if (project.flowType === 'gas') return calculateGas(project);
  if (project.flowType === 'steam') return calculateSteam(project);
  return calculateTwoPhase(project);
}
