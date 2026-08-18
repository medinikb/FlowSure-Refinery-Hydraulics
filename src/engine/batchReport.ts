import type { Project } from '../types';
import type { BatchResultRow, BatchStatus } from './batch';
import { absolutePaToKgCm2G, paToKgCm2 } from './units';

const COLORS = {
  navy: '0B2545', blue: '1F4E78', teal: '147D7E', paleBlue: 'EAF1F7',
  pass: 'E4F3E7', passText: '079A55', warning: 'FFF3D2', warningText: 'D98500',
  fail: 'FCE8E8', failText: 'D9342B', incomplete: 'E9EEF5', incompleteText: '6D819C',
  border: 'D5DFEA', white: 'FFFFFF', text: '24364B',
};

const registerHeaders = [
  'Sl. No.', 'Source file', 'Source sheet', 'Line number', 'Status', 'Resolved service',
  'Flow type', 'Fluid ID', 'Calculation mode', 'Inlet pressure kg/cm²(g)', 'Temperature °C',
  'Liquid flow m³/h', 'Gas flow m³/h', 'Steam flow kg/h', 'Length m', 'Entered ID mm',
  'Roughness mm', 'Elevation m', 'Fittings K', 'Required outlet kg/cm²(g)',
  'Input-ID velocity m/s', 'Preliminary NPS', 'Preliminary ID mm',
  'Preliminary-NPS velocity m/s', 'Calculated outlet kg/cm²(g)', 'Total loss kg/cm²',
  'Pressure gradient kg/cm²/km', 'Reynolds number', 'Friction factor', 'Flow regime',
  'Friction loss kg/cm²', 'Static loss kg/cm²', 'Minor loss kg/cm²',
  'Acceleration loss kg/cm²', 'Momentum pressure Pa', 'Reason / review note',
];

function numberOrBlank(value?: string): number | null {
  if (value === undefined || value.trim() === '') return null;
  const number = Number(value); return Number.isFinite(number) ? number : null;
}

function rowValues(row: BatchResultRow, atmosphericPressurePaA: number, serialNumber: number): (string | number | null)[] {
  const input = row.inputValues; const segment = row.result?.segments[0];
  return [
    serialNumber, row.sourceFile, row.sourceSheet, row.lineNo, row.status, row.service ?? null,
    input.flow_type ?? null, input.fluid_id ?? null, input.id_mm ? input.calculation_mode || 'check' : 'auto-size',
    numberOrBlank(input.inlet_pressure_kgcm2g), numberOrBlank(input.temperature_c), numberOrBlank(input.liquid_flow_m3h),
    numberOrBlank(input.gas_flow_m3h), numberOrBlank(input.steam_flow_kgh), numberOrBlank(input.length_m),
    numberOrBlank(input.id_mm), numberOrBlank(input.roughness_mm), numberOrBlank(input.elevation_m), numberOrBlank(input.loss_k),
    numberOrBlank(input.required_outlet_pressure_kgcm2g), row.inputIdVelocityMS ?? null, row.recommendedNps ?? null,
    row.recommendedIdMm ?? null, row.preliminaryNpsVelocityMS ?? null,
    row.result ? absolutePaToKgCm2G(row.result.outletPressurePaA, atmosphericPressurePaA) : null,
    row.result ? paToKgCm2(row.result.totalPressureLossPa) : null, segment?.pressureGradientKgCm2Km ?? null,
    segment?.reynolds ?? null, segment?.frictionFactor ?? null, segment?.flowRegime ?? null,
    segment ? paToKgCm2(segment.frictionLossPa) : null, segment ? paToKgCm2(segment.staticLossPa) : null,
    segment ? paToKgCm2(segment.minorLossPa) : null, segment ? paToKgCm2(segment.accelerationLossPa) : null,
    segment?.momentumPressurePa ?? null, row.reason,
  ];
}

function statusColors(status: BatchStatus): { fill: string; font: string } {
  if (status === 'PASS') return { fill: COLORS.pass, font: COLORS.passText };
  if (status === 'WARNING') return { fill: COLORS.warning, font: COLORS.warningText };
  if (status === 'FAIL') return { fill: COLORS.fail, font: COLORS.failText };
  return { fill: COLORS.incomplete, font: COLORS.incompleteText };
}

export async function batchResultsXlsx(results: BatchResultRow[], project: Pick<Project, 'title' | 'atmosphericPressurePaA'>): Promise<ArrayBuffer> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FlowSure'; workbook.company = 'FlowSure'; workbook.created = new Date();
  workbook.subject = 'FEED batch hydraulic assessment'; workbook.title = 'FlowSure Batch Hydraulic Calculation Register';
  const statuses: BatchStatus[] = ['PASS', 'WARNING', 'FAIL', 'INCOMPLETE'];
  const counts = Object.fromEntries(statuses.map((status) => [status, results.filter((row) => row.status === status).length])) as Record<BatchStatus, number>;
  const sourceFiles = [...new Set(results.map((row) => row.sourceFile))];
  const reviewRows = results.filter((row) => row.status !== 'PASS');
  const reviewPriority: Record<BatchStatus, number> = { FAIL: 0, INCOMPLETE: 1, WARNING: 2, PASS: 3 };
  const executiveReviewRows = reviewRows
    .map((row, sourceIndex) => ({ row, sourceIndex }))
    .sort((a, b) => reviewPriority[a.row.status] - reviewPriority[b.row.status] || a.sourceIndex - b.sourceIndex)
    .slice(0, 25)
    .map(({ row }) => row);
  const reviewRate = results.length ? reviewRows.length / results.length : 0;
  const thinBorder = { style: 'thin' as const, color: { argb: COLORS.border } };
  const border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
  const titleBand = (sheet: any, title: string, subtitle: string, endColumn: string) => {
    sheet.mergeCells(`A1:${endColumn}2`); sheet.getCell('A1').value = title;
    sheet.getCell('A1').font = { bold: true, color: { argb: COLORS.white }, size: 20 };
    sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
    sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.mergeCells(`A3:${endColumn}3`); sheet.getCell('A3').value = subtitle;
    sheet.getCell('A3').font = { italic: true, color: { argb: COLORS.white }, size: 10 };
    sheet.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.blue } };
  };
  const styleHeader = (row: any, color = COLORS.navy) => {
    row.height = 34; row.eachCell((cell: any) => {
      cell.font = { bold: true, color: { argb: COLORS.white }, size: 9 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; cell.border = border;
    });
  };

  const executive = workbook.addWorksheet('Executive_Summary', { views: [{ showGridLines: false }] });
  titleBand(executive, 'FEED BATCH HYDRAULIC CALCULATION REGISTER', 'Executive control dashboard | preliminary pressure-drop and pipe-size screening', 'M');
  executive.mergeCells('A5:D5'); executive.getCell('A5').value = 'PROJECT'; executive.mergeCells('E5:H5'); executive.getCell('E5').value = 'CALCULATION BASIS'; executive.mergeCells('I5:K5'); executive.getCell('I5').value = 'GENERATED'; executive.mergeCells('L5:M5'); executive.getCell('L5').value = 'SOURCE FILES';
  executive.mergeCells('A6:D6'); executive.getCell('A6').value = project.title || 'FlowSure batch assessment'; executive.mergeCells('E6:H6'); executive.getCell('E6').value = 'FlowSure steady-state hydraulic screening'; executive.mergeCells('I6:K6'); executive.getCell('I6').value = new Date(); executive.getCell('I6').numFmt = 'dd-mmm-yyyy hh:mm'; executive.mergeCells('L6:M6'); executive.getCell('L6').value = sourceFiles.length;
  executive.getRow(5).eachCell((cell) => { cell.font = { bold: true, color: { argb: '5F7187' }, size: 9 }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.paleBlue } }; });
  executive.getRow(6).eachCell((cell) => { cell.font = { bold: true, color: { argb: COLORS.text }, size: 11 }; });
  const cards = [
    ['A8:C8', 'A9:C12', 'TOTAL LINES', results.length, COLORS.paleBlue, 'Calculation records assessed'],
    ['D8:F8', 'D9:F12', 'PASS', counts.PASS, COLORS.pass, 'Accepted without immediate action'],
    ['G8:I8', 'G9:I12', 'WARNING', counts.WARNING, COLORS.warning, 'Engineering review required'],
    ['J8:K8', 'J9:K12', 'FAIL', counts.FAIL, COLORS.fail, 'Hold until resolved'],
    ['L8:M8', 'L9:M12', 'REVIEW RATE', reviewRate, 'FBEDE7', 'Warning + fail + incomplete'],
  ] as const;
  cards.forEach(([labelRange, valueRange, label, value, fill, note]) => {
    executive.mergeCells(labelRange); executive.mergeCells(valueRange); const labelCell = executive.getCell(labelRange.split(':')[0]); const valueCell = executive.getCell(valueRange.split(':')[0]);
    labelCell.value = label; labelCell.font = { bold: true, color: { argb: '5F7187' }, size: 9 }; labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
    valueCell.value = value; valueCell.font = { bold: true, color: { argb: COLORS.text }, size: 22 }; valueCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }; valueCell.border = border;
    if (label === 'REVIEW RATE') valueCell.numFmt = '0%'; valueCell.note = note;
  });
  executive.mergeCells('A14:F14'); executive.getCell('A14').value = 'STATUS DISTRIBUTION'; executive.mergeCells('G14:M14'); executive.getCell('G14').value = 'SOURCE-FILE REVIEW PROFILE';
  ['A14', 'G14'].forEach((address) => { const cell = executive.getCell(address); cell.font = { bold: true, color: { argb: COLORS.white } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.blue } }; });
  executive.addRow([]); const statusHeader = executive.getRow(16); statusHeader.values = ['Status', 'Lines', '% of total']; styleHeader(statusHeader, COLORS.teal);
  statuses.forEach((status) => { const row = executive.addRow([status, counts[status], results.length ? counts[status] / results.length : 0]); row.getCell(3).numFmt = '0.0%'; const tone = statusColors(status); row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tone.fill } }; row.getCell(1).font = { bold: true, color: { argb: tone.font } }; });
  const sourceStart = 16; ['Source file', 'Total', 'Pass', 'Warning', 'Fail', 'Incomplete'].forEach((value, index) => executive.getCell(sourceStart, 7 + index).value = value); styleHeader(executive.getRow(sourceStart), COLORS.teal);
  sourceFiles.slice(0, 12).forEach((file, index) => { const fileRows = results.filter((row) => row.sourceFile === file); const values = [file, fileRows.length, ...statuses.map((status) => fileRows.filter((row) => row.status === status).length)]; values.forEach((value, column) => executive.getCell(sourceStart + 1 + index, 7 + column).value = value); });
  const queueStart = Math.max(23, sourceStart + sourceFiles.slice(0, 12).length + 2); executive.mergeCells(`A${queueStart}:M${queueStart}`); executive.getCell(`A${queueStart}`).value = 'EXECUTIVE ENGINEERING REVIEW QUEUE — TOP 25'; executive.getCell(`A${queueStart}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.blue } }; executive.getCell(`A${queueStart}`).font = { bold: true, color: { argb: COLORS.white } };
  const queueHeader = executive.getRow(queueStart + 1); queueHeader.values = ['Priority', 'Source file', 'Line number', 'Service', 'Status', 'Input ID mm', 'Preliminary NPS', 'Input velocity m/s', 'Prelim. velocity m/s', 'Required management action']; styleHeader(queueHeader, COLORS.teal); executive.mergeCells(`J${queueStart + 1}:M${queueStart + 1}`);
  executiveReviewRows.forEach((item, index) => { const rowNumber = queueStart + 2 + index; const priority = item.status === 'FAIL' ? 'CRITICAL' : item.status === 'INCOMPLETE' ? 'HIGH' : 'REVIEW'; const values = [priority, item.sourceFile, item.lineNo, item.service ?? null, item.status, numberOrBlank(item.inputValues.id_mm), item.recommendedNps ?? null, item.inputIdVelocityMS ?? null, item.preliminaryNpsVelocityMS ?? null, item.reason]; values.forEach((value, column) => executive.getCell(rowNumber, column + 1).value = value); executive.mergeCells(`J${rowNumber}:M${rowNumber}`); executive.getRow(rowNumber).height = 34; executive.getCell(rowNumber, 10).alignment = { wrapText: true, vertical: 'top' }; const tone = statusColors(item.status); executive.getCell(rowNumber, 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tone.fill } }; executive.getCell(rowNumber, 5).font = { bold: true, color: { argb: tone.font } }; });
  executive.columns = Array.from({ length: 13 }, (_, index) => ({ width: index === 1 || index === 9 ? 22 : 14 })); executive.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  const register = workbook.addWorksheet('Calculation_Register', { views: [{ state: 'frozen', ySplit: 1, xSplit: 5, showGridLines: false }] });
  register.addRow(registerHeaders); styleHeader(register.getRow(1));
  results.forEach((item, index) => { const row = register.addRow(rowValues(item, project.atmosphericPressurePaA, index + 1)); row.height = 28; row.eachCell((cell) => { cell.border = border; cell.alignment = { vertical: 'top', wrapText: Number(cell.col) === registerHeaders.length }; }); const tone = statusColors(item.status); row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tone.fill } }; row.getCell(5).font = { bold: true, color: { argb: tone.font } }; });
  register.autoFilter = { from: 'A1', to: `${register.getColumn(registerHeaders.length).letter}${Math.max(1, results.length + 1)}` };
  register.columns.forEach((column, index) => { column.width = index === registerHeaders.length - 1 ? 60 : index < 9 ? 18 : 15; });
  for (let column = 10; column <= 35; column += 1) register.getColumn(column).numFmt = column === 28 ? '#,##0' : '0.00'; register.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  const addFilteredRegister = (name: string, filteredRows: BatchResultRow[]) => { const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, xSplit: 5, showGridLines: false }] }); sheet.addRow(registerHeaders); styleHeader(sheet.getRow(1)); filteredRows.forEach((item, index) => { const row = sheet.addRow(rowValues(item, project.atmosphericPressurePaA, index + 1)); row.height = 30; row.eachCell((cell) => { cell.border = border; cell.alignment = { vertical: 'top', wrapText: Number(cell.col) === registerHeaders.length }; }); const tone = statusColors(item.status); row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tone.fill } }; row.getCell(5).font = { bold: true, color: { argb: tone.font } }; }); sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(registerHeaders.length).letter}${Math.max(1, filteredRows.length + 1)}` }; sheet.columns.forEach((column, index) => { column.width = index === registerHeaders.length - 1 ? 60 : index < 9 ? 18 : 15; }); return sheet; };
  addFilteredRegister('Engineering_Exceptions', reviewRows);
  addFilteredRegister('Input_Errors', results.filter((row) => row.status === 'INCOMPLETE'));

  const guide = workbook.addWorksheet('Calculation_Register_Guide', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] }); titleBand(guide, 'CALCULATION REGISTER GUIDE', 'Hydraulic register field definitions for review and audit', 'E');
  guide.addRow(['Section', 'Column', 'Meaning', 'Formula / basis', 'Unit / example']); styleHeader(guide.getRow(4));
  const guideRows = [
    ['Traceability', 'Source file / sheet / line', 'Identifies the uploaded record.', 'Imported without calculation.', 'Text'],
    ['Decision', 'Status', 'Overall screening disposition.', 'PASS, WARNING, FAIL or INCOMPLETE.', 'Status'],
    ['Hydraulic input', 'Entered ID mm', 'Internal diameter entered by the user.', 'Direct input.', 'mm'],
    ['Sizing output', 'Preliminary NPS / ID', 'Smallest standard screening candidate meeting configured criteria.', 'FlowSure pipe-size library and service criteria.', 'NPS / mm'],
    ['Velocity', 'Input-ID velocity', 'Velocity calculated using the entered internal diameter.', 'V = Q / A.', 'm/s'],
    ['Velocity', 'Preliminary-NPS velocity', 'Velocity for the recommended screening diameter.', 'V = Q / A.', 'm/s'],
    ['Pressure', 'Calculated outlet', 'Predicted downstream gauge pressure.', 'Inlet pressure less friction, static, minor and acceleration losses.', 'kg/cm²(g)'],
    ['Pressure', 'Total loss', 'Total calculated pressure loss.', 'Darcy–Weisbach/compressible/two-phase model as applicable.', 'kg/cm²'],
    ['Friction', 'Reynolds / friction factor', 'Flow-regime and resistance indicators.', 'Colebrook–White or laminar relation.', 'Dimensionless'],
    ['Review', 'Reason / review note', 'Engineering warnings, limitations and recommended action.', 'Generated from validation and service criteria.', 'Text'],
  ]; guide.addRows(guideRows); guide.columns = [{ width: 22 }, { width: 28 }, { width: 58 }, { width: 62 }, { width: 24 }]; guide.eachRow((row, number) => { if (number > 4) { row.height = 38; row.eachCell((cell) => { cell.alignment = { vertical: 'top', wrapText: true }; cell.border = border; }); row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.paleBlue } }; row.getCell(1).font = { bold: true, color: { argb: COLORS.blue } }; } });

  const simpleSheet = (name: string, title: string, rows: (string | number)[][]) => { const sheet = workbook.addWorksheet(name, { views: [{ showGridLines: false }] }); titleBand(sheet, title, 'FlowSure FEED hydraulic screening report', 'B'); sheet.addRow(['Topic', 'Basis / information']); styleHeader(sheet.getRow(4)); sheet.addRows(rows); sheet.columns = [{ width: 34 }, { width: 110 }]; sheet.eachRow((row, number) => { if (number > 4) { row.height = 38; row.eachCell((cell) => { cell.alignment = { vertical: 'top', wrapText: true }; cell.border = border; }); } }); return sheet; };
  simpleSheet('Assumptions', 'ASSUMPTIONS AND LIMITATIONS', [
    ['Steady state', 'Each row represents one independent steady hydraulic path. Branching networks and transients are not solved.'],
    ['Properties', 'Entered or library fluid properties are held according to the selected FlowSure model; confirm approved project/PVT data.'],
    ['Two-phase', 'Preliminary screen only; confirm phase behaviour, slugging and final size using validated specialist software.'],
    ['Pipe size', 'Preliminary NPS is a screening recommendation; confirm schedule, corrosion allowance and mechanical design separately.'],
    ['Use', 'Supports FEED/Class 3 estimate quality; it is not final design certification.'],
  ]);
  simpleSheet('Calculation_Basis', 'CALCULATION BASIS', [
    ['Liquid', 'Darcy–Weisbach pressure loss with Colebrook–White friction factor, static head and minor-loss K.'],
    ['Gas / vapour', 'Segment-wise compressible pressure iteration with pressure-dependent density and Mach screening.'],
    ['Steam', 'IAPWS-IF97 properties with applicable NREP Design Basis D4 velocity/momentum screening.'],
    ['Gas–liquid', 'Preliminary separated/empirical two-phase screening with holdup, friction, static and acceleration components.'],
    ['Sizing', 'Standard hydraulic IDs are tested from small to large against outlet-pressure and service-specific criteria.'],
  ]);
  simpleSheet('Revision_Information', 'REVISION INFORMATION', [
    ['Report', 'FlowSure FEED Batch Hydraulic Calculation Register'], ['Engine version', '0.1.0'], ['Generated', new Date().toISOString()], ['Rows assessed', results.length], ['Source files', sourceFiles.length],
  ]);
  const tracker = workbook.addWorksheet('Engineering_Action_Tracker', { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] });
  const trackerHeaders = ['Priority', 'Source file', 'Line number', 'Service', 'Status', 'Entered ID mm', 'Preliminary NPS', 'Reason / required action', 'Owner', 'Target date', 'Action status', 'Close-out note']; tracker.addRow(trackerHeaders); styleHeader(tracker.getRow(1), COLORS.teal);
  reviewRows.forEach((item) => tracker.addRow([item.status === 'FAIL' ? 'CRITICAL' : 'HIGH', item.sourceFile, item.lineNo, item.service ?? null, item.status, numberOrBlank(item.inputValues.id_mm), item.recommendedNps ?? null, item.reason, null, null, 'OPEN', null])); tracker.columns = trackerHeaders.map((header) => ({ width: header.includes('Reason') ? 65 : 18 })); tracker.autoFilter = { from: 'A1', to: `L${Math.max(1, reviewRows.length + 1)}` };
  tracker.eachRow((row, number) => { if (number > 1) { row.height = 34; row.eachCell((cell) => { cell.border = border; cell.alignment = { vertical: 'top', wrapText: Number(cell.col) === 8 || Number(cell.col) === 12 }; }); } });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}
