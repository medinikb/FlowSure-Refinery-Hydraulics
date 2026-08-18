import { describe, expect, it } from 'vitest';
import { defaultProject } from '../defaults';
import fluids from '../data/fluids.json';
import type { FluidProperties } from '../types';
import { BATCH_MAX_ROWS, batchResultsCsv, batchTemplateXlsx, parseBatchCsv, runBatch, runBatchInChunks } from './batch';
import { read, utils, write } from 'xlsx';
import { parseBatchWorkbook } from './batch';
import { batchResultsXlsx } from './batchReport';

describe('batch hydraulic review', () => {
  it('maps a valid CSV row and calculates it locally', () => {
    const rows = parseBatchCsv('line_no,flow_type,fluid_id,inlet_pressure_kgcm2g,temperature_c,liquid_flow_m3h,length_m,id_mm,roughness_mm,elevation_m,loss_k\nL-100,liquid,water-20c,5,20,50,100,100,0.045,0,1');
    const results = runBatch(rows, structuredClone(defaultProject), fluids.fluids as FluidProperties[]);
    expect(results[0].status).not.toBe('INCOMPLETE'); expect(results[0].result?.totalPressureLossPa).toBeGreaterThan(0);
    expect(results[0].recommendedNps).toBeDefined();
    expect(results[0].result?.segments[0].velocityMS).toBeGreaterThan(0);
    expect(results[0].inputValues.roughness_mm).toBe('0.045');
    expect(batchResultsCsv(results, defaultProject.atmosphericPressurePaA)).toContain('Input: roughness_mm');
  });
  it('does not guess incomplete hydraulic data', () => {
    const rows = parseBatchCsv('line_no,flow_type\nL-101,liquid');
    expect(runBatch(rows, structuredClone(defaultProject), fluids.fluids as FluidProperties[])[0].status).toBe('INCOMPLETE');
  });
  it('returns a preliminary NPS when a row requests pipe-size screening', () => {
    const rows = parseBatchCsv('line_no,flow_type,fluid_id,inlet_pressure_kgcm2g,temperature_c,liquid_flow_m3h,length_m,roughness_mm,required_outlet_pressure_kgcm2g,calculation_mode\nL-103,liquid,water-20c,5,20,50,100,0.045,0,size');
    const result = runBatch(rows, structuredClone(defaultProject), fluids.fluids as FluidProperties[])[0];
    expect(result.recommendedNps).toBeDefined(); expect(result.reason).toContain('pipe size');
    expect(result.reason).not.toContain('NPSH requires');
  });
  it('automatically sizes a row when id_mm is blank, even when mode says check', () => {
    const rows = parseBatchCsv('line_no,flow_type,fluid_id,inlet_pressure_kgcm2g,temperature_c,liquid_flow_m3h,length_m,roughness_mm,required_outlet_pressure_kgcm2g,calculation_mode\nL-104,liquid,water-20c,5,20,50,100,0.045,1,check');
    const result = runBatch(rows, structuredClone(defaultProject), fluids.fluids as FluidProperties[])[0];
    expect(result.status).not.toBe('INCOMPLETE');
    expect(result.recommendedNps).toBeDefined();
    expect(result.reason).toContain('automatically treated this row as a pipe-size screen');
  });
  it('warns when an entered ID is smaller than the preliminary screened size', () => {
    const rows = parseBatchCsv('line_no,flow_type,service,fluid_id,inlet_pressure_kgcm2g,temperature_c,liquid_flow_m3h,length_m,id_mm,roughness_mm,elevation_m,loss_k,required_outlet_pressure_kgcm2g,calculation_mode\nL-001,liquid,general-liquid,water-20c,5,20,5000,100,10,0.045,0,1,1,size');
    const result = runBatch(rows, structuredClone(defaultProject), fluids.fluids as FluidProperties[])[0];
    expect(result.status).toBe('WARNING');
    expect(result.recommendedNps).toBeDefined();
    expect(result.reason).toContain('Entered ID 10.00 mm is hydraulically insufficient');
    expect(result.result?.segments[0].velocityMS).toBeGreaterThan(1000);
    expect(result.inputIdVelocityMS).toBeGreaterThan(1000);
    expect(result.preliminaryNpsVelocityMS).toBeGreaterThan(0);
    expect(result.preliminaryNpsVelocityMS).toBeLessThan(result.inputIdVelocityMS!);
    const exported = batchResultsCsv([result], defaultProject.atmosphericPressurePaA);
    expect(exported).toContain('Input-ID velocity m/s');
    expect(exported).toContain('Preliminary-NPS velocity m/s');
  });
  it('limits import rows to the stated batch capacity', () => {
    const body = Array.from({ length: BATCH_MAX_ROWS + 2 }, (_, index) => `L-${index},liquid`).join('\n');
    expect(parseBatchCsv(`line_no,flow_type\n${body}`)).toHaveLength(BATCH_MAX_ROWS);
  });
  it('reports incremental row and file progress while preserving batch results', async () => {
    const rows = parseBatchCsv('line_no,flow_type,fluid_id,inlet_pressure_kgcm2g,temperature_c,liquid_flow_m3h,length_m,id_mm,roughness_mm\nL-1,liquid,water-20c,5,20,50,100,100,0.045\nL-2,liquid,water-20c,5,20,60,100,100,0.045', 'Cases.xlsx');
    const progress: number[] = [];
    const results = await runBatchInChunks(rows, structuredClone(defaultProject), fluids.fluids as FluidProperties[], 'check', (update) => progress.push(update.completedRows), 1, async () => {});
    expect(progress).toEqual([0, 1, 2]);
    expect(results).toEqual(runBatch(rows, structuredClone(defaultProject), fluids.fluids as FluidProperties[]));
  });
  it('reads the first populated Excel worksheet', () => {
    const workbook = utils.book_new(); const sheet = utils.aoa_to_sheet([['line_no', 'flow_type', 'fluid_id', 'inlet_pressure_kgcm2g', 'temperature_c', 'liquid_flow_m3h', 'length_m', 'id_mm', 'roughness_mm'], ['L-102', 'liquid', 'water-20c', 5, 20, 50, 100, 100, 0.045]]); utils.book_append_sheet(workbook, sheet, 'Lines');
    const imported = parseBatchWorkbook(write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer, 'Cases.xlsx');
    expect(imported[0].values.line_no).toBe('L-102'); expect(imported[0].sourceFile).toBe('Cases.xlsx'); expect(imported[0].sourceSheet).toBe('Lines');
    expect(parseBatchWorkbook(write(workbook, { type: 'array', bookType: 'biff8' }) as ArrayBuffer)[0].values.line_no).toBe('L-102');
  });
  it('provides ten ready-to-run cases in the Excel template', () => {
    const template = batchTemplateXlsx();
    const workbook = read(template, { type: 'array', cellStyles: true });
    expect(workbook.SheetNames).toEqual(['Input_Lines', 'Instructions', 'Allowed_Values']);
    expect(workbook.Sheets.Input_Lines['!autofilter']?.ref).toBe('A1:P11');
    expect(workbook.Sheets.Instructions['!merges']).toHaveLength(1);
    expect(parseBatchWorkbook(template).map((row) => row.values.line_no)).toHaveLength(10);
  });
  it('creates an executive hydraulic workbook with register and review sheets', async () => {
    const rows = parseBatchCsv('line_no,flow_type,service,fluid_id,inlet_pressure_kgcm2g,temperature_c,liquid_flow_m3h,length_m,id_mm,roughness_mm,elevation_m,loss_k,required_outlet_pressure_kgcm2g,calculation_mode\nL-RPT,liquid,general-liquid,water-20c,5,20,50,100,100,0.045,0,1,1,check', 'Report.xlsx');
    const results = runBatch(rows, structuredClone(defaultProject), fluids.fluids as FluidProperties[]);
    const bytes = await batchResultsXlsx(results, defaultProject);
    const ExcelJS = await import('exceljs'); const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Executive_Summary', 'Calculation_Register', 'Engineering_Exceptions', 'Input_Errors', 'Calculation_Register_Guide', 'Assumptions', 'Calculation_Basis', 'Revision_Information', 'Engineering_Action_Tracker']);
    expect(workbook.getWorksheet('Calculation_Register')?.getCell('A1').value).toBe('Sl. No.');
    expect(workbook.getWorksheet('Calculation_Register')?.getCell('A2').value).toBe(1);
    expect(workbook.getWorksheet('Calculation_Register')?.getCell('D2').value).toBe('L-RPT');
    expect(workbook.getWorksheet('Executive_Summary')?.getCell('A1').value).toBe('FEED BATCH HYDRAULIC CALCULATION REGISTER');
    expect(workbook.getWorksheet('Executive_Summary')?.getCell('A23').value).toBe('EXECUTIVE ENGINEERING REVIEW QUEUE — TOP 25');
  });
});
