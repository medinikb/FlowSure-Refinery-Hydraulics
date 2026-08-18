import pipeData from '../../data/PipeData/pipe_data.json';

interface SourcePipe {
  npsDisplay: string;
  npsInch: number;
  odMm: number;
  wallThicknessMm: Record<string, number | null>;
}

export interface PipeSizeCandidateData {
  npsIn: number;
  npsDisplay: string;
  schedule: string;
  wallThicknessMm: number;
  insideDiameterMm: number;
}

const SIZING_SCHEDULE = 'STD';
const sourcePipes = pipeData.pipes as SourcePipe[];

/**
 * Hydraulic sizing needs a real inside diameter. STD is available throughout
 * the supplied PipeData library; final schedule still needs mechanical design.
 */
export const pipeSizeCandidates: PipeSizeCandidateData[] = sourcePipes
  .map((pipe) => {
    const wallThicknessMm = pipe.wallThicknessMm[SIZING_SCHEDULE];
    if (wallThicknessMm === null || wallThicknessMm === undefined) return undefined;
    return {
      npsIn: pipe.npsInch,
      npsDisplay: pipe.npsDisplay,
      schedule: SIZING_SCHEDULE,
      wallThicknessMm,
      insideDiameterMm: pipe.odMm - 2 * wallThicknessMm,
    };
  })
  .filter((pipe): pipe is PipeSizeCandidateData => pipe !== undefined && pipe.insideDiameterMm > 0)
  .sort((left, right) => left.npsIn - right.npsIn);

export const pipeSizingBasis = `${pipeData.metadata.sourceTitle}; ${SIZING_SCHEDULE} schedule. Hydraulic ID = OD − 2 × tabulated wall thickness. Final schedule remains subject to governing mechanical design, corrosion allowance and procurement specification.`;
