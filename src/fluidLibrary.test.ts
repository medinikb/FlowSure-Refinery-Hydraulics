import { describe, expect, it } from 'vitest';
import builtIn from './data/fluids.json';
import template from '../docs/fluid-library-template.json';
import { modelForFluid, validateFluidLibrary } from './fluidLibrary';
import type { FluidProperties } from './types';

describe('fluid libraries', () => {
  it('accepts the built-in generic library', () => expect(validateFluidLibrary(builtIn).valid).toBe(true));
  it('accepts the extension template', () => expect(validateFluidLibrary(template).valid).toBe(true));
  it('maps natural gas to the gas calculation model', () => {
    const naturalGas = builtIn.fluids.find((fluid) => fluid.id === 'natural-gas-25c');
    expect(modelForFluid(naturalGas as FluidProperties)).toBe('gas');
  });
  it('rejects duplicate identifiers and invalid properties', () => {
    const invalid = structuredClone(template);
    invalid.fluids.push({ ...invalid.fluids[0], densityKgM3: -1 });
    const result = validateFluidLibrary(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.join(' ')).toMatch(/duplicate id|density/);
  });
});
