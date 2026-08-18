import { jsPDF } from 'jspdf';
import type { CalculationResult, Project } from './types';
import { absolutePaToKgCm2G, paToKgCm2 } from './engine/units';

function download(content: BlobPart, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

export function exportJson(project: Project): void {
  download(JSON.stringify(project, null, 2), 'application/json', `${safeName(project.title)}.json`);
}

export function exportCsv(project: Project, result: CalculationResult): void {
  const headers = ['Segment', 'Role', 'Gas mass flow kg/h', 'Gas inlet density kg/m3', 'Gas outlet density kg/m3', 'Gas inlet actual flow m3/h', 'Gas outlet actual flow m3/h', 'Liquid holdup', 'Junction mass-flow change kg/h', 'Required outlet kg/cm2(g)', 'Inlet kg/cm2(g)', 'Outlet kg/cm2(g)', 'Velocity m/s', 'Gradient kg/cm2/km', 'rho*v2 Pa', 'Reynolds', 'Regime', 'Friction kg/cm2', 'Static kg/cm2', 'Acceleration kg/cm2', 'Minor kg/cm2', 'Total kg/cm2'];
  const rows = result.segments.map((r) => { const segment = project.segments.find((s) => s.id === r.segmentId); return [r.name, segment?.role, r.gasMassFlowKgS === undefined ? '' : r.gasMassFlowKgS * 3600, r.gasInletDensityKgM3 ?? '', r.gasOutletDensityKgM3 ?? '', r.gasInletActualFlowM3S === undefined ? '' : r.gasInletActualFlowM3S * 3600, r.gasOutletActualFlowM3S === undefined ? '' : r.gasOutletActualFlowM3S * 3600, r.liquidHoldup ?? '', segment?.massFlowChangeKgS === undefined ? '' : segment.massFlowChangeKgS * 3600, segment?.requiredOutletPressurePaA === undefined ? '' : absolutePaToKgCm2G(segment.requiredOutletPressurePaA, project.atmosphericPressurePaA), absolutePaToKgCm2G(r.inletPressurePaA, project.atmosphericPressurePaA), absolutePaToKgCm2G(r.outletPressurePaA, project.atmosphericPressurePaA), r.velocityMS, r.pressureGradientKgCm2Km, r.momentumPressurePa, r.reynolds, r.flowRegime, paToKgCm2(r.frictionLossPa), paToKgCm2(r.staticLossPa), paToKgCm2(r.accelerationLossPa), paToKgCm2(r.minorLossPa), paToKgCm2(r.totalLossPa)]; });
  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  download(csv, 'text/csv;charset=utf-8', `${safeName(project.title)}-results.csv`);
}

export function exportPdf(project: Project, result: CalculationResult): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const line = (text: string, y: number, size = 10) => { doc.setFontSize(size); doc.text(text, 15, y); };
  doc.setFillColor(13, 38, 48); doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); line('FlowSure | Hydraulic Calculation Report', 14, 16); line(`${project.caseNumber}  •  Version ${project.appVersion}`, 23, 9);
  doc.setTextColor(25); doc.setFont('helvetica', 'normal');
  line(`Project: ${project.title}`, 40); line(`Engineer: ${project.engineer || 'Not recorded'}    Date: ${project.date}`, 47);
  line(`Flow model: ${project.flowType}    Method: ${result.method}`, 54); line(`Fluid: ${project.fluid.name}`, 61);
  if (project.flowType === 'gas') line(`Gas flow input: ${project.gasFlowInputBasis === 'mass' ? `${(project.massFlowKgS * 3600).toFixed(2)} kg/h` : `${(project.gasFlowM3S * 3600).toFixed(2)} actual m3/h`}`, 68, 8);
  line(`Design basis: ${project.designBasis}    Case: ${project.operatingCase}    Service: ${project.serviceType}`, 75, 8);
  line(`Property source: ${project.fluid.source}`, project.flowType === 'gas' ? 72 : 68, 8);
  doc.setFont('helvetica', 'bold'); line('Summary', 84, 12); doc.setFont('helvetica', 'normal');
  const summaryPressure = paToKgCm2(result.totalPressureLossPa);
  line(`${summaryPressure < 0 ? 'Net pressure gain' : 'Total pressure loss'}: ${Math.abs(summaryPressure).toFixed(2)} kg/cm2`, 88);
  line(`Calculated outlet pressure: ${absolutePaToKgCm2G(result.outletPressurePaA, project.atmosphericPressurePaA).toFixed(2)} kg/cm2(g)`, 95);
  if (result.npshaM !== undefined) line(`NPSHa: ${result.npshaM.toFixed(2)} m    Margin: ${result.npshMarginM?.toFixed(2)} m`, 102);
  let y = 114;
  doc.setFont('helvetica', 'bold'); line('Segment results', y, 12); y += 7; doc.setFontSize(7);
  doc.text('Segment', 15, y); doc.text('In kg/cm2(g)', 68, y); doc.text('Out kg/cm2(g)', 92, y); doc.text('Velocity', 119, y); doc.text('Regime', 143, y); doc.text('Loss kg/cm2', 177, y); y += 4;
  for (const r of result.segments) {
    if (y > 272) { doc.addPage(); y = 20; }
    doc.text(r.name.slice(0, 30), 15, y); doc.text(absolutePaToKgCm2G(r.inletPressurePaA, project.atmosphericPressurePaA).toFixed(2), 68, y); doc.text(absolutePaToKgCm2G(r.outletPressurePaA, project.atmosphericPressurePaA).toFixed(2), 92, y); doc.text(r.velocityMS.toFixed(2), 119, y); doc.text(r.flowRegime, 143, y); doc.text(paToKgCm2(r.totalLossPa).toFixed(2), 177, y); y += 5;
  }
  y += 4; doc.setFont('helvetica', 'bold'); doc.setFontSize(11); line('Warnings and assumptions', y, 11); y += 7; doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  const notes = result.warnings.length ? result.warnings.map((w) => `[${w.severity.toUpperCase()}] ${w.message}`) : ['No automatic warning was triggered.'];
  notes.push('Fluid properties are user-selected/user-entered and must be independently verified.', 'CLASS 3 ESTIMATE SUPPORT: This report improves piping inputs used in Class 3 cost estimates. It is not a Class 3 estimate and requires verification against approved project data, applicable design criteria and formal engineering review.', 'SCREENING AND VERIFICATION ONLY — NOT FINAL DESIGN CERTIFICATION.');
  for (const note of notes) {
    const wrapped = doc.splitTextToSize(note, 178);
    if (y + wrapped.length * 4 > 282) { doc.addPage(); y = 20; }
    doc.text(wrapped, 15, y); y += wrapped.length * 4 + 2;
  }
  doc.save(`${safeName(project.title)}-report.pdf`);
}

function safeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'hydraulic-calculation';
}
