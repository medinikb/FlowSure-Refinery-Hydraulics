export type FlowType = 'liquid' | 'gas' | 'steam' | 'two-phase';
export type SteamCondition = 'saturated-dry' | 'superheated';
export type Severity = 'info' | 'warning' | 'critical';
export type DesignBasis = 'technip-nrl' | 'generic-screening' | 'mott-fgru';
export type OperatingCase = 'normal' | 'rated' | 'maximum';
export type SegmentRole = 'suction' | 'discharge' | 'other';
export type ServiceType = 'pump-suction-bubble-point' | 'pump-suction-subcooled' | 'pump-discharge-low-pressure' | 'pump-discharge-high-pressure' | 'gravity-flow' | 'side-stream-draw-off' | 'thermosiphon-reboiler-liquid' | 'cooling-water' | 'kerosene-jet-fuel' | 'hot-oil' | 'lean-amine-carbon-steel' | 'rich-amine-carbon-steel' | 'caustic-carbon-steel' | 'general-liquid' | 'vacuum-service' | 'general-gas' | 'compressor-suction' | 'compressor-discharge-individual' | 'compressor-discharge-header' | 'fuel-gas-header' | 'steam-subheader-low-pressure' | 'steam-subheader-medium-pressure' | 'steam-long-line-low-pressure' | 'steam-long-line-high-pressure' | 'mixed-phase' | 'mixed-phase-condensates' | 'natural-circulation-reboiler-return' | 'partial-condenser-outlet' | 'mixed-phase-compressor-delivery';

export interface FluidProperties {
  id?: string;
  name: string;
  source: string;
  status?: 'illustrative' | 'project-verified';
  phase?: FlowType;
  basisTemperatureC?: number;
  densityKgM3: number;
  viscosityPaS: number;
  vaporPressureBarA: number;
  gasDensityKgM3: number;
  gasViscosityPaS: number;
  molecularWeightKgKmol: number;
  compressibilityZ: number;
  gasHeatCapacityRatio?: number;
  surfaceTensionNm: number;
}

export interface FluidLibrary { schemaVersion: 1; libraryName: string; fluids: FluidProperties[] }

export interface Segment {
  id: string;
  name: string;
  lengthM: number;
  internalDiameterM: number;
  roughnessM: number;
  elevationChangeM: number;
  lossCoefficientK: number;
  extraPressureLossPa: number;
  /** Positive values join gas at the downstream junction; negative values withdraw gas. Gas projects only. */
  massFlowChangeKgS?: number;
  /** Optional named-point requirement checked at this segment's outlet. */
  requiredOutletPressurePaA?: number;
  role: SegmentRole;
  serviceType?: ServiceType;
  /** Nominal pipe size used only to select size-banded design criteria. */
  nominalPipeSizeIn?: number;
}

export interface Project {
  schemaVersion: 1;
  appVersion: string;
  title: string;
  caseNumber: string;
  engineer: string;
  date: string;
  notes: string;
  designBasis: DesignBasis;
  operatingCase: OperatingCase;
  serviceType: ServiceType;
  flowType: FlowType;
  liquidFlowM3S: number;
  gasFlowM3S: number;
  massFlowKgS: number;
  /** Dry saturated or superheated steam only; wet steam is deliberately unsupported. */
  steamCondition?: SteamCondition;
  steamMassFlowKgS?: number;
  gasFlowInputBasis?: 'actual' | 'mass';
  inletPressurePaA: number;
  temperatureK: number;
  atmosphericPressurePaA: number;
  pumpNpshrM: number;
  staticSuctionHeadM: number;
  fluid: FluidProperties;
  segments: Segment[];
}

export interface EngineeringWarning {
  severity: Severity;
  code: string;
  message: string;
}

export interface SegmentResult {
  segmentId: string;
  name: string;
  inletPressurePaA: number;
  outletPressurePaA: number;
  velocityMS: number;
  superficialLiquidVelocityMS?: number;
  superficialGasVelocityMS?: number;
  reynolds: number;
  frictionFactor: number;
  flowRegime: string;
  liquidHoldup?: number;
  frictionLossPa: number;
  staticLossPa: number;
  accelerationLossPa: number;
  minorLossPa: number;
  totalLossPa: number;
  pressureGradientKgCm2Km?: number;
  momentumPressurePa?: number;
  gasDensityKgM3?: number;
  /** Gas properties evaluated at the segment boundaries for pressure-dependent two-phase screening. */
  gasInletDensityKgM3?: number;
  gasOutletDensityKgM3?: number;
  gasMassFlowKgS?: number;
  gasActualFlowM3S?: number;
  gasInletActualFlowM3S?: number;
  gasOutletActualFlowM3S?: number;
}

export interface CalculationResult {
  method: string;
  totalPressureLossPa: number;
  outletPressurePaA: number;
  npshaM?: number;
  npshMarginM?: number;
  converged: boolean;
  segments: SegmentResult[];
  warnings: EngineeringWarning[];
}
