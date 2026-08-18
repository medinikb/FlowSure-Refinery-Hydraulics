import type { Project, ServiceType } from '../types';

const gasServiceTypes = new Set<ServiceType>([
  'vacuum-service',
  'general-gas',
  'compressor-suction',
  'compressor-discharge-individual',
  'compressor-discharge-header',
  'fuel-gas-header',
]);

const twoPhaseServiceTypes = new Set<ServiceType>([
  'mixed-phase',
  'mixed-phase-condensates',
  'natural-circulation-reboiler-return',
  'partial-condenser-outlet',
  'mixed-phase-compressor-delivery',
]);

const steamServiceTypes = new Set<ServiceType>([
  'steam-subheader-low-pressure',
  'steam-subheader-medium-pressure',
  'steam-long-line-low-pressure',
  'steam-long-line-high-pressure',
]);

function compatibleService(phase: Project['flowType'], serviceType?: ServiceType): ServiceType {
  if (phase === 'gas') return serviceType && gasServiceTypes.has(serviceType) ? serviceType : 'general-gas';
  if (phase === 'two-phase') return serviceType && twoPhaseServiceTypes.has(serviceType) ? serviceType : 'mixed-phase';
  if (phase === 'steam') return serviceType && steamServiceTypes.has(serviceType) ? serviceType : 'steam-subheader-low-pressure';
  return serviceType && !gasServiceTypes.has(serviceType) && !twoPhaseServiceTypes.has(serviceType) && !steamServiceTypes.has(serviceType) ? serviceType : 'general-liquid';
}

export function validateProject(value: unknown): { valid: true; project: Project } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, errors: ['Project must be a JSON object.'] };
  // Validation also supplies safe defaults for older saved projects. Work on a
  // clone so a calculation cannot silently overwrite the user's live form state.
  const p = structuredClone(value) as Partial<Project>;
  if (p.schemaVersion !== 1) errors.push('Unsupported or missing schemaVersion.');
  const knownGasIds = new Set(['nitrogen-25c', 'hydrogen-25c', 'natural-gas-25c']);
  const selectedPhase = p.fluid?.phase ?? (p.fluid?.id && knownGasIds.has(p.fluid.id) ? 'gas' : undefined);
  if (selectedPhase) { p.fluid!.phase = selectedPhase; p.flowType = selectedPhase; }
  p.designBasis ??= 'generic-screening';
  p.operatingCase ??= 'rated';
  const activePhase = p.flowType ?? 'liquid';
  p.serviceType = compatibleService(activePhase, p.serviceType);
  p.steamCondition ??= 'superheated';
  p.steamMassFlowKgS ??= 1;
  p.segments = p.segments?.map((s, i) => ({ ...s, role: activePhase !== 'liquid' ? 'other' : s.role ?? (i === 0 ? 'suction' : 'other'), serviceType: compatibleService(activePhase, s.serviceType ?? p.serviceType), name: activePhase !== 'liquid' && /^Pump (suction|discharge)$/i.test(s.name) ? `${activePhase === 'gas' ? 'Gas' : activePhase === 'steam' ? 'Steam' : 'Two-phase'} pipeline segment` : s.name }));
  if (!['technip-nrl', 'generic-screening', 'mott-fgru'].includes(String(p.designBasis))) errors.push('designBasis is unsupported.');
  if (!['normal', 'rated', 'maximum'].includes(String(p.operatingCase))) errors.push('operatingCase must be normal, rated, or maximum.');
  if (!['liquid', 'gas', 'steam', 'two-phase'].includes(String(p.flowType))) errors.push('flowType must be liquid, gas, steam, or two-phase.');
  if (typeof p.title !== 'string' || p.title.trim().length === 0) errors.push('Project title is required.');
  if (!Array.isArray(p.segments) || p.segments.length === 0) errors.push('At least one pipe segment is required.');
  p.segments?.forEach((s, i) => {
    if (!s || typeof s !== 'object') return errors.push(`Segment ${i + 1} is invalid.`);
    if (!Number.isFinite(s.lengthM) || s.lengthM <= 0) errors.push(`Segment ${i + 1}: length must be greater than zero.`);
    if (!Number.isFinite(s.internalDiameterM) || s.internalDiameterM <= 0) errors.push(`Segment ${i + 1}: diameter must be greater than zero.`);
    if (s.nominalPipeSizeIn !== undefined && (!Number.isFinite(s.nominalPipeSizeIn) || s.nominalPipeSizeIn <= 0)) errors.push(`Segment ${i + 1}: nominal pipe size must be greater than zero when provided.`);
    if (!Number.isFinite(s.roughnessM) || s.roughnessM < 0) errors.push(`Segment ${i + 1}: roughness cannot be negative.`);
    if (!['suction', 'discharge', 'other'].includes(String(s.role))) errors.push(`Segment ${i + 1}: role must be suction, discharge, or other.`);
    if (s.massFlowChangeKgS !== undefined && !Number.isFinite(s.massFlowChangeKgS)) errors.push(`Segment ${i + 1}: gas mass-flow change must be a valid number.`);
    if (s.requiredOutletPressurePaA !== undefined && (!Number.isFinite(s.requiredOutletPressurePaA) || s.requiredOutletPressurePaA <= 0)) errors.push(`Segment ${i + 1}: required outlet pressure must be greater than zero absolute.`);
  });
  const f = p.fluid;
  if (!f || !Number.isFinite(f.densityKgM3) || f.densityKgM3 <= 0) errors.push('Liquid density must be greater than zero.');
  if (!f || !Number.isFinite(f.viscosityPaS) || f.viscosityPaS <= 0) errors.push('Liquid viscosity must be greater than zero.');
  if (!Number.isFinite(p.inletPressurePaA) || Number(p.inletPressurePaA) <= 0) errors.push('Absolute inlet pressure must be greater than zero.');
  if ((p.flowType === 'liquid' || p.flowType === 'two-phase') && (!Number.isFinite(p.liquidFlowM3S) || Number(p.liquidFlowM3S) <= 0)) errors.push('Liquid flow must be greater than zero.');
  if ((p.flowType === 'gas' || p.flowType === 'two-phase') && (p.gasFlowInputBasis ?? (p.massFlowKgS && p.massFlowKgS > 0 ? 'mass' : 'actual')) !== 'mass' && (!Number.isFinite(p.gasFlowM3S) || Number(p.gasFlowM3S) <= 0)) errors.push('Gas actual flow must be greater than zero.');
  if (p.flowType === 'steam' && (!Number.isFinite(p.steamMassFlowKgS) || Number(p.steamMassFlowKgS) <= 0)) errors.push('Steam mass flow must be greater than zero.');
  if (p.flowType === 'steam' && !['saturated-dry', 'superheated'].includes(String(p.steamCondition))) errors.push('Steam condition must be dry saturated or superheated.');
  if ((p.flowType === 'gas' || p.flowType === 'two-phase') && (!f || !Number.isFinite(f.gasViscosityPaS) || f.gasViscosityPaS <= 0)) errors.push('Gas viscosity must be greater than zero.');
  if ((p.flowType === 'gas' || p.flowType === 'two-phase') && (!f || !Number.isFinite(f.molecularWeightKgKmol) || f.molecularWeightKgKmol <= 0)) errors.push('Gas molecular weight must be greater than zero.');
  if (p.flowType === 'gas' || p.flowType === 'two-phase') {
    if (f && f.gasHeatCapacityRatio === undefined) f.gasHeatCapacityRatio = 1.3;
    if (!f || !Number.isFinite(f.gasHeatCapacityRatio) || (f.gasHeatCapacityRatio ?? 0) <= 1) errors.push('Gas heat-capacity ratio must be greater than one.');
    p.gasFlowInputBasis ??= p.massFlowKgS && p.massFlowKgS > 0 ? 'mass' : 'actual';
    if (!['actual', 'mass'].includes(String(p.gasFlowInputBasis))) errors.push('Gas flow input basis must be actual or mass.');
    if (p.gasFlowInputBasis === 'mass' && (!Number.isFinite(p.massFlowKgS) || Number(p.massFlowKgS) <= 0)) errors.push('Gas mass flow must be greater than zero when mass-flow entry is selected.');
  }
  if (p.flowType === 'two-phase' && (!f || !Number.isFinite(f.surfaceTensionNm) || f.surfaceTensionNm <= 0)) errors.push('Surface tension must be greater than zero.');
  return errors.length ? { valid: false, errors } : { valid: true, project: p as Project };
}
