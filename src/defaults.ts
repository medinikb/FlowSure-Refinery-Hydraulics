import fluids from './data/fluids.json';
import type { FluidProperties, Project } from './types';

export const APP_VERSION = '0.1.0';
// Default absolute pipe roughness: 0.15 mm = 0.00015 m.
export const DEFAULT_PIPE_ROUGHNESS_M = 0.00015;
export const DEFAULT_ELEVATION_CHANGE_M = 15;

export const defaultProject: Project = {
  schemaVersion: 1,
  appVersion: APP_VERSION,
  title: 'New hydraulic study',
  caseNumber: 'CASE-001',
  engineer: '',
  date: new Date().toISOString().slice(0, 10),
  notes: 'Screening calculation. Verify fluid properties and design criteria.',
  designBasis: 'technip-nrl',
  operatingCase: 'rated',
  serviceType: 'pump-suction-subcooled',
  flowType: 'liquid',
  liquidFlowM3S: 300 / 3600,
  gasFlowM3S: 500 / 3600,
  massFlowKgS: 0,
  steamCondition: 'superheated',
  steamMassFlowKgS: 1,
  gasFlowInputBasis: 'actual',
  inletPressurePaA: 5 * 100_000,
  temperatureK: 313.15,
  atmosphericPressurePaA: 1.01325 * 100_000,
  pumpNpshrM: 3,
  staticSuctionHeadM: 5,
  fluid: { ...(fluids.fluids[1] as FluidProperties) },
  segments: [
    { id: crypto.randomUUID(), name: 'Pump suction', role: 'suction', serviceType: 'pump-suction-subcooled', lengthM: 500, internalDiameterM: 0.254, roughnessM: DEFAULT_PIPE_ROUGHNESS_M, elevationChangeM: DEFAULT_ELEVATION_CHANGE_M, lossCoefficientK: 3, extraPressureLossPa: 0 },
  ],
};
