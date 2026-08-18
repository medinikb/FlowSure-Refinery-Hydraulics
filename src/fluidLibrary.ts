import type { FlowType, FluidLibrary, FluidProperties } from './types';

const KEY = 'flowsure-fluid-library-v1';
const positive = ['densityKgM3', 'viscosityPaS', 'gasDensityKgM3', 'gasViscosityPaS', 'molecularWeightKgKmol', 'compressibilityZ', 'surfaceTensionNm'] as const;

export function validateFluidLibrary(value: unknown): { valid: true; library: FluidLibrary } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, errors: ['Fluid library must be a JSON object.'] };
  const library = value as Partial<FluidLibrary>;
  if (library.schemaVersion !== 1) errors.push('Fluid library schemaVersion must be 1.');
  if (typeof library.libraryName !== 'string' || !library.libraryName.trim()) errors.push('libraryName is required.');
  if (!Array.isArray(library.fluids) || library.fluids.length === 0) errors.push('At least one fluid is required.');
  const ids = new Set<string>();
  library.fluids?.forEach((fluid, index) => {
    if (!fluid || typeof fluid !== 'object') return errors.push(`Fluid ${index + 1} is invalid.`);
    if (typeof fluid.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(fluid.id)) errors.push(`Fluid ${index + 1}: id must use lowercase letters, numbers and hyphens.`);
    else if (ids.has(fluid.id)) errors.push(`Fluid ${index + 1}: duplicate id ${fluid.id}.`); else ids.add(fluid.id);
    if (typeof fluid.name !== 'string' || !fluid.name.trim()) errors.push(`Fluid ${index + 1}: name is required.`);
    if (typeof fluid.source !== 'string' || !fluid.source.trim()) errors.push(`Fluid ${index + 1}: source is required.`);
    if (!['illustrative', 'project-verified'].includes(String(fluid.status))) errors.push(`Fluid ${index + 1}: status must be illustrative or project-verified.`);
    if (fluid.phase !== undefined && !['liquid', 'gas', 'two-phase'].includes(fluid.phase)) errors.push(`Fluid ${index + 1}: phase must be liquid, gas, or two-phase.`);
    for (const key of positive) if (!Number.isFinite(fluid[key]) || fluid[key] <= 0) errors.push(`Fluid ${index + 1}: ${key} must be greater than zero.`);
    if (!Number.isFinite(fluid.vaporPressureBarA) || fluid.vaporPressureBarA < 0) errors.push(`Fluid ${index + 1}: vaporPressureBarA cannot be negative.`);
  });
  return errors.length ? { valid: false, errors } : { valid: true, library: library as FluidLibrary };
}

export function loadCustomFluidLibrary(): FluidProperties[] {
  try { const parsed = validateFluidLibrary(JSON.parse(localStorage.getItem(KEY) ?? 'null')); return parsed.valid ? parsed.library.fluids : []; } catch { return []; }
}
export function saveCustomFluidLibrary(library: FluidLibrary): void { localStorage.setItem(KEY, JSON.stringify(library)); }
export function modelForFluid(fluid: FluidProperties): FlowType { return fluid.phase ?? 'liquid'; }
