import type { CalculationResult, FlowType, FluidProperties, Project, ServiceType } from '../types';
import * as XLSX from 'xlsx';
import { calculateProject } from './calculate';
import { sizePipe } from './sizing';
import { absolutePaToKgCm2G, kgCm2GToAbsolutePa, paToKgCm2, units } from './units';
import genericFluidData from '../data/fluids.json';

export const BATCH_MAX_ROWS = 5000;
export const batchTemplateHeaders = ['line_no', 'flow_type', 'service', 'fluid_id', 'inlet_pressure_kgcm2g', 'temperature_c', 'liquid_flow_m3h', 'gas_flow_m3h', 'steam_flow_kgh', 'length_m', 'id_mm', 'roughness_mm', 'elevation_m', 'loss_k', 'required_outlet_pressure_kgcm2g', 'calculation_mode'];
export type BatchStatus = 'PASS' | 'WARNING' | 'FAIL' | 'INCOMPLETE';
export interface BatchInputRow { rowNumber: number; sourceFile: string; sourceSheet: string; values: Record<string, string>; }
export interface BatchResultRow { rowNumber: number; sourceFile: string; sourceSheet: string; lineNo: string; inputValues: Record<string, string>; status: BatchStatus; reason: string; flowType?: string; service?: string; inputIdVelocityMS?: number; recommendedNps?: string; recommendedIdMm?: number; preliminaryNpsVelocityMS?: number; result?: CalculationResult; }
export type BatchPurpose = 'check' | 'size';
export interface BatchProgress { completedRows: number; totalRows: number; completedFiles: number; totalFiles: number; }

const aliases: Record<string, string> = {
  line: 'line_no', lineno: 'line_no', line_number: 'line_no', tag: 'line_no', tag_no: 'line_no',
  flowtype: 'flow_type', phase: 'flow_type', fluid: 'fluid_id', fluidid: 'fluid_id',
  service_type: 'service', inletpressure: 'inlet_pressure_kgcm2g', inlet_pressure: 'inlet_pressure_kgcm2g', pressure_kgcm2g: 'inlet_pressure_kgcm2g',
  temperature: 'temperature_c', temp_c: 'temperature_c', liquidflow: 'liquid_flow_m3h', liquid_flow: 'liquid_flow_m3h',
  gasflow: 'gas_flow_m3h', gas_flow: 'gas_flow_m3h', steamflow: 'steam_flow_kgh', steam_flow: 'steam_flow_kgh',
  length: 'length_m', pipe_length_m: 'length_m', id: 'id_mm', internal_diameter_mm: 'id_mm', diameter_mm: 'id_mm',
  roughness: 'roughness_mm', elevation: 'elevation_m', elevation_change_m: 'elevation_m', k: 'loss_k', loss_coefficient: 'loss_k',
  required_outlet_pressure: 'required_outlet_pressure_kgcm2g',
};

function normaliseHeader(value: string): string {
  const key = value.trim().toLowerCase().replace(/[\s\-\/]+/g, '_').replace(/[^a-z0-9_]/g, '');
  return aliases[key] ?? key;
}

/** CSV parser supports quoted cells, including commas inside fluid names or notes. */
function rowsFromCells(cells: string[][], sourceFile = 'Uploaded CSV', sourceSheet = 'CSV'): BatchInputRow[] {
  if (cells.length < 2) return [];
  const headers = cells[0].map(normaliseHeader);
  return cells.slice(1, BATCH_MAX_ROWS + 1).map((values, index) => ({ rowNumber: index + 2, sourceFile, sourceSheet, values: Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ''])) }));
}

export function parseBatchCsv(text: string, sourceFile?: string): BatchInputRow[] {
  const cells: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { cell += char; i += 1; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i += 1; row.push(cell.trim()); if (row.some(Boolean)) cells.push(row); row = []; cell = ''; }
    else cell += char;
  }
  row.push(cell.trim()); if (row.some(Boolean)) cells.push(row);
  return rowsFromCells(cells, sourceFile);
}

/** Reads the first worksheet containing a header row and at least one data row. */
export function parseBatchWorkbook(data: ArrayBuffer, sourceFile?: string): BatchInputRow[] {
  const workbook = XLSX.read(data, { type: 'array' });
  const rows: BatchInputRow[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const cells = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false }).map((row) => row.map((cell) => String(cell ?? '').trim()));
    // A formatted template also contains Instructions and Allowed_Values sheets.
    // Only worksheets with the hydraulic input contract are imported as line data.
    const headers = (cells[0] ?? []).map(normaliseHeader);
    if (!headers.includes('line_no') || !headers.includes('flow_type') || !headers.includes('fluid_id')) continue;
    rows.push(...rowsFromCells(cells, sourceFile, name));
    if (rows.length >= BATCH_MAX_ROWS) return rows.slice(0, BATCH_MAX_ROWS);
  }
  return rows;
}

export function batchTemplateXlsx(): ArrayBuffer {
  // Ten varied screening cases let a new user review the full batch workflow immediately.
  const sampleRows = [
    batchTemplateHeaders,
    ['L-001', 'liquid', 'general-liquid', 'water-20c', 5, 20, 50, '', '', 100, 100, 0.045, 0, 1, 0, 'check'],
    ['L-002', 'liquid', 'general-liquid', 'crude-oil-generic-40c', 12, 40, 180, '', '', 800, '', 0.045, 12, 4, 4, 'size'],
    ['L-003', 'liquid', 'kerosene-jet-fuel', 'kerosene-sko-atf-20c', 8, 30, 95, '', '', 450, 125, 0.045, -4, 2, 3, 'check'],
    ['G-001', 'gas', 'general-gas', 'natural-gas-25c', 20, 25, '', 500, '', 1000, '', 0.045, 5, 2, 15, 'size'],
    ['G-002', 'gas', 'compressor-suction', 'hydrogen-25c', 18, 35, '', 650, '', 250, 150, 0.045, 0, 3, 14, 'check'],
    ['G-003', 'gas', 'general-gas', 'nitrogen-25c', 8, 30, '', 250, '', 350, '', 0.045, 8, 5, 6, 'size'],
    ['TP-001', 'two-phase', 'mixed-phase', 'condensate-40c', 15, 40, 30, 120, '', 600, '', 0.045, 10, 3, 10, 'size'],
    ['TP-002', 'two-phase', 'mixed-phase-condensates', 'lpg-liquid-20c', 12, 25, 18, 80, '', 300, 100, 0.045, -3, 2, 8, 'check'],
    ['S-001', 'steam', 'steam-subheader-low-pressure', 'water-20c', 5, 200, '', '', 750, 400, '', 0.045, 4, 2, 3, 'size'],
    ['L-004', 'liquid', 'hot-oil', 'light-gas-oil-40c', 18, 90, 120, '', '', 1200, '', 0.045, 20, 6, 12, 'size'],
  ];
  const navy = '17365D'; const blue = '245A86'; const pale = 'F3F7FB'; const border = 'D6DEE8';
  const headerStyle = { fill: { fgColor: { rgb: navy } }, font: { bold: true, color: { rgb: 'FFFFFF' }, name: 'Aptos Display', sz: 10 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: { top: { style: 'thin', color: { rgb: border } }, bottom: { style: 'thin', color: { rgb: border } }, left: { style: 'thin', color: { rgb: border } }, right: { style: 'thin', color: { rgb: border } } } };
  const bodyStyle = { font: { name: 'Aptos', sz: 10, color: { rgb: '27384A' } }, alignment: { vertical: 'center' }, border: { bottom: { style: 'thin', color: { rgb: border } } } };
  const applyTableStyle = (sheet: XLSX.WorkSheet, rowCount: number, columnCount: number) => {
    for (let column = 0; column < columnCount; column += 1) {
      const header = sheet[XLSX.utils.encode_cell({ r: 0, c: column })]; if (header) header.s = headerStyle;
    }
    for (let row = 1; row < rowCount; row += 1) for (let column = 0; column < columnCount; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })]; if (cell) cell.s = { ...bodyStyle, fill: { fgColor: { rgb: row % 2 === 0 ? pale : 'FFFFFF' } } };
    }
  };

  const inputSheet = XLSX.utils.aoa_to_sheet(sampleRows);
  inputSheet['!cols'] = batchTemplateHeaders.map((header, index) => ({ wch: index === 0 ? 14 : Math.min(Math.max(header.length + 2, 15), 27) }));
  inputSheet['!rows'] = [{ hpt: 46 }, ...sampleRows.slice(1).map(() => ({ hpt: 24 }))];
  inputSheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(batchTemplateHeaders.length - 1)}${sampleRows.length}` };
  applyTableStyle(inputSheet, sampleRows.length, batchTemplateHeaders.length);

  const instructions = [
    ['Instructions', ''],
    [1, 'Complete one row per piping line. Do not rename the column headers.'],
    [2, 'Mandatory: line_no, flow_type, fluid_id, inlet pressure, temperature, applicable flow, length, roughness and required outlet pressure for sizing.'],
    [3, 'Leave id_mm blank when FlowSure should recommend a preliminary NPS. If an ID is entered, the register compares input-ID velocity with preliminary-NPS velocity.'],
    [4, 'calculation_mode accepts check or size. A blank id_mm automatically invokes pipe-size screening.'],
    [5, 'Accepted flow_type values: liquid, gas, steam, two-phase.'],
    [6, 'Flow units are fixed by column: liquid and gas in m³/h; steam in kg/h. Enter only the applicable flow column.'],
    [7, 'Pressure entries are kg/cm²(g); temperature is °C; length, elevation and ID are metres/mm as stated in each header.'],
    [8, 'Select the correct service because FlowSure applies service-specific Technip screening criteria.'],
    [9, 'fluid_id must match the generic library or an imported project fluid library entry.'],
    [10, 'Outputs are preliminary FEED/Class 3 screening results. Confirm final sizing with approved properties, process simulation and project design basis.'],
  ];
  const instructionSheet = XLSX.utils.aoa_to_sheet(instructions);
  instructionSheet['!merges'] = [XLSX.utils.decode_range('A1:B1')]; instructionSheet['!cols'] = [{ wch: 8 }, { wch: 125 }];
  instructionSheet['!rows'] = [{ hpt: 34 }, ...instructions.slice(1).map((row) => ({ hpt: String(row[1]).length > 145 ? 42 : 28 }))];
  const title = instructionSheet.A1; if (title) title.s = { fill: { fgColor: { rgb: navy } }, font: { bold: true, color: { rgb: 'FFFFFF' }, name: 'Aptos Display', sz: 14 }, alignment: { vertical: 'center' } };
  for (let row = 1; row < instructions.length; row += 1) {
    const numberCell = instructionSheet[`A${row + 1}`]; const textCell = instructionSheet[`B${row + 1}`];
    if (numberCell) numberCell.s = { fill: { fgColor: { rgb: blue } }, font: { bold: true, color: { rgb: 'FFFFFF' }, name: 'Aptos', sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' }, border: { bottom: { style: 'thin', color: { rgb: border } } } };
    if (textCell) textCell.s = { ...bodyStyle, fill: { fgColor: { rgb: row % 2 === 0 ? pale : 'FFFFFF' } }, alignment: { vertical: 'center', wrapText: true } };
  }

  const allowedRows = [
    ['Allowed Values', ''],
    ['flow_type', 'liquid, gas, steam, two-phase'],
    ['calculation_mode', 'check, size'],
    ['service', 'pump-suction-bubble-point, pump-suction-subcooled, pump-discharge-low-pressure, pump-discharge-high-pressure, gravity-flow, side-stream-draw-off, thermosiphon-reboiler-liquid, cooling-water, kerosene-jet-fuel, hot-oil, lean-amine-carbon-steel, rich-amine-carbon-steel, caustic-carbon-steel, general-liquid, vacuum-service, general-gas, compressor-suction, compressor-discharge-individual, compressor-discharge-header, fuel-gas-header, steam-subheader-low-pressure, steam-subheader-medium-pressure, steam-long-line-low-pressure, steam-long-line-high-pressure, mixed-phase, mixed-phase-condensates, natural-circulation-reboiler-return, partial-condenser-outlet, mixed-phase-compressor-delivery'],
    ['fluid_id (generic library)', genericFluidData.fluids.map((fluid) => fluid.id).join(', ')],
    ['Pressure unit', 'kg/cm²(g)'],
    ['Temperature unit', '°C'],
    ['Roughness example', '0.045 mm for clean commercial carbon-steel screening; replace with project-specific value.'],
  ];
  const allowedSheet = XLSX.utils.aoa_to_sheet(allowedRows); allowedSheet['!merges'] = [XLSX.utils.decode_range('A1:B1')]; allowedSheet['!cols'] = [{ wch: 30 }, { wch: 125 }];
  allowedSheet['!rows'] = [{ hpt: 34 }, { hpt: 28 }, { hpt: 28 }, { hpt: 92 }, { hpt: 92 }, { hpt: 28 }, { hpt: 28 }, { hpt: 36 }];
  if (allowedSheet.A1) allowedSheet.A1.s = { fill: { fgColor: { rgb: navy } }, font: { bold: true, color: { rgb: 'FFFFFF' }, name: 'Aptos Display', sz: 14 }, alignment: { vertical: 'center' } };
  for (let row = 1; row < allowedRows.length; row += 1) {
    const label = allowedSheet[`A${row + 1}`]; const values = allowedSheet[`B${row + 1}`];
    if (label) label.s = { fill: { fgColor: { rgb: blue } }, font: { bold: true, color: { rgb: 'FFFFFF' }, name: 'Aptos', sz: 10 }, alignment: { vertical: 'center', wrapText: true }, border: { bottom: { style: 'thin', color: { rgb: border } } } };
    if (values) values.s = { ...bodyStyle, fill: { fgColor: { rgb: row % 2 === 0 ? pale : 'FFFFFF' } }, alignment: { vertical: 'center', wrapText: true } };
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, inputSheet, 'Input_Lines');
  XLSX.utils.book_append_sheet(workbook, instructionSheet, 'Instructions');
  XLSX.utils.book_append_sheet(workbook, allowedSheet, 'Allowed_Values');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx', cellStyles: true }) as ArrayBuffer;
}

function numberValue(values: Record<string, string>, key: string, errors: string[], required = true): number | undefined {
  const raw = values[key]?.trim();
  if (!raw) { if (required) errors.push(`${key} is required`); return undefined; }
  const value = Number(raw);
  if (!Number.isFinite(value) || (required && value <= 0)) { errors.push(`${key} must be ${required ? 'greater than zero' : 'a number'}`); return undefined; }
  return value;
}

function defaultService(flowType: FlowType): ServiceType {
  if (flowType === 'gas') return 'general-gas';
  if (flowType === 'steam') return 'steam-subheader-low-pressure';
  if (flowType === 'two-phase') return 'mixed-phase';
  return 'general-liquid';
}

function batchProject(row: BatchInputRow, base: Project, fluidLibrary: FluidProperties[], requireEnteredId: boolean): { project?: Project; errors: string[]; notes: string[] } {
  const values = row.values; const errors: string[] = []; const notes: string[] = [];
  const flowType = values.flow_type?.trim().toLowerCase() as FlowType;
  if (!['liquid', 'gas', 'steam', 'two-phase'].includes(flowType)) errors.push('flow_type must be liquid, gas, steam or two-phase');
  const fluid = fluidLibrary.find((candidate) => candidate.id === values.fluid_id?.trim());
  if (!fluid) errors.push('fluid_id must match an available generic or imported fluid library entry');
  const inletKgCm2G = numberValue(values, 'inlet_pressure_kgcm2g', errors);
  const temperatureC = numberValue(values, 'temperature_c', errors);
  const lengthM = numberValue(values, 'length_m', errors);
  const internalDiameterMm = numberValue(values, 'id_mm', errors, requireEnteredId);
  const roughnessMm = numberValue(values, 'roughness_mm', errors);
  const elevationM = numberValue(values, 'elevation_m', errors, false) ?? 0;
  const lossK = numberValue(values, 'loss_k', errors, false) ?? 0;
  if (!values.loss_k?.trim()) notes.push('No loss_k supplied: fittings/equipment loss is assumed zero.');
  const flowKey = flowType === 'liquid' ? 'liquid_flow_m3h' : flowType === 'steam' ? 'steam_flow_kgh' : 'gas_flow_m3h';
  const flow = numberValue(values, flowKey, errors);
  const requiredOutletKgCm2G = numberValue(values, 'required_outlet_pressure_kgcm2g', errors, false);
  if (errors.length || !fluid || !flowType || inletKgCm2G === undefined || temperatureC === undefined || lengthM === undefined || roughnessMm === undefined || flow === undefined) return { errors, notes };
  const project = structuredClone(base);
  project.title = `Batch: ${values.line_no?.trim() || `row-${row.rowNumber}`}`;
  project.flowType = flowType; project.serviceType = (values.service?.trim() || defaultService(flowType)) as ServiceType;
  project.fluid = structuredClone(fluid); project.inletPressurePaA = kgCm2GToAbsolutePa(inletKgCm2G, project.atmosphericPressurePaA); project.temperatureK = temperatureC + 273.15;
  project.liquidFlowM3S = flowType === 'liquid' || flowType === 'two-phase' ? flow / 3600 : 0;
  project.gasFlowM3S = flowType === 'gas' || flowType === 'two-phase' ? flow / 3600 : 0;
  project.steamMassFlowKgS = flowType === 'steam' ? flow / 3600 : 0;
  // A sizing candidate replaces this temporary ID. It is never presented as an entered pipe size.
  project.segments = [{ id: `batch-${row.rowNumber}`, name: values.line_no?.trim() || `Row ${row.rowNumber}`, role: 'other', serviceType: project.serviceType, lengthM, internalDiameterM: (internalDiameterMm ?? 100) / 1000, roughnessM: roughnessMm / 1000, elevationChangeM: elevationM, lossCoefficientK: lossK, extraPressureLossPa: 0, requiredOutletPressurePaA: requiredOutletKgCm2G === undefined ? undefined : kgCm2GToAbsolutePa(requiredOutletKgCm2G, project.atmosphericPressurePaA) }];
  return { project, errors, notes };
}

export function runBatch(rows: BatchInputRow[], base: Project, fluidLibrary: FluidProperties[], purpose: BatchPurpose = 'check'): BatchResultRow[] {
  return rows.map((row) => {
    const idWasEntered = Boolean(row.values.id_mm?.trim());
    const rowPurpose: BatchPurpose = !idWasEntered || row.values.calculation_mode?.trim().toLowerCase() === 'size' ? 'size' : purpose;
    const { project, errors, notes } = batchProject(row, base, fluidLibrary, rowPurpose === 'check'); const lineNo = row.values.line_no?.trim() || `Row ${row.rowNumber}`;
    if (!idWasEntered) notes.push('Blank id_mm: FlowSure automatically treated this row as a pipe-size screen.');
    const trace = { rowNumber: row.rowNumber, sourceFile: row.sourceFile, sourceSheet: row.sourceSheet, lineNo, inputValues: { ...row.values } };
    if (!project) return { ...trace, status: 'INCOMPLETE', reason: errors.join('; ') };
    if (rowPurpose === 'size' && !row.values.required_outlet_pressure_kgcm2g?.trim()) return { ...trace, status: 'INCOMPLETE', reason: 'required_outlet_pressure_kgcm2g is required for batch pipe-size screening.' };
    try {
      const calculated = calculateProject(project);
      // Every valid row receives a preliminary NPS screen. Check-mode rows retain
      // their entered-ID hydraulic result; the sizing result is supplementary.
      const sizingMinimumPressurePaA = project.segments[0].requiredOutletPressurePaA ?? project.atmosphericPressurePaA;
      const sizing = sizePipe(project, sizingMinimumPressurePaA);
      // When an ID is entered, all displayed hydraulic outputs describe that ID.
      // The recommended candidate remains a separate adequacy comparison.
      const result = idWasEntered ? calculated : sizing.recommended?.result ?? calculated;
      // Batch rows are independent line paths. NPSH applies only when the row explicitly represents pump suction.
      const npshApplies = project.serviceType.startsWith('pump-suction') || project.segments.some((segment) => segment.role === 'suction');
      const applicableWarnings = result.warnings.filter((warning) => !(warning.code === 'NO_SUCTION_SEGMENT' && !npshApplies));
      const critical = applicableWarnings.filter((warning) => warning.severity === 'critical'); const warnings = applicableWarnings.filter((warning) => warning.severity === 'warning');
      const sizeReason = !sizing.recommended ? rowPurpose === 'size' ? 'No standard candidate meets the required outlet pressure and configured hydraulic criteria.' : 'No preliminary NPS meets the configured criteria using the default 0 kg/cm²(g) minimum outlet pressure.' : sizing.preliminary ? 'Preliminary two-phase screen only: confirm final size with PVT/flash and slugging review.' : undefined;
      const sizingBasisNote = rowPurpose === 'check' && project.segments[0].requiredOutletPressurePaA === undefined ? 'Preliminary NPS basis: minimum outlet pressure 0 kg/cm²(g).' : undefined;
      const sizeRecommendation = sizing.recommended ? `${sizing.preliminary ? 'Preliminary' : 'Screened'} pipe size: NPS ${sizing.recommended.npsDisplay}, ID ${sizing.recommended.insideDiameterMm.toFixed(2)} mm.` : undefined;
      const enteredIdMm = Number(row.values.id_mm);
      const enteredIdInsufficient = idWasEntered && sizing.recommended !== undefined && enteredIdMm + 0.001 < sizing.recommended.insideDiameterMm;
      const enteredIdNote = enteredIdInsufficient ? `Entered ID ${enteredIdMm.toFixed(2)} mm is hydraulically insufficient for the configured criteria. Use preliminary NPS ${sizing.recommended!.npsDisplay} (screening ID ${sizing.recommended!.insideDiameterMm.toFixed(2)} mm) for smooth flow, subject to engineering review.` : undefined;
      const unresolvedCritical = critical.length > 0 && !enteredIdInsufficient;
      const status: BatchStatus = unresolvedCritical || (rowPurpose === 'size' && !sizing.recommended) ? 'FAIL' : enteredIdInsufficient || warnings.length || notes.length || (rowPurpose === 'size' && sizing.preliminary) ? 'WARNING' : 'PASS';
      const showPreliminarySize = status !== 'FAIL';
      return { ...trace, flowType: project.flowType, service: project.serviceType, inputIdVelocityMS: idWasEntered ? calculated.segments[0]?.velocityMS : undefined, recommendedNps: showPreliminarySize ? sizing.recommended?.npsDisplay : undefined, recommendedIdMm: showPreliminarySize ? sizing.recommended?.insideDiameterMm : undefined, preliminaryNpsVelocityMS: showPreliminarySize ? sizing.recommended?.velocityMS : undefined, status, reason: [...errors, ...notes, ...critical.map((warning) => warning.message), ...warnings.map((warning) => warning.message), enteredIdNote, sizingBasisNote, showPreliminarySize ? sizeRecommendation : undefined, sizeReason].filter(Boolean).join('; ') || 'All configured checks pass.', result };
    } catch (error) { return { ...trace, status: 'FAIL', reason: error instanceof Error ? error.message : 'Calculation failed.' }; }
  });
}

/** Processes large browser batches in short chunks so the UI can repaint between calculations. */
export async function runBatchInChunks(
  rows: BatchInputRow[],
  base: Project,
  fluidLibrary: FluidProperties[],
  purpose: BatchPurpose = 'check',
  onProgress?: (progress: BatchProgress) => void,
  chunkSize = 50,
  yieldControl: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 0)),
): Promise<BatchResultRow[]> {
  const safeChunkSize = Math.max(1, Math.floor(chunkSize));
  const files = [...new Set(rows.map((row) => row.sourceFile))];
  const lastRowByFile = new Map<string, number>();
  rows.forEach((row, index) => lastRowByFile.set(row.sourceFile, index));
  const output: BatchResultRow[] = [];
  const report = (completedRows: number) => onProgress?.({
    completedRows,
    totalRows: rows.length,
    completedFiles: files.filter((file) => (lastRowByFile.get(file) ?? Infinity) < completedRows).length,
    totalFiles: files.length,
  });
  report(0);
  for (let start = 0; start < rows.length; start += safeChunkSize) {
    const end = Math.min(start + safeChunkSize, rows.length);
    output.push(...runBatch(rows.slice(start, end), base, fluidLibrary, purpose));
    report(end);
    if (end < rows.length) await yieldControl();
  }
  return output;
}

export function batchResultsCsv(results: BatchResultRow[], atmosphericPressurePaA: number): string {
  const headers = ['Row', 'Source file', 'Source sheet', 'Line no.', 'Status', ...batchTemplateHeaders.map((header) => `Input: ${header}`), 'Resolved service', 'Input-ID velocity m/s', 'Preliminary NPS', 'Preliminary ID mm', 'Preliminary-NPS velocity m/s', 'Outlet kg/cm2(g)', 'Loss kg/cm2', 'Regime', 'Reason'];
  const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = results.map((row) => [row.rowNumber, row.sourceFile, row.sourceSheet, row.lineNo, row.status, ...batchTemplateHeaders.map((header) => row.inputValues[header] ?? ''), row.service, row.inputIdVelocityMS?.toFixed(2), row.recommendedNps, row.recommendedIdMm?.toFixed(2), row.preliminaryNpsVelocityMS?.toFixed(2), row.result ? absolutePaToKgCm2G(row.result.outletPressurePaA, atmosphericPressurePaA).toFixed(2) : '', row.result ? paToKgCm2(row.result.totalPressureLossPa).toFixed(2) : '', row.result?.segments[0].flowRegime ?? '', row.reason]);
  return [headers, ...rows].map((row) => row.map(quote).join(',')).join('\n');
}
