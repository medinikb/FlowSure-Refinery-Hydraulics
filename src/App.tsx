import { useEffect, useMemo, useRef, useState } from "react";
import "./methods.css";
import "./math.css";
import "./summary.css";
import "./sizing.css";
import "./batch.css";
import "./project-model.css";
import "./sidebar.css";
import "./learning.css";
import "./review.css";
import "./hero-redesign.css";
import refineryPipelineHero from "./assets/refinery-pipeline-hero.png";
import fluids from "./data/fluids.json";
import { calculateProject } from "./engine/calculate";
import { batchResultsXlsx } from "./engine/batchReport";
import { projectForFutureCase } from "./engine/futureCase";
import { sizePipe, type PipeSizingResult } from "./engine/sizing";
import {
  BATCH_MAX_ROWS,
  batchResultsCsv,
  batchTemplateHeaders,
  parseBatchCsv,
  parseBatchWorkbook,
  runBatch,
  runBatchInChunks,
  type BatchInputRow,
  type BatchPurpose,
  type BatchResultRow,
} from "./engine/batch";
import {
  absolutePaToKgCm2G,
  kgCm2GToAbsolutePa,
  paToKgCm2,
  units,
} from "./engine/units";
import { validateProject } from "./engine/validation";
import {
  DEFAULT_ELEVATION_CHANGE_M,
  DEFAULT_PIPE_ROUGHNESS_M,
  defaultProject,
} from "./defaults";
import { exportCsv, exportPdf } from "./exporters";
import { clearProject, loadProject, saveProject } from "./storage";
import {
  loadCustomFluidLibrary,
  modelForFluid,
  saveCustomFluidLibrary,
  validateFluidLibrary,
} from "./fluidLibrary";
import type {
  CalculationResult,
  DesignBasis,
  FlowType,
  FluidProperties,
  OperatingCase,
  Project,
  Segment,
  SegmentRole,
  ServiceType,
} from "./types";

function downloadBatchTemplate() {
  const link = document.createElement("a");
  link.href = new URL("flowsure-batch-template.bin", document.baseURI).href;
  link.download = "flowsure-batch-template.xlsx";
  link.click();
}

function UploadIcon() {
  return <span className="upload-icon" aria-hidden="true"><svg viewBox="0 0 88 80" fill="none"><defs><linearGradient id="upload-gradient" x1="8" y1="8" x2="80" y2="64" gradientUnits="userSpaceOnUse"><stop stopColor="#be35f5"/><stop offset="1" stopColor="#28b8d7"/></linearGradient></defs><path d="M30 57H19C10.7 57 4 50.3 4 42c0-7.6 5.7-14 13.2-14.9C19.8 17.3 28.3 10 39 10c11.3 0 20.6 8.1 22.5 18.9C70.8 29.2 78 36.8 78 46c0 9.4-7.6 17-17 17H50" stroke="url(#upload-gradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/><path d="M28 26h22l10 10v35a5 5 0 0 1-5 5H28a5 5 0 0 1-5-5V31a5 5 0 0 1 5-5Z" fill="white" stroke="url(#upload-gradient)" strokeWidth="4" strokeLinejoin="round"/><path d="M50 26v10h10M41.5 63V42M33.5 51l8-9 8 9" stroke="#6b62e8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg></span>;
}

function CompactBatchPage({
  project,
  fluidLibrary,
}: {
  project: Project;
  fluidLibrary: FluidProperties[];
}) {
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<BatchInputRow[]>([]);
  const [results, setResults] = useState<BatchResultRow[]>([]);
  const [showRegister, setShowRegister] = useState(false);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState(
    "No line list uploaded. Download the template or upload Excel/CSV files.",
  );
  const totals = results.reduce<Record<string, number>>(
    (a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }),
    {},
  );
  const total = results.length;
  const pct = (s: string) => (total ? ((totals[s] ?? 0) / total) * 100 : 0);
  const p = ["PASS", "WARNING", "FAIL", "INCOMPLETE"].map(pct);
  const donut = `conic-gradient(#14aa73 0 ${p[0]}%,#ed9600 ${p[0]}% ${p[0] + p[1]}%,#df3e35 ${p[0] + p[1]}% ${p[0] + p[1] + p[2]}%,#94a7c0 ${p[0] + p[1] + p[2]}% 100%)`;
  const displayed = results
    .filter((r) => !status || r.status === status)
    .slice(0, 50);
  const download = (
    content: BlobPart,
    file: string,
    type = "text/csv;charset=utf-8",
  ) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = file;
    a.click();
    URL.revokeObjectURL(url);
  };
  const template = `${batchTemplateHeaders.join(",")}\nL-001,liquid,general-liquid,water-20c,5,20,50,,,100,100,0.045,0,1,0,check\n`;
  async function upload(files?: FileList) {
    if (!files?.length) return;
    const added: BatchInputRow[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["csv", "xlsx", "xls"].includes(ext ?? "")) continue;
      added.push(
        ...(ext === "csv"
          ? parseBatchCsv(await file.text(), file.name)
          : parseBatchWorkbook(await file.arrayBuffer(), file.name)),
      );
    }
    const combined = [...rows, ...added].slice(0, BATCH_MAX_ROWS);
    setRows(combined);
    setResults([]);
    setMessage(`${added.length} rows added from ${files.length} file(s).`);
  }
  function calculate() {
    setResults(runBatch(rows, project, fluidLibrary));
    setStatus("");
    setMessage(`${rows.length} rows assessed locally.`);
  }
  const labels: [string, string][] = [
    ["PASS", "Pass"],
    ["WARNING", "Warning"],
    ["FAIL", "Fail"],
    ["INCOMPLETE", "Incomplete"],
  ];
  return (
    <main className="batch-page">
      <section className="batch-hero">
        <div>
          <div className="batch-kicker">
            <b>B</b>
            <span>
              <strong>FEED batch hydraulic assessment</strong>
              <small>
                Upload and evaluate up to {BATCH_MAX_ROWS} piping lines
              </small>
            </span>
          </div>
          <h1>Multi-line pressure-drop assessment</h1>
        </div>
        <span className="local-pill">Processed locally in your browser</span>
      </section>
      <section className="batch-workflow">
        <div className="batch-template-card">
          <div>
            <h2>Need the batch input format?</h2>
            <p>
              Use the Excel template, then upload one or more workbook or CSV
              files.
            </p>
          </div>
          <div className="batch-template-actions">
            <button
              onClick={downloadBatchTemplate}
            >
              Download Excel template ↓
            </button>
            <button
              onClick={() => download(template, "flowsure-batch-template.csv")}
            >
              CSV template
            </button>
          </div>
        </div>
        <div className="batch-dropzone" onClick={() => input.current?.click()}>
          <UploadIcon />
          <strong>Click to upload files</strong>
          <small>Multiple Excel (.xlsx, .xls) or CSV files accepted</small>
          <input
            hidden
            multiple
            ref={input}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => upload(e.target.files ?? undefined)}
          />
        </div>
        <p className="batch-upload-status">{message}</p>
      </section>
      {rows.length > 0 && (
        <section className="batch-card">
          <h2>2. Validate and calculate</h2>
          <p>
            {rows.length} rows are ready. Missing values remain incomplete; they
            are not guessed.
          </p>
          <button className="primary" onClick={calculate}>
            Run batch hydraulic review
          </button>
        </section>
      )}
      {total > 0 && (
        <>
          <section className="batch-results-card">
            <div className="batch-results-title">
              <h2>
                <b>4</b> Review batch results
              </h2>
              <button
                className="primary"
                onClick={() =>
                  download(
                    batchResultsCsv(results, project.atmosphericPressurePaA),
                    "flowsure-batch-results.csv",
                  )
                }
              >
                Download full register
              </button>
            </div>
            <div className="batch-analysis fixed">
              <div>
                <h3>Result distribution</h3>
                <div className="distribution">
                  <div
                    className="batch-donut large"
                    style={{ background: donut }}
                  >
                    <span>
                      {total}
                      <small>Total lines</small>
                    </span>
                  </div>
                  <ul>
                    {labels.map(([id, label]) => (
                      <li key={id}>
                        <b className={id.toLowerCase()} />
                        {label}
                        <span>
                          {totals[id] ?? 0} · {pct(id).toFixed(1)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="priority-actions">
                <h3>Priority actions</h3>
                {labels.slice(1).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setStatus(id);
                      setShowRegister(true);
                    }}
                  >
                    <span>
                      {label === "Fail"
                        ? "Failed lines to review"
                        : label === "Warning"
                          ? "Lines requiring engineering review"
                          : "Incomplete lines to complete"}
                    </span>
                    <b>{totals[id] ?? 0} ›</b>
                  </button>
                ))}
              </div>
            </div>
            <button
              className="register-toggle"
              onClick={() => setShowRegister(!showRegister)}
            >
              {showRegister
                ? "Hide Calculation Register"
                : "Show Calculation Register"}
            </button>
            {showRegister && (
              <div className="register-area">
                <div className="batch-register-controls">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">All statuses</option>
                    {labels.map(([id]) => (
                      <option key={id}>{id}</option>
                    ))}
                  </select>
                </div>
                <div className="table-wrap batch-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Source file</th>
                        <th>Sheet</th>
                        <th>Line</th>
                        <th>Status</th>
                        <th>Service</th>
                        <th>Preliminary NPS</th>
                        <th>Reason / review note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayed.map((r) => (
                        <tr
                          key={`${r.sourceFile}-${r.sourceSheet}-${r.rowNumber}`}
                          className={`batch-${r.status.toLowerCase()}`}
                        >
                          <td>{r.sourceFile}</td>
                          <td>{r.sourceSheet}</td>
                          <td>{r.lineNo}</td>
                          <td>{r.status}</td>
                          <td>{r.service ?? "—"}</td>
                          <td>{r.recommendedNps ?? "—"}</td>
                          <td>{r.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}
      <p className="batch-disclaimer">
        Batch results are screening outputs; final pipe sizing requires
        engineering review.
      </p>
    </main>
  );
}

function BatchPage({
  project,
  fluidLibrary,
}: {
  project: Project;
  fluidLibrary: FluidProperties[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const assessmentRef = useRef<HTMLElement>(null);
  const shouldScrollToAssessment = useRef(false);
  const [rows, setRows] = useState<BatchInputRow[]>([]);
  const [results, setResults] = useState<BatchResultRow[]>([]);
  const [message, setMessage] = useState(
    "No line list uploaded yet. Start with the template if you are unsure about the required information.",
  );
  const [purpose, setPurpose] = useState<BatchPurpose>("check");
  const [filter, setFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ completedRows: 0, totalRows: 0, completedFiles: 0, totalFiles: 0 });
  const [dragging, setDragging] = useState(false);
  const [showRegister, setShowRegister] = useState(true);
  const [isExportingBatch, setIsExportingBatch] = useState(false);
  const sourceFiles = [...new Set(rows.map((row) => row.sourceFile))];
  const totals = results.reduce<Record<string, number>>(
    (count, row) => ({ ...count, [row.status]: (count[row.status] ?? 0) + 1 }),
    {},
  );
  const filtered = results.filter(
    (row) =>
      `${row.lineNo} ${row.status} ${row.reason} ${row.sourceFile}`
        .toLowerCase()
        .includes(filter.toLowerCase()) &&
      (!sourceFilter || row.sourceFile === sourceFilter) &&
      (!statusFilter || row.status === statusFilter),
  );
  const visible = filtered.slice(page * 50, page * 50 + 50);
  const percent = (status: string) =>
    results.length
      ? (((totals[status] ?? 0) / results.length) * 100).toFixed(1)
      : "0.0";
  const download = (
    content: BlobPart,
    filename: string,
    type = "text/csv;charset=utf-8",
  ) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  async function upload(files?: FileList | File[]) {
    if (!files?.length || isCalculating) return;
    const imported: BatchInputRow[] = [];
    for (const file of Array.from(files)) {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (!["csv", "xlsx", "xls"].includes(extension ?? "")) continue;
      try {
        imported.push(
          ...(extension === "csv"
            ? parseBatchCsv(await file.text(), file.name)
            : parseBatchWorkbook(await file.arrayBuffer(), file.name)),
        );
      } catch {
        setMessage(
          `Could not read ${file.name}. Confirm it is a valid Excel workbook or CSV file.`,
        );
        return;
      }
    }
    const combined = [...rows, ...imported].slice(0, BATCH_MAX_ROWS);
    if (!imported.length) {
      setMessage(
        "No data rows found. Check each workbook sheet header and data.",
      );
      return;
    }
    setRows(combined);
    await calculateRows(combined, `${Array.from(files).length} uploaded file(s)`);
  }
  async function calculateRows(lines: BatchInputRow[], sourceDescription = `${sourceFiles.length} source file(s)`) {
    if (!lines.length || isCalculating) return;
    const start = performance.now();
    shouldScrollToAssessment.current = true;
    setIsCalculating(true);
    setResults([]);
    setDurationSeconds(0);
    setBatchProgress({ completedRows: 0, totalRows: lines.length, completedFiles: 0, totalFiles: new Set(lines.map((row) => row.sourceFile)).size });
    setPage(0);
    setStatusFilter("");
    setMessage(`Assessment started for ${lines.length.toLocaleString()} rows. Progress is shown below.`);
    // Allow React to paint the progress panel before the first calculation chunk starts.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    // Keep the zero-percent ring on screen for one frame before calculations begin.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const output = await runBatchInChunks(lines, project, fluidLibrary, purpose, (progress) => {
      setBatchProgress(progress);
      setDurationSeconds((performance.now() - start) / 1000);
    });
    setDurationSeconds((performance.now() - start) / 1000);
    setResults(output);
    setIsCalculating(false);
    setMessage(
      `${output.length.toLocaleString()} rows validated and assessed locally from ${sourceDescription}.`,
    );
  }
  function calculate() { void calculateRows(rows); }
  async function downloadExecutiveBatchReport() {
    if (isExportingBatch || !results.length) return;
    setIsExportingBatch(true);
    try {
      const workbook = await batchResultsXlsx(results, project);
      download(
        workbook,
        "flowsure-feed-hydraulic-calculation-register.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
    } finally {
      setIsExportingBatch(false);
    }
  }
  const donut = results.length
    ? `conic-gradient(#14aa73 0 ${percent("PASS")}%,#ed9600 ${percent("PASS")}% ${Number(percent("PASS")) + Number(percent("WARNING"))}%,#df3e35 ${Number(percent("PASS")) + Number(percent("WARNING"))}% 100%)`
    : "#dfe8f4";
  const batchCompletionPercent = batchProgress.totalRows
    ? (batchProgress.completedRows / batchProgress.totalRows) * 100
    : 0;
  const progressRingCircumference = 2 * Math.PI * 52;
  useEffect(() => {
    if (!isCalculating || !shouldScrollToAssessment.current) return;
    // The assessment panel is conditionally rendered. Scroll only after React
    // has mounted it, so a large upload always reveals the live progress ring.
    let secondFrame: number | undefined;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        assessmentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        shouldScrollToAssessment.current = false;
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) cancelAnimationFrame(secondFrame);
    };
  }, [isCalculating]);
  return (
    <main className="batch-page">
      <section className="batch-hero">
        <div>
          <div className="batch-kicker">
            <b>B</b>
            <span>
              <strong>FEED batch hydraulic assessment</strong>
              <small>
                Upload and evaluate up to {BATCH_MAX_ROWS.toLocaleString()}{" "}
                independent piping lines
              </small>
            </span>
          </div>
          <h1>Multi-line pressure-drop assessment</h1>
        </div>
        <span className="local-pill">Processed locally in your browser</span>
      </section>
      <section className="batch-workflow">
        <div className="batch-template-card">
          <div>
            <h2>
              <b className="batch-step-number">1</b> Get and upload the template
            </h2>
            <p>
              Download the standard template, complete the hydraulic and
              piping-line details, then upload it below. The same column layout
              is accepted for Excel or CSV uploads.
            </p>
          </div>
          <div className="batch-template-actions">
            <button
              className="template-download-button"
              onClick={downloadBatchTemplate}
            >
              <span aria-hidden="true">↓</span>
              Download standard template
            </button>
          </div>
        </div>
        <div
          className={`batch-dropzone ${dragging ? "dragging" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => { if (!isCalculating) inputRef.current?.click(); }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ")
              if (!isCalculating) inputRef.current?.click();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void upload(event.dataTransfer.files);
          }}
        >
          <UploadIcon />
          <strong>Click to upload files or drag and drop</strong>
          <small>
            Multiple Excel (.xlsx, .xls) or CSV files accepted • maximum{" "}
            {BATCH_MAX_ROWS.toLocaleString()} rows
          </small>
          <input
            hidden
            multiple
            disabled={isCalculating}
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            onChange={(event) => { void upload(event.target.files ?? undefined); }}
          />
        </div>
        <p className="batch-upload-status">{message}</p>
        <details className="batch-columns">
          <summary>Supported column names and required information</summary>
          <div>
            <p>
              <strong>Required for every row:</strong> line_no, flow_type,
              fluid_id, inlet_pressure_kgcm2g, temperature_c, applicable flow,
              length_m, id_mm and roughness_mm.
            </p>
            <p>
              <strong>Applicable flow:</strong> liquid_flow_m3h for liquid,
              gas_flow_m3h for gas or two-phase, steam_flow_kgh for steam.
              Optional: service, elevation_m, loss_k and
              required_outlet_pressure_kgcm2g.
            </p>
            <p>
              Use a fluid_id from FlowSure’s generic or imported fluid library.
              A missing or invalid required value is reported as{" "}
              <strong>INCOMPLETE</strong>; it is never assumed.
            </p>
          </div>
        </details>
      </section>
      {rows.length > 0 && (
        <section className="batch-card">
          <h2>
            <b className="batch-step-number">2</b> Validate and calculate
          </h2>
          <p>
            <strong>{rows.length.toLocaleString()}</strong> loaded rows from{" "}
            <strong>{sourceFiles.length}</strong> source file(s). A row becomes{" "}
            <em>Incomplete</em> when a required hydraulic input is absent or
            invalid.
          </p>
          <button className="primary" onClick={calculate} disabled={isCalculating}>
            {isCalculating ? "Assessment in progress…" : "Run batch hydraulic review"}
          </button>
        </section>
      )}
      {(isCalculating || results.length > 0) && (
          <section ref={assessmentRef} className={`batch-complete ${isCalculating ? "calculating" : ""}`} aria-live="polite" aria-busy={isCalculating}>
            <div>
              <span>FEED batch hydraulic assessment</span>
              <h2>{isCalculating ? "Assessment in progress" : "Assessment complete"}</h2>
              <p>
                {isCalculating ? "↻" : "✓"} {batchProgress.completedRows.toLocaleString()} of {batchProgress.totalRows.toLocaleString()} uploaded lines assessed
              </p>
              <small>{batchProgress.completedFiles} of {batchProgress.totalFiles} uploaded files processed</small>
            </div>
            <div className="batch-progress">
              <div className="batch-progress-ring" role="progressbar" aria-label="Batch hydraulic assessment progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(batchCompletionPercent)}>
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <circle className="progress-track" cx="60" cy="60" r="52" />
                  <circle
                    className="progress-value"
                    cx="60"
                    cy="60"
                    r="52"
                    strokeDasharray={progressRingCircumference}
                    strokeDashoffset={progressRingCircumference * (1 - batchCompletionPercent / 100)}
                  />
                </svg>
                <span>
                  {batchProgress.completedFiles.toLocaleString()} / {batchProgress.totalFiles.toLocaleString()}
                  <small>FILES</small>
                </span>
              </div>
              <small>{Math.round(batchCompletionPercent)}% complete</small>
            </div>
            <div className="batch-time">
              ◷{" "}
              <span>
                Calculation time:<strong>{durationSeconds.toFixed(2)} s</strong>
              </span>
            </div>
          </section>
      )}
      {!isCalculating && results.length > 0 && (
        <>
          <section className="batch-results-card">
            <div className="batch-results-title">
              <h2>
                <b>3</b> Review batch results
              </h2>
              <div className="batch-template-actions">
                <button className="primary" disabled={isExportingBatch} onClick={() => { void downloadExecutiveBatchReport(); }}>
                  {isExportingBatch ? "Preparing Excel report…" : "Download executive Excel report"}
                </button>
                <button onClick={() => download(batchResultsCsv(results, project.atmosphericPressurePaA), "flowsure-batch-results.csv")}>
                  Export CSV
                </button>
              </div>
            </div>
            <div className="batch-stat-grid">
              <div className="batch-stat-menu" aria-hidden="true">☰</div>
              <button
                className="stat total"
                onClick={() => { setStatusFilter(""); setPage(0); }}
              >
                <small>Total lines</small>
                <strong>{results.length}</strong>
              </button>
              {(["PASS", "WARNING", "FAIL", "INCOMPLETE"] as const).map(
                (status) => (
                  <button
                    key={status}
                    className={`stat status-${status.toLowerCase()}`}
                    onClick={() => {
                      setStatusFilter(status);
                      setPage(0);
                    }}
                  >
                    <small>{status}</small>
                    <strong>{totals[status] ?? 0}</strong>
                    <em>{percent(status)}%</em>
                  </button>
                ),
              )}
              <div className="stat inactive" title="Duplicate rows are not yet separately screened.">
                <small>Duplicate</small><strong>0</strong><em>0.0%</em>
              </div>
              <div className="stat inactive" title="Unsupported rows are reported as incomplete or failed with a review note.">
                <small>Unsupported</small><strong>0</strong><em>0.0%</em>
              </div>
            </div>
            <div className="batch-analysis">
              <div>
                <h3>Result distribution</h3>
                <div className="distribution">
                  <div
                    className="batch-donut large"
                    style={{ background: donut }}
                  >
                    <span>
                      {results.length}
                      <small>Total lines</small>
                    </span>
                  </div>
                  <ul>
                    {(["PASS", "WARNING", "FAIL", "INCOMPLETE"] as const).map(
                      (status) => (
                        <li key={status}>
                          <b className={status.toLowerCase()} />
                          {status}
                          <span>
                            {totals[status] ?? 0} · {percent(status)}%
                          </span>
                        </li>
                      ),
                    )}
                    <li className="inactive"><b className="duplicate" />Duplicate<span>0 · 0.0%</span></li>
                    <li className="inactive"><b className="unsupported" />Unsupported<span>0 · 0.0%</span></li>
                  </ul>
                </div>
              </div>
              <div className="priority-actions">
                <h3>Priority actions</h3>
                {[
                  ["FAIL", "Failed lines to review", "!", "fail"],
                  ["WARNING", "Lines requiring engineering review", "!", "warning"],
                  ["INCOMPLETE", "Incomplete lines to complete", "◷", "incomplete"],
                  ["DUPLICATE", "Duplicate lines to resolve", "□", "duplicate"],
                  ["UNSUPPORTED", "Unsupported material lines", "?", "unsupported"],
                ].map(([status, label, icon, tone]) => (
                  <button
                    key={status}
                    onClick={() => {
                      if (status === "FAIL" || status === "WARNING" || status === "INCOMPLETE") setStatusFilter(status);
                      setPage(0);
                    }}
                  >
                    <span className={`priority-icon tone-${tone}`}>{icon}</span>
                    <span className="priority-label">{label}</span>
                    <b>{totals[status] ?? 0} ›</b>
                  </button>
                ))}
              </div>
              <p className="batch-percentage-note">
                Percentages are calculated based on total lines.
              </p>
            </div>
            <button
              className="register-toggle"
              aria-expanded={showRegister}
              aria-controls="batch-calculation-register"
              onClick={() => setShowRegister((visible) => !visible)}
            >
              {showRegister
                ? "Hide Calculation Register"
                : "Show Calculation Register"}
            </button>
            {showRegister && <div className="register-area" id="batch-calculation-register">
              <div className="batch-register-controls">
              <input
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setPage(0);
                }}
                placeholder="Search line, service, status or source file"
              />
              <select
                value={sourceFilter}
                onChange={(event) => {
                  setSourceFilter(event.target.value);
                  setPage(0);
                }}
              >
                <option value="">All source files</option>
                {sourceFiles.map((file) => (
                  <option key={file}>{file}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setPage(0);
                }}
              >
                <option value="">All statuses</option>
                <option>PASS</option>
                <option>WARNING</option>
                <option>FAIL</option>
                <option>INCOMPLETE</option>
              </select>
            </div>
            <div className="table-wrap batch-table">
              <table>
                <thead>
                  <tr>
                    <th>Sl. No.</th>
                    <th>Source</th>
                    <th>Line</th>
                    <th>Status</th>
                    <th>Service</th>
                    <th>Flow type</th>
                    <th>Fluid ID</th>
                    <th>Mode</th>
                    <th>Inlet kg/cm²(g)</th>
                    <th>Temperature °C</th>
                    <th>Liquid flow m³/h</th>
                    <th>Gas flow m³/h</th>
                    <th>Steam flow kg/h</th>
                    <th>Length m</th>
                    <th>Entered ID mm</th>
                    <th>Roughness mm</th>
                    <th>Elevation m</th>
                    <th>Fittings K</th>
                    <th>Required outlet kg/cm²(g)</th>
                    <th>Input-ID velocity m/s</th>
                    <th>Preliminary NPS</th>
                    <th>Screened ID mm</th>
                    <th>Preliminary-NPS velocity m/s</th>
                    <th>Outlet kg/cm²(g)</th>
                    <th>Loss kg/cm²</th>
                    <th>Reason / review note</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row, index) => (
                    <tr
                      key={`${row.sourceFile}-${row.sourceSheet}-${row.rowNumber}`}
                      className={`batch-${row.status.toLowerCase()}`}
                    >
                      <td>{page * 50 + index + 1}</td>
                      <td>{row.sourceFile}</td>
                      <td>{row.lineNo}</td>
                      <td>
                        <span className="pill">{row.status}</span>
                      </td>
                      <td>{row.service ?? "—"}</td>
                      <td>{row.inputValues.flow_type || "—"}</td>
                      <td>{row.inputValues.fluid_id || "—"}</td>
                      <td>{row.inputValues.id_mm ? row.inputValues.calculation_mode || "check" : "auto-size"}</td>
                      <td>{row.inputValues.inlet_pressure_kgcm2g || "—"}</td>
                      <td>{row.inputValues.temperature_c || "—"}</td>
                      <td>{row.inputValues.liquid_flow_m3h || "—"}</td>
                      <td>{row.inputValues.gas_flow_m3h || "—"}</td>
                      <td>{row.inputValues.steam_flow_kgh || "—"}</td>
                      <td>{row.inputValues.length_m || "—"}</td>
                      <td>{row.inputValues.id_mm || "—"}</td>
                      <td>{row.inputValues.roughness_mm || "—"}</td>
                      <td>{row.inputValues.elevation_m || "—"}</td>
                      <td>{row.inputValues.loss_k || "—"}</td>
                      <td>{row.inputValues.required_outlet_pressure_kgcm2g || "—"}</td>
                      <td>{row.inputIdVelocityMS?.toFixed(2) ?? "—"}</td>
                      <td>{row.recommendedNps || "—"}</td>
                      <td>{row.recommendedIdMm?.toFixed(2) ?? "—"}</td>
                      <td>{row.preliminaryNpsVelocityMS?.toFixed(2) ?? "—"}</td>
                      <td>
                        {row.result
                          ? absolutePaToKgCm2G(
                              row.result.outletPressurePaA,
                              project.atmosphericPressurePaA,
                            ).toFixed(2)
                          : "—"}
                      </td>
                      <td>
                        {row.result
                          ? paToKgCm2(row.result.totalPressureLossPa).toFixed(2)
                          : "—"}
                      </td>
                      <td>{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="batch-pagination">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span>
                Showing {visible.length} of {filtered.length} filtered rows
              </span>
              <button
                disabled={(page + 1) * 50 >= filtered.length}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
            </div>}
          </section>
        </>
      )}
      <p className="batch-disclaimer">
        Batch results are screening outputs. Each row represents one independent
        hydraulic path; branches, networks, transient behaviour, phase change
        and final pipe sizing require suitable engineering review.
      </p>
    </main>
  );
}

type Page = "calculator" | "batch" | "methodology" | "examples" | "about";
type Theme = "light" | "dark";
type CalculationPurpose = "check" | "size";
const serviceOptions: [ServiceType, string][] = [
  ["pump-suction-bubble-point", "Pump suction - bubble point"],
  ["pump-suction-subcooled", "Pump suction - subcooled"],
  ["pump-discharge-low-pressure", "Pump discharge <=50 kg/cm²(g)"],
  ["pump-discharge-high-pressure", "Pump discharge >50 kg/cm²(g)"],
  ["gravity-flow", "Gravity flow"],
  ["side-stream-draw-off", "Side-stream draw-off"],
  ["thermosiphon-reboiler-liquid", "Thermosiphon reboiler liquid"],
  ["cooling-water", "Cooling water sub-header"],
  ["kerosene-jet-fuel", "Kerosene / jet fuel"],
  ["hot-oil", "Hot oil"],
  ["lean-amine-carbon-steel", "Lean amine - carbon steel"],
  ["rich-amine-carbon-steel", "Rich amine - carbon steel"],
  ["caustic-carbon-steel", "Caustic - carbon steel"],
  ["general-liquid", "General liquid"],
];
const gasServiceOptions: [ServiceType, string][] = [
  ["vacuum-service", "Vacuum service"],
  ["general-gas", "General gas"],
  ["compressor-suction", "Compressor suction line"],
  ["compressor-discharge-individual", "Individual compressor discharge"],
  ["compressor-discharge-header", "Common compressor discharge header"],
  ["fuel-gas-header", "Fuel-gas header"],
];
const steamServiceOptions: [ServiceType, string][] = [
  [
    "steam-subheader-low-pressure",
    "Steam subheader - approximately 1 kg/cm²(g)",
  ],
  ["steam-subheader-medium-pressure", "Steam subheader - 10 to 40 kg/cm²(g)"],
  [
    "steam-long-line-low-pressure",
    "Steam long line - approximately 1 kg/cm²(g)",
  ],
  ["steam-long-line-high-pressure", "Steam long line - above 10 kg/cm²(g)"],
];
const twoPhaseServiceOptions: [ServiceType, string][] = [
  ["mixed-phase", "Mixed phase - first-pass Technip criteria"],
  ["mixed-phase-condensates", "Mixed-phase condensates"],
  [
    "natural-circulation-reboiler-return",
    "Natural-circulation reboiler return",
  ],
  ["partial-condenser-outlet", "Partial condenser outlet"],
  ["mixed-phase-compressor-delivery", "Mixed phase at compressor delivery"],
];
const copy = <T,>(value: T): T => structuredClone(value);
const number = (value: string) => Number(value);

function genericLearningProject(): Project {
  const learningCase = copy(defaultProject);
  learningCase.title = "Generic learning example - liquid transfer";
  learningCase.caseNumber = "LEARN-001";
  learningCase.engineer = "";
  learningCase.notes = "Generic self-learning example. Replace every value before engineering use.";
  learningCase.designBasis = "generic-screening";
  learningCase.operatingCase = "normal";
  learningCase.serviceType = "general-liquid";
  learningCase.flowType = "liquid";
  learningCase.liquidFlowM3S = 72 / 3600;
  learningCase.inletPressurePaA = kgCm2GToAbsolutePa(4, learningCase.atmosphericPressurePaA);
  learningCase.temperatureK = 303.15;
  learningCase.pumpNpshrM = 0;
  learningCase.staticSuctionHeadM = 0;
  learningCase.fluid = {
    name: "Generic water-like liquid",
    source: "FlowSure self-learning example",
    status: "illustrative",
    phase: "liquid",
    basisTemperatureC: 30,
    densityKgM3: 1000,
    viscosityPaS: 0.001,
    vaporPressureBarA: 0.04,
    gasDensityKgM3: 1.2,
    gasViscosityPaS: 0.000018,
    molecularWeightKgKmol: 28.97,
    compressibilityZ: 1,
    surfaceTensionNm: 0.072,
  };
  learningCase.segments = [{
    id: "generic-learning-transfer-line",
    name: "Horizontal transfer line",
    role: "other",
    serviceType: "general-liquid",
    lengthM: 100,
    internalDiameterM: 0.154,
    roughnessM: 0.000045,
    elevationChangeM: 0,
    lossCoefficientK: 2,
    extraPressureLossPa: 0,
  }];
  return learningCase;
}

function App() {
  const [project, setProject] = useState<Project>(
    () => loadProject() ?? copy(defaultProject),
  );
  const [page, setPage] = useState<Page>("calculator");
  const [theme, setTheme] = useState<Theme>(() =>
    window.localStorage.getItem("flowsure-theme") === "dark" ? "dark" : "light",
  );
  // Start compact so the calculator inputs receive the full focus on launch.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [calculationPurpose, setCalculationPurpose] =
    useState<CalculationPurpose>("check");
  const [minimumOutletPressureKgCm2G, setMinimumOutletPressureKgCm2G] =
    useState(0);
  const [customFluids, setCustomFluids] = useState<FluidProperties[]>(() =>
    loadCustomFluidLibrary(),
  );
  const [calculationRevision, setCalculationRevision] = useState(0);
  const [inputsChanged, setInputsChanged] = useState(false);
  const hasLoadedInitialProject = useRef(false);
  const fluidFileRef = useRef<HTMLInputElement>(null);
  const allFluids = [...(fluids.fluids as FluidProperties[]), ...customFluids];
  // Results stay tied to the last deliberate calculation, not to partially edited inputs.
  const result = useMemo(() => safeCalculate(project), [calculationRevision]);
  const sizingResult = useMemo(
    () =>
      calculationPurpose === "size"
        ? sizePipe(
            project,
            kgCm2GToAbsolutePa(
              minimumOutletPressureKgCm2G,
              project.atmosphericPressurePaA,
            ),
          )
        : undefined,
    [calculationPurpose, minimumOutletPressureKgCm2G, project],
  );
  useEffect(() => {
    if (hasLoadedInitialProject.current) setInputsChanged(true);
    else hasLoadedInitialProject.current = true;
  }, [project]);
  useEffect(() => {
    window.localStorage.setItem("flowsure-theme", theme);
  }, [theme]);
  function calculateAndUpdate() {
    setCalculationRevision((revision) => revision + 1);
    setInputsChanged(false);
    setNotice("Calculation updated using the current inputs.");
  }
  const update = <K extends keyof Project>(key: K, value: Project[K]) =>
    setProject((p) => ({ ...p, [key]: value }));
  const updateFluid = (key: keyof Project["fluid"], value: string | number) =>
    setProject((p) => ({ ...p, fluid: { ...p.fluid, [key]: value } }));

  function segmentsForModel(
    segments: Segment[],
    phase: FlowType,
    serviceType: ServiceType,
  ): Segment[] {
    return segments.map((segment) => ({
      ...segment,
      role: phase === "liquid" ? segment.role : "other",
      serviceType,
      name:
        phase !== "liquid" && /^Pump (suction|discharge)$/i.test(segment.name)
          ? `${phase === "gas" ? "Gas" : phase === "steam" ? "Steam" : "Two-phase"} pipeline segment`
          : segment.name,
    }));
  }
  function selectFlowModel(phase: FlowType) {
    const serviceType: ServiceType =
      phase === "gas"
        ? "general-gas"
        : phase === "steam"
          ? "steam-subheader-low-pressure"
          : phase === "two-phase"
            ? "mixed-phase"
            : "general-liquid";
    setProject((p) => ({
      ...p,
      flowType: phase,
      serviceType,
      segments: segmentsForModel(p.segments, phase, serviceType),
    }));
  }
  function chooseFluid(index: number) {
    const selected = copy(allFluids[index]);
    const phase = modelForFluid(selected);
    const serviceType: ServiceType =
      phase === "gas"
        ? "general-gas"
        : phase === "two-phase"
          ? "mixed-phase"
          : "general-liquid";
    setProject((p) => ({
      ...p,
      fluid: selected,
      flowType: phase,
      serviceType,
      segments: segmentsForModel(p.segments, phase, serviceType),
    }));
    setNotice(`${selected.name} selected. Flow model changed to ${phase}.`);
  }
  function updateSegment(
    id: string,
    key: keyof Segment,
    value: string | number | undefined,
  ) {
    setProject((p) => ({
      ...p,
      segments: p.segments.map((s) =>
        s.id === id ? { ...s, [key]: value } : s,
      ),
    }));
  }
  function addSegment() {
    setProject((p) => ({
      ...p,
      segments: [
        ...p.segments,
        {
          id: crypto.randomUUID(),
          name: `Pipe segment ${p.segments.length + 1}`,
          role: "other",
          serviceType: p.serviceType,
          lengthM: 100,
          internalDiameterM: 0.154,
          roughnessM: DEFAULT_PIPE_ROUGHNESS_M,
          elevationChangeM: DEFAULT_ELEVATION_CHANGE_M,
          lossCoefficientK: 0,
          extraPressureLossPa: 0,
        },
      ],
    }));
  }
  function removeSegment(id: string) {
    setProject((p) =>
      p.segments.length === 1
        ? p
        : { ...p, segments: p.segments.filter((s) => s.id !== id) },
    );
  }
  function handleSave() {
    saveProject(project);
    setNotice("Project saved in this browser.");
  }
  function handleReset() {
    clearProject();
    setProject(copy(defaultProject));
    setNotice("Started a fresh project.");
  }
  async function handleFluidLibraryImport(file?: File) {
    if (!file) return;
    try {
      const checked = validateFluidLibrary(JSON.parse(await file.text()));
      if (!checked.valid) throw new Error(checked.errors.join(" "));
      saveCustomFluidLibrary(checked.library);
      setCustomFluids(checked.library.fluids);
      setNotice(
        `Fluid library imported: ${checked.library.libraryName} (${checked.library.fluids.length} fluids).`,
      );
    } catch (error) {
      setNotice(
        `Fluid library rejected: ${error instanceof Error ? error.message : "invalid file"}`,
      );
    }
  }

  return (
    <div className={`app-shell theme-${theme}`}>
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            setPage("calculator");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          aria-label="FlowSure: return to the top of the calculator"
        >
          <span className="brand-mark">FS</span>
          <span>
            <strong>FlowSure</strong>
            <small>Refinery hydraulics</small>
          </span>
        </button>
        <nav aria-label="Primary navigation">
          {(
            [
              "calculator",
              "batch",
              "methodology",
              "examples",
              "about",
            ] as Page[]
          ).map((item) => (
            <button
              className={page === item ? "active" : ""}
              key={item}
              onClick={() => setPage(item)}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}
            aria-label={theme === "light" ? "Enable dark mode" : "Enable light mode"}
            title={theme === "light" ? "Enable dark mode" : "Enable light mode"}
          >
            <span aria-hidden="true">{theme === "light" ? "◐" : "☀"}</span>
          </button>
          <button className="secondary" onClick={handleSave}>
            Save locally
          </button>
          <button
            className="primary"
            onClick={() => exportPdf(project, result)}
          >
            Download report
          </button>
        </div>
      </header>

      {page === "calculator" && (
        <main>
          <section className="hero">
            <div className="hero-copy">
            <span className="eyebrow">Class 3 estimate support</span>
            <h1>Assess up to <em>5,000</em> piping lines in one run.</h1>
            <p>
              Validate pressure drop and preliminary pipe sizing across refinery
              piping systems, turning bulk line data into engineering inputs for
              Class 3 estimates.
            </p>
              <div className="hero-actions">
                <button
                  className="primary hero-primary-action"
                  onClick={() => {
                    setPage("batch");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <span aria-hidden="true">⇧</span> Upload Excel / CSV
                </button>
                <button
                  className="secondary hero-secondary-action"
                  onClick={() => {
                    setPage("methodology");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <span aria-hidden="true">▣</span> See Methodology
                </button>
              </div>
              <div className="hero-trust" aria-label="FlowSure data handling and capability">
                <span><b aria-hidden="true">◈</b> 100% local</span>
                <span><b aria-hidden="true">⌑</b> Private</span>
                <span><b aria-hidden="true">☁</b> No cloud upload</span>
              </div>
            </div>
            <div className="hero-art" aria-hidden="true">
              <img src={refineryPipelineHero} alt="" />
            </div>
            <div className="status-card">
              <span>Calculated outlet</span>
              <strong>
                {absolutePaToKgCm2G(
                  result.outletPressurePaA,
                  project.atmosphericPressurePaA,
                ).toFixed(2)}{" "}
                <small>kg/cm²(g)</small>
              </strong>
              <div>
                <span
                  className={
                    result.warnings.some((w) => w.severity === "critical")
                      ? "dot red"
                      : "dot green"
                  }
                />
                {result.warnings.length} review item
                {result.warnings.length === 1 ? "" : "s"}
              </div>
              <div className="status-card-note">
                <span>Current calculation</span>
                <strong>{project.segments.length} {project.segments.length === 1 ? "segment" : "segments"}</strong>
              </div>
            </div>
          </section>

          <div className="class3-disclaimer">
            <strong>Class 3 estimate support</strong>
            <span>
              FlowSure improves the technical quality, consistency and speed of
              piping inputs used in Class 3 cost estimates. Results are
              preliminary engineering screening outputs and require verification
              against approved project data, applicable design criteria and
              formal engineering review before use in a Class 3 estimate.
            </span>
          </div>

          <div className={`workflow ${sidebarOpen ? "" : "sidebar-closed"}`}>
            <aside className="stepper">
              <div className="stepper-heading">
                <span>Calculation workflow</span>
                <button
                  type="button"
                  className="sidebar-toggle"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Close workflow sidebar"
                  title="Close sidebar"
                >
                  ‹
                </button>
              </div>
              {[
                "Project & model",
                "Fluid properties",
                "Pipeline segments",
                "Results & review",
              ].map((x, i) => (
                <a key={x} href={`#step-${i + 1}`}>
                  <b>{i + 1}</b>
                  {x}
                </a>
              ))}
              <div className="privacy-note">
                ◉ Local-first
                <br />
                <small>No operating data leaves your device.</small>
              </div>
            </aside>
            {!sidebarOpen && (
              <button
                type="button"
                className="sidebar-reopen"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open workflow sidebar"
                title="Open workflow sidebar"
              >
                ☰ <span>Workflow</span>
              </button>
            )}
            <div className="workspace">
              {notice && (
                <div className="notice" role="status">
                  {notice}
                  <button onClick={() => setNotice("")}>×</button>
                </div>
              )}
              <Card
                id="step-1"
                number="01"
                title="Project & calculation model"
                subtitle="Define the case, select the physical model and set the calculation purpose."
              >
                <div className="project-model-intro">
                  <div>
                    <b>◎</b>
                    <span>
                      <strong>Define your case</strong>
                      <small>
                        Set the operating context and project basis.
                      </small>
                    </span>
                  </div>
                  <div>
                    <b>⌁</b>
                    <span>
                      <strong>Select the model</strong>
                      <small>
                        Choose the physics that represents your line.
                      </small>
                    </span>
                  </div>
                  <div>
                    <b>✓</b>
                    <span>
                      <strong>Engineering screening</strong>
                      <small>
                        Use traceable inputs and applicable criteria.
                      </small>
                    </span>
                  </div>
                </div>
                <div className="project-model-layout">
                  <div className="project-model-left">
                    <section className="project-details-panel">
                      <h3>Project details</h3>
                      <div className="grid three">
                        <Field label="Project title">
                          <input
                            value={project.title}
                            onChange={(e) => update("title", e.target.value)}
                          />
                        </Field>
                        <Field label="Case number">
                          <input
                            value={project.caseNumber}
                            onChange={(e) =>
                              update("caseNumber", e.target.value)
                            }
                          />
                        </Field>
                        <Field label="Engineer">
                          <input
                            value={project.engineer}
                            onChange={(e) => update("engineer", e.target.value)}
                            placeholder="Optional"
                          />
                        </Field>
                      </div>
                      <div className="grid three">
                        <Field label="Design basis">
                          <select
                            value={project.designBasis}
                            onChange={(e) =>
                              update(
                                "designBasis",
                                e.target.value as DesignBasis,
                              )
                            }
                          >
                            <option value="technip-nrl">
                              Technip / NRL project basis (D4)
                            </option>
                            <option value="generic-screening">
                              Generic screening
                            </option>
                            <option value="mott-fgru">
                              Mott FGRU gas-line screening basis
                            </option>
                          </select>
                        </Field>
                        <Field label="Operating case">
                          <select
                            value={project.operatingCase}
                            onChange={(e) =>
                              update(
                                "operatingCase",
                                e.target.value as OperatingCase,
                              )
                            }
                          >
                            <option value="normal">Normal</option>
                            <option value="rated">Rated</option>
                            <option value="maximum">Maximum</option>
                          </select>
                        </Field>
                        <Field label="Service">
                          <select
                            value={project.serviceType}
                            onChange={(e) => {
                              const serviceType = e.target.value as ServiceType;
                              setProject((p) => ({
                                ...p,
                                serviceType,
                                segments: p.segments.map((segment) => ({
                                  ...segment,
                                  serviceType,
                                })),
                              }));
                            }}
                          >
                            {(project.flowType === "gas"
                              ? gasServiceOptions
                              : project.flowType === "steam"
                                ? steamServiceOptions
                                : project.flowType === "two-phase"
                                  ? twoPhaseServiceOptions
                                  : serviceOptions
                            ).map(([id, label]) => (
                              <option key={id} value={id}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    </section>
                    <section className="calculation-purpose-panel">
                      <div>
                        <h3>Calculation purpose</h3>
                        <p>
                          What would you like to achieve with this calculation?
                        </p>
                      </div>
                      <div className="purpose-picker">
                        <button
                          className={
                            calculationPurpose === "check" ? "selected" : ""
                          }
                          onClick={() => setCalculationPurpose("check")}
                        >
                          <span>▣</span>
                          <div>
                            <strong>Check selected pipe</strong>
                            <small>
                              Use the entered internal diameter and calculate
                              pressure drop.
                            </small>
                          </div>
                        </button>
                        <button
                          className={
                            calculationPurpose === "size" ? "selected" : ""
                          }
                          onClick={() => setCalculationPurpose("size")}
                        >
                          <span>◇</span>
                          <div>
                            <strong>Size pipe safely</strong>
                            <small>
                              Screen standard candidates against hydraulic
                              limits.
                            </small>
                          </div>
                        </button>
                      </div>
                    </section>
                  </div>
                  <section className="flow-model-panel">
                    <div className="flow-model-heading">
                      <span>⚗</span>
                      <div>
                        <h3>Flow model</h3>
                        <p>
                          Choose the physical model that best represents your
                          system.
                        </p>
                      </div>
                    </div>
                    <div className="model-picker">
                      {(
                        [
                          ["liquid", "Liquid", "Darcy–Weisbach + NPSH"],
                          ["gas", "Gas / vapour", "Isothermal compressible"],
                          ["steam", "Steam", "IAPWS-IF97 single phase"],
                          [
                            "two-phase",
                            "Gas–liquid",
                            "Pressure-dependent Beggs–Brill",
                          ],
                        ] as [FlowType, string, string][]
                      ).map(([id, title, sub]) => (
                        <button
                          key={id}
                          className={project.flowType === id ? "selected" : ""}
                          onClick={() => selectFlowModel(id)}
                        >
                          <i>
                            {id === "liquid"
                              ? "◒"
                              : id === "gas"
                                ? "◎"
                                : id === "steam"
                                  ? "♨"
                                  : "◉"}
                          </i>
                          <strong>{title}</strong>
                          <small>{sub}</small>
                        </button>
                      ))}
                    </div>
                    <button
                      className="project-model-continue"
                      onClick={() =>
                        document
                          .getElementById("step-2")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          })
                      }
                    >
                      Continue to inputs <span>→</span>
                    </button>
                    <small className="project-model-save-note">
                      ▣ Your inputs are calculated locally in this browser.
                    </small>
                  </section>
                </div>
              </Card>

              <Card
                id="step-2"
                number="02"
                title="Fluid & operating conditions"
                subtitle="Use a generic starter or enter verified project properties."
              >
                {project.flowType === "steam" ? (
                  <div className="source">
                    <span>Property basis</span>IAPWS-IF97 water/steam properties
                    are calculated from the entered pressure and steam
                    condition.
                    <br />
                    <small>
                      Dry saturated and superheated steam only. Wet steam and
                      condensation require a separate two-phase review.
                    </small>
                  </div>
                ) : (
                  <div className="preset-row">
                    <Field label="Generic starter fluid">
                      <select
                        value={Math.max(
                          0,
                          allFluids.findIndex(
                            (f) => f.name === project.fluid.name,
                          ),
                        )}
                        onChange={(e) => chooseFluid(number(e.target.value))}
                      >
                        {allFluids.map((f, i) => (
                          <option value={i} key={f.id ?? `${f.name}-${i}`}>
                            {f.name}
                            {f.status === "project-verified" ? " ✓" : ""}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="source">
                      <span>Property basis</span>
                      {project.fluid.source}
                      <br />
                      <small>
                        Status: {project.fluid.status ?? "illustrative"}
                        {project.fluid.basisTemperatureC !== undefined
                          ? ` • Basis ${project.fluid.basisTemperatureC} °C`
                          : ""}
                      </small>
                    </div>
                    <div>
                      <button onClick={() => fluidFileRef.current?.click()}>
                        Import fluid library
                      </button>
                      <input
                        ref={fluidFileRef}
                        hidden
                        type="file"
                        accept="application/json"
                        onChange={(e) =>
                          handleFluidLibraryImport(e.target.files?.[0])
                        }
                      />
                    </div>
                  </div>
                )}
                <div className="grid four">
                  <NumberField
                    label="Inlet pressure"
                    unit="kg/cm²(g)"
                    value={absolutePaToKgCm2G(
                      project.inletPressurePaA,
                      project.atmosphericPressurePaA,
                    )}
                    onChange={(v) =>
                      update(
                        "inletPressurePaA",
                        kgCm2GToAbsolutePa(v, project.atmosphericPressurePaA),
                      )
                    }
                  />
                  {(project.flowType !== "steam" ||
                    project.steamCondition === "superheated") && (
                    <NumberField
                      label={
                        project.flowType === "steam"
                          ? "Steam temperature"
                          : "Temperature"
                      }
                      unit="°C"
                      value={project.temperatureK - 273.15}
                      onChange={(v) => update("temperatureK", v + 273.15)}
                    />
                  )}
                  {project.flowType === "steam" && (
                    <>
                      <Field label="Steam condition">
                        <select
                          value={project.steamCondition ?? "superheated"}
                          onChange={(e) =>
                            update(
                              "steamCondition",
                              e.target.value as "saturated-dry" | "superheated",
                            )
                          }
                        >
                          <option value="saturated-dry">
                            Dry saturated steam
                          </option>
                          <option value="superheated">Superheated steam</option>
                        </select>
                      </Field>
                      <NumberField
                        label="Steam mass flow"
                        unit="kg/h"
                        value={(project.steamMassFlowKgS ?? 0) * 3600}
                        onChange={(v) => update("steamMassFlowKgS", v / 3600)}
                      />
                    </>
                  )}
                  {(project.flowType === "liquid" ||
                    project.flowType === "two-phase") && (
                    <NumberField
                      label="Liquid flow"
                      unit="m³/h"
                      value={project.liquidFlowM3S * 3600}
                      onChange={(v) => update("liquidFlowM3S", v / 3600)}
                    />
                  )}
                  {project.flowType === "gas" && (
                    <Field label="Gas-flow input">
                      <select
                        value={project.gasFlowInputBasis ?? "actual"}
                        onChange={(e) =>
                          update(
                            "gasFlowInputBasis",
                            e.target.value as "actual" | "mass",
                          )
                        }
                      >
                        <option value="actual">Actual volume at inlet</option>
                        <option value="mass">Mass flow</option>
                      </select>
                    </Field>
                  )}
                  {(project.flowType === "gas" ||
                    project.flowType === "two-phase") &&
                    (project.flowType === "gas" &&
                    project.gasFlowInputBasis === "mass" ? (
                      <NumberField
                        label="Gas mass flow"
                        unit="kg/h"
                        value={project.massFlowKgS * 3600}
                        onChange={(v) => update("massFlowKgS", v / 3600)}
                      />
                    ) : (
                      <NumberField
                        label="Gas flow (actual)"
                        unit="m³/h"
                        value={project.gasFlowM3S * 3600}
                        onChange={(v) => update("gasFlowM3S", v / 3600)}
                      />
                    ))}
                  {(project.flowType === "liquid" ||
                    project.flowType === "two-phase") && (
                    <>
                      <NumberField
                        label="Liquid density"
                        unit="kg/m³"
                        value={project.fluid.densityKgM3}
                        onChange={(v) => updateFluid("densityKgM3", v)}
                      />
                      <NumberField
                        label="Liquid viscosity"
                        unit="cP"
                        value={project.fluid.viscosityPaS * 1000}
                        onChange={(v) => updateFluid("viscosityPaS", v / 1000)}
                      />
                    </>
                  )}
                  {project.flowType === "liquid" && (
                    <>
                      <NumberField
                        label="Vapour pressure"
                        unit="kg/cm²(a)"
                        value={
                          (project.fluid.vaporPressureBarA *
                            units.pressure.bar) /
                          units.pressure["kg/cm²"]
                        }
                        onChange={(v) =>
                          updateFluid(
                            "vaporPressureBarA",
                            (v * units.pressure["kg/cm²"]) / units.pressure.bar,
                          )
                        }
                      />
                      <NumberField
                        label="Pump NPSHr"
                        unit="m"
                        value={project.pumpNpshrM}
                        onChange={(v) => update("pumpNpshrM", v)}
                      />
                      <NumberField
                        label="Static suction head"
                        unit="m"
                        value={project.staticSuctionHeadM}
                        onChange={(v) => update("staticSuctionHeadM", v)}
                      />
                    </>
                  )}
                  {(project.flowType === "gas" ||
                    project.flowType === "two-phase") && (
                    <>
                      <NumberField
                        label="Gas density"
                        unit="kg/m³"
                        value={project.fluid.gasDensityKgM3}
                        onChange={(v) => updateFluid("gasDensityKgM3", v)}
                      />
                      <NumberField
                        label="Gas viscosity"
                        unit="cP"
                        value={project.fluid.gasViscosityPaS * 1000}
                        onChange={(v) =>
                          updateFluid("gasViscosityPaS", v / 1000)
                        }
                      />
                      <NumberField
                        label="Molecular weight"
                        unit="kg/kmol"
                        value={project.fluid.molecularWeightKgKmol}
                        onChange={(v) =>
                          updateFluid("molecularWeightKgKmol", v)
                        }
                      />
                      <NumberField
                        label="Compressibility Z"
                        unit="–"
                        value={project.fluid.compressibilityZ}
                        onChange={(v) => updateFluid("compressibilityZ", v)}
                      />
                      <NumberField
                        label="Heat-capacity ratio, k"
                        unit="–"
                        value={project.fluid.gasHeatCapacityRatio ?? 1.3}
                        onChange={(v) => updateFluid("gasHeatCapacityRatio", v)}
                      />
                    </>
                  )}
                  {project.flowType === "two-phase" && (
                    <NumberField
                      label="Surface tension"
                      unit="N/m"
                      value={project.fluid.surfaceTensionNm}
                      onChange={(v) => updateFluid("surfaceTensionNm", v)}
                    />
                  )}
                </div>
                <p className="inline-warning">
                  {project.flowType === "steam"
                    ? "Steam calculations are single-phase screening only. Check heat loss, condensate formation, traps, insulation, start-up and transients separately."
                    : "Generic fluids are illustrative. Replace them with properties at the actual operating temperature and pressure."}
                </p>
              </Card>

              <Card
                id="step-3"
                number="03"
                title="Pipeline segments"
                subtitle="Enter sections in flow order. Positive elevation means uphill."
              >
                <div className="segments">
                  {project.segments.map((segment, index) => (
                    <SegmentEditor
                      key={segment.id}
                      segment={segment}
                      index={index}
                      flowType={project.flowType}
                      projectService={project.serviceType}
                      atmosphericPressurePaA={project.atmosphericPressurePaA}
                      canRemove={project.segments.length > 1}
                      onChange={updateSegment}
                      onRemove={removeSegment}
                    />
                  ))}
                </div>
                <button className="add" onClick={addSegment}>
                  ＋ Add pipeline segment
                </button>
              </Card>

              <section
                className={`calculate-action ${inputsChanged ? "needs-update" : ""}`}
                aria-live="polite"
              >
                <div>
                  <span>Calculation</span>
                  <h2>
                    {inputsChanged
                      ? "Inputs changed — update the calculation"
                      : "Ready to calculate"}
                  </h2>
                  <p>
                    {inputsChanged
                      ? "The summary below shows the last calculated case. Refresh it before using or exporting the result."
                      : "Confirm the entered service conditions, then calculate the hydraulic result."}
                  </p>
                </div>
                <button className="primary" onClick={calculateAndUpdate}>
                  Calculate / Update results
                </button>
              </section>

              {calculationPurpose === "size" && sizingResult && (
                <>
                  <SizingPanel
                    project={project}
                    result={sizingResult}
                    minimumOutletPressureKgCm2G={minimumOutletPressureKgCm2G}
                    onMinimumOutletChange={setMinimumOutletPressureKgCm2G}
                    onApply={(insideDiameterMm, nominalPipeSizeIn) => {
                      setProject((current) => ({
                        ...current,
                        segments: current.segments.map((segment) => ({
                          ...segment,
                          internalDiameterM: insideDiameterMm / 1000,
                          nominalPipeSizeIn,
                        })),
                      }));
                      setCalculationPurpose("check");
                      setNotice(
                        `Recommended NPS ${nominalPipeSizeIn} screening diameter ${insideDiameterMm.toFixed(2)} mm applied to all segments. Verify actual pipe schedule and corrosion allowance.`,
                      );
                    }}
                  />
                  <FutureCasePanel
                    project={project}
                    minimumOutletPressureKgCm2G={minimumOutletPressureKgCm2G}
                  />
                </>
              )}

              <section id="step-4" className="results-section">
                <div className="results-title">
                  <div>
                    <div className="result-step-heading">
                      <span>04</span>
                      <b>Results & review</b>
                    </div>
                    <h2>Calculation summary</h2>
                    <p>{result.method}</p>
                  </div>
                  <div className="export-actions">
                    <button onClick={() => exportCsv(project, result)}>
                      Export CSV
                    </button>
                    <button
                      className="primary"
                      onClick={() => exportPdf(project, result)}
                    >
                      Download PDF
                    </button>
                  </div>
                </div>
                <PressureSummary project={project} result={result} />
                {project.flowType === "gas" && (
                  <GasNetworkSummary project={project} result={result} />
                )}
                {project.flowType === "two-phase" && (
                  <TwoPhasePropertySummary result={result} />
                )}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Segment</th>
                        <th>Role</th>
                        <th>Inlet kg/cm²(g)</th>
                        <th>Outlet kg/cm²(g)</th>
                        <th>Velocity m/s</th>
                        <th>Gradient kg/cm²/km</th>
                        <th>Reynolds</th>
                        <th>Regime</th>
                        <th>Total kg/cm²</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.segments.map((r) => (
                        <tr key={r.segmentId}>
                          <td>{r.name}</td>
                          <td>
                            {
                              project.segments.find((s) => s.id === r.segmentId)
                                ?.role
                            }
                          </td>
                          <td>
                            {absolutePaToKgCm2G(
                              r.inletPressurePaA,
                              project.atmosphericPressurePaA,
                            ).toFixed(2)}
                          </td>
                          <td>
                            {absolutePaToKgCm2G(
                              r.outletPressurePaA,
                              project.atmosphericPressurePaA,
                            ).toFixed(2)}
                          </td>
                          <td>{r.velocityMS.toFixed(2)}</td>
                          <td>{r.pressureGradientKgCm2Km?.toFixed(2)}</td>
                          <td>{r.reynolds.toExponential(2)}</td>
                          <td>
                            <span className="pill">{r.flowRegime}</span>
                          </td>
                          <td>
                            <strong>
                              {paToKgCm2(r.totalLossPa).toFixed(2)}
                            </strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <EngineeringReview warnings={result.warnings} />
                <ScenarioComparison project={project} />
              </section>
              <div className="project-actions">
                <button onClick={handleReset}>New project</button>
              </div>
            </div>
          </div>
        </main>
      )}
      {page === "batch" && (
        <BatchPage project={project} fluidLibrary={allFluids} />
      )}
      {page === "methodology" && (
        <MethodologyPage />
      )}
      {page === "examples" && (
        <InfoPage
          eyebrow="Safe public examples"
          title="Start generic, then verify"
        >
          <GuidedLearningExample
            onLoad={() => {
              hasLoadedInitialProject.current = false;
              setProject(genericLearningProject());
              setCalculationRevision((revision) => revision + 1);
              setInputsChanged(false);
              setNotice("Generic learning example loaded and calculated. Review the calculation summary before changing any value.");
              setPage("calculator");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
          <p className="callout">
            These are illustrative workflows—not refinery design cases. No
            private documents or values from the reference folder are included.
          </p>
        </InfoPage>
      )}
      {page === "about" && (
        <InfoPage
          eyebrow="About FlowSure"
          title="Local-first refinery screening"
        >
          <p>
            FlowSure is a transparent, open-source calculation aid. Calculations
            and downloadable reports are produced in your browser. There is no
            account, server database or upload of operating data.
          </p>
          <h2>Batch hydraulic assessment</h2>
          <p>
            FlowSure can validate and hydraulically assess up to{" "}
            <strong>{BATCH_MAX_ROWS.toLocaleString()} piping lines in one run</strong>.
            Users can upload one or multiple Excel/CSV files, monitor live
            calculation progress, review line-by-line status and preliminary
            pipe-size recommendations, and download a consolidated calculation
            register. Processing remains local in the user’s browser.
          </p>
          <h2>Important limitation</h2>
          <p>
            This tool supports ordered steady pipe segments and single-phase
            steam screening with IAPWS-IF97 properties. It does not currently
            solve branching networks, transient slugging, compositional phase
            equilibrium, non-Newtonian flow, solids, wet-steam/condensate
            behaviour, heat-transfer effects or relief-system sizing.
          </p>
          <h2>Version</h2>
          <p>
            Calculation engine 0.1.0. Reports include the engine version to make
            later reviews auditable.
          </p>
        </InfoPage>
      )}
      <footer>
        <strong>FlowSure</strong>
        <span>
          Screening and verification only — not final design certification.
        </span>
        <span>v0.1.0</span>
      </footer>
    </div>
  );
}

function Card({
  id,
  number: n,
  title,
  subtitle,
  children,
}: {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="card">
      <div className="card-title">
        <span>{n}</span>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function NumberField({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label}>
      <div className="input-unit">
        <input
          type="number"
          step="any"
          value={Number.isFinite(value) ? Number(value.toPrecision(8)) : 0}
          onChange={(e) => onChange(number(e.target.value))}
        />
        <span>{unit}</span>
      </div>
    </Field>
  );
}
function SegmentEditor({
  segment,
  index,
  flowType,
  projectService,
  atmosphericPressurePaA,
  canRemove,
  onChange,
  onRemove,
}: {
  segment: Segment;
  index: number;
  flowType: FlowType;
  projectService: ServiceType;
  atmosphericPressurePaA: number;
  canRemove: boolean;
  onChange: (
    id: string,
    key: keyof Segment,
    value: string | number | undefined,
  ) => void;
  onRemove: (id: string) => void;
}) {
  const requiredPressure =
    segment.requiredOutletPressurePaA === undefined
      ? 0
      : absolutePaToKgCm2G(
          segment.requiredOutletPressurePaA,
          atmosphericPressurePaA,
        );
  const visibleServices =
    flowType === "gas"
      ? gasServiceOptions
      : flowType === "steam"
        ? steamServiceOptions
        : flowType === "two-phase"
          ? twoPhaseServiceOptions
          : serviceOptions;
  const pipelineLabel =
    flowType === "gas"
      ? "Gas pipeline"
      : flowType === "steam"
        ? "Steam pipeline"
        : "Two-phase pipeline";
  return (
    <div className="segment">
      <div className="segment-head">
        <span>{String(index + 1).padStart(2, "0")}</span>
        <input
          value={segment.name}
          aria-label={`Segment ${index + 1} name`}
          onChange={(e) => onChange(segment.id, "name", e.target.value)}
        />
        {flowType === "liquid" ? (
          <label className="segment-control">
            <span>Role</span>
            <select
              aria-label={`Role for ${segment.name}`}
              value={segment.role}
              onChange={(e) =>
                onChange(segment.id, "role", e.target.value as SegmentRole)
              }
            >
              <option value="suction">Pump suction</option>
              <option value="discharge">Pump discharge</option>
              <option value="other">Other</option>
            </select>
          </label>
        ) : (
          <div className="segment-role">
            <span>Role</span>
            <strong>{pipelineLabel}</strong>
          </div>
        )}
        <label className="segment-control service-control">
          <span>Design criterion</span>
          <select
            aria-label={`Service for ${segment.name}`}
            value={segment.serviceType ?? projectService}
            onChange={(e) =>
              onChange(segment.id, "serviceType", e.target.value as ServiceType)
            }
          >
            {visibleServices.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          aria-label={`Remove ${segment.name}`}
          disabled={!canRemove}
          onClick={() => onRemove(segment.id)}
        >
          ×
        </button>
      </div>
      <div className="grid six">
        <NumberField
          label="Length"
          unit="m"
          value={segment.lengthM}
          onChange={(v) => onChange(segment.id, "lengthM", v)}
        />
        <NumberField
          label="Inside diameter"
          unit="mm"
          value={segment.internalDiameterM * 1000}
          onChange={(v) => onChange(segment.id, "internalDiameterM", v / 1000)}
        />
        <NumberField
          label="Roughness"
          unit="mm"
          value={segment.roughnessM * 1000}
          onChange={(v) => onChange(segment.id, "roughnessM", v / 1000)}
        />
        <NumberField
          label="Elevation change"
          unit="m"
          value={segment.elevationChangeM}
          onChange={(v) => onChange(segment.id, "elevationChangeM", v)}
        />
        <NumberField
          label="Total fittings K"
          unit="–"
          value={segment.lossCoefficientK}
          onChange={(v) => onChange(segment.id, "lossCoefficientK", v)}
        />
        <NumberField
          label="Equipment loss"
          unit="kg/cm²"
          value={paToKgCm2(segment.extraPressureLossPa)}
          onChange={(v) =>
            onChange(
              segment.id,
              "extraPressureLossPa",
              v * units.pressure["kg/cm²"],
            )
          }
        />
      </div>
      {flowType === "gas" && (
        <div className="grid three segment-network">
          <NumberField
            label="Flow change after segment"
            unit="kg/h (+ add / − withdraw)"
            value={(segment.massFlowChangeKgS ?? 0) * 3600}
            onChange={(v) =>
              onChange(segment.id, "massFlowChangeKgS", v / 3600)
            }
          />
          <Field label="Outlet pressure requirement">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={segment.requiredOutletPressurePaA !== undefined}
                onChange={(e) =>
                  onChange(
                    segment.id,
                    "requiredOutletPressurePaA",
                    e.target.checked
                      ? kgCm2GToAbsolutePa(0, atmosphericPressurePaA)
                      : undefined,
                  )
                }
              />
              Check this named point
            </label>
          </Field>
          {segment.requiredOutletPressurePaA !== undefined && (
            <NumberField
              label="Minimum outlet pressure"
              unit="kg/cm²(g)"
              value={requiredPressure}
              onChange={(v) =>
                onChange(
                  segment.id,
                  "requiredOutletPressurePaA",
                  kgCm2GToAbsolutePa(v, atmosphericPressurePaA),
                )
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  unit,
  tone = "",
}: {
  label: string;
  value: string;
  unit: string;
  tone?: string;
}) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>
        {value} <small>{unit}</small>
      </strong>
    </div>
  );
}
function PressureSummary({
  project,
  result,
}: {
  project: Project;
  result: CalculationResult;
}) {
  const inlet = absolutePaToKgCm2G(
    project.inletPressurePaA,
    project.atmosphericPressurePaA,
  );
  const outlet = absolutePaToKgCm2G(
    result.outletPressurePaA,
    project.atmosphericPressurePaA,
  );
  const pressureLoss = paToKgCm2(result.totalPressureLossPa);
  const isGain = pressureLoss < 0;
  return (
    <>
      <div className="metrics pressure-metrics">
        <Metric
          label="Inlet pressure"
          value={inlet.toFixed(2)}
          unit="kg/cm²(g)"
        />
        <Metric
          label={isGain ? "Net pressure gain" : "Total pressure loss"}
          value={Math.abs(pressureLoss).toFixed(2)}
          unit="kg/cm²"
          tone={isGain ? "good" : ""}
        />
        <Metric
          label="Calculated outlet pressure"
          value={outlet.toFixed(2)}
          unit="kg/cm²(g)"
        />
        {result.npshaM !== undefined && (
          <Metric
            label="NPSH available"
            value={result.npshaM.toFixed(2)}
            unit="m"
          />
        )}
        {result.npshMarginM !== undefined && (
          <Metric
            label="NPSH margin"
            value={result.npshMarginM.toFixed(2)}
            unit="m"
            tone={result.npshMarginM < 0 ? "bad" : "good"}
          />
        )}
      </div>
      <div className={`pressure-explainer ${isGain ? "gain" : ""}`}>
        <strong>
          {isGain
            ? "How to read this result: pressure increases."
            : "How to read this result: pressure decreases."}
        </strong>
        <span>
          {isGain
            ? "Outlet pressure = Inlet pressure + Pressure gain"
            : "Outlet pressure = Inlet pressure − Total pressure loss"}
        </span>
        <small>
          {outlet.toFixed(2)} = {inlet.toFixed(2)} {isGain ? "+" : "−"}{" "}
          {Math.abs(pressureLoss).toFixed(2)} kg/cm².{" "}
          {isGain
            ? "This can occur when downhill static head is greater than friction and other losses."
            : "The loss includes pipe friction, fittings, equipment, elevation and applicable acceleration effects."}
        </small>
      </div>
    </>
  );
}
function GasNetworkSummary({
  project,
  result,
}: {
  project: Project;
  result: CalculationResult;
}) {
  return (
    <div className="gas-network">
      <strong>Gas-network flow path</strong>
      <p>
        Each segment uses its own gas flow. A positive junction change adds gas
        downstream; a negative value withdraws gas.
      </p>
      <div className="gas-network-grid">
        {result.segments.map((row) => {
          const segment = project.segments.find(
            (item) => item.id === row.segmentId,
          );
          const required = segment?.requiredOutletPressurePaA;
          const pass =
            required === undefined || row.outletPressurePaA >= required;
          return (
            <div key={row.segmentId}>
              <span>{row.name}</span>
              <b>{((row.gasMassFlowKgS ?? 0) * 3600).toFixed(2)} kg/h</b>
              <small>
                Outlet{" "}
                {absolutePaToKgCm2G(
                  row.outletPressurePaA,
                  project.atmosphericPressurePaA,
                ).toFixed(2)}{" "}
                kg/cm²(g)
                {segment?.massFlowChangeKgS
                  ? ` • Junction ${(segment.massFlowChangeKgS * 3600).toFixed(2)} kg/h`
                  : ""}
                {required !== undefined
                  ? ` • ${pass ? "Requirement met" : "Requirement not met"}`
                  : ""}
              </small>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function TwoPhasePropertySummary({ result }: { result: CalculationResult }) {
  return (
    <div className="gas-network two-phase-state">
      <strong>Pressure-dependent gas state by segment</strong>
      <p>
        Gas mass flow is held constant. Density and actual gas volume are
        recalculated from pressure; liquid holdup is the Beggs–Brill estimate.
      </p>
      <div className="gas-network-grid">
        {result.segments.map((row) => (
          <div key={row.segmentId}>
            <span>{row.name}</span>
            <b>Holdup {(row.liquidHoldup ?? 0).toFixed(3)}</b>
            <small>
              Gas density {(row.gasInletDensityKgM3 ?? 0).toFixed(2)} →{" "}
              {(row.gasOutletDensityKgM3 ?? 0).toFixed(2)} kg/m³
              <br />
              Actual gas flow{" "}
              {((row.gasInletActualFlowM3S ?? 0) * 3600).toFixed(2)} →{" "}
              {((row.gasOutletActualFlowM3S ?? 0) * 3600).toFixed(2)} m³/h
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}
function SizingPanel({
  project,
  result,
  minimumOutletPressureKgCm2G,
  onMinimumOutletChange,
  onApply,
}: {
  project: Project;
  result: PipeSizingResult;
  minimumOutletPressureKgCm2G: number;
  onMinimumOutletChange: (value: number) => void;
  onApply: (insideDiameterMm: number, nominalPipeSizeIn: number) => void;
}) {
  const rejectedCandidates = result.candidates.filter(
    (candidate) => !candidate.acceptable,
  );
  const selectedCandidates = result.candidates
    .filter((candidate) => candidate.acceptable)
    .slice(0, 5);
  const displayedCandidates = [
    ...rejectedCandidates,
    ...selectedCandidates,
  ].sort((left, right) => left.npsIn - right.npsIn);
  return (
    <section className="sizing-panel" aria-labelledby="pipe-sizing-title">
      <h2 id="pipe-sizing-title">Pipe sizing — screening recommendation</h2>
      <p>
        Tests one common internal diameter across all entered segments. A
        candidate must meet the required outlet pressure and the selected
        service criteria.
      </p>
      <div className="sizing-inputs">
        <NumberField
          label="Minimum required outlet pressure"
          unit="kg/cm²(g)"
          value={minimumOutletPressureKgCm2G}
          onChange={onMinimumOutletChange}
        />
        <div
          className={`sizing-recommendation ${!result.recommended ? "bad" : ""}`}
        >
          {!result.supported ? (
            <>
              <strong>Automatic recommendation withheld</strong>
              <span>{result.message}</span>
            </>
          ) : result.recommended ? (
            <>
              <strong>
                {result.preliminary ? "Preliminary size screen" : "Recommended"}
                : NPS {result.recommended.npsDisplay},{" "}
                {result.recommended.schedule}
              </strong>
              <span>
                Pipe ID {result.recommended.insideDiameterMm.toFixed(2)} mm ·
                wall {result.recommended.wallThicknessMm.toFixed(2)} mm
              </span>
            </>
          ) : (
            <>
              <strong>No acceptable candidate</strong>
              <span>
                Increase available pressure, review criteria, or extend the
                verified size library.
              </span>
            </>
          )}
        </div>
      </div>
      {result.preliminary && (
        <div className="two-phase-sizing-warning">
          <strong>Not a final two-phase line size</strong>
          <span>
            {result.message} Confirm the selected NPS using approved PVT/flash
            data and a transient/slugging review before issuing piping
            quantities or design documents.
          </span>
        </div>
      )}
      {result.supported && (
        <>
          <p className="sizing-selection-note">
            Showing all {rejectedCandidates.length} rejected sizes in red and
            the first {selectedCandidates.length} accepted sizes. Larger
            acceptable sizes are intentionally hidden.
          </p>
          <div className="table-wrap sizing-table">
            <table>
              <thead>
                <tr>
                  <th>NPS</th>
                  <th>Schedule</th>
                  <th>Pipe ID mm</th>
                  <th>Max velocity m/s</th>
                  <th>Max gradient kg/cm²/km</th>
                  <th>Outlet kg/cm²(g)</th>
                  <th>Status</th>
                  <th>Governing reason</th>
                </tr>
              </thead>
              <tbody>
                {displayedCandidates.map((candidate) => (
                  <tr
                    key={candidate.npsIn}
                    className={candidate.acceptable ? undefined : "rejected"}
                  >
                    <td>{candidate.npsDisplay}</td>
                    <td>{candidate.schedule}</td>
                    <td>{candidate.insideDiameterMm.toFixed(2)}</td>
                    <td>{candidate.velocityMS.toFixed(2)}</td>
                    <td>{candidate.pressureGradientKgCm2Km.toFixed(2)}</td>
                    <td>
                      {absolutePaToKgCm2G(
                        candidate.outletPressurePaA,
                        project.atmosphericPressurePaA,
                      ).toFixed(2)}
                    </td>
                    <td>
                      <span
                        className={`pill ${candidate.acceptable ? "" : "bad"}`}
                      >
                        {candidate.acceptable ? "Acceptable" : "Rejected"}
                      </span>
                    </td>
                    <td>
                      {candidate.reasons[0] ??
                        "All configured hydraulic checks pass."}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="sizing-actions">
        {result.recommended && (
          <button
            className="primary"
            onClick={() =>
              onApply(
                result.recommended!.insideDiameterMm,
                result.recommended!.npsIn,
              )
            }
          >
            {result.preliminary
              ? "Apply preliminary diameter for comparison"
              : "Apply recommended diameter"}
          </button>
        )}
        <span className="sizing-basis">{result.basis}</span>
      </div>
    </section>
  );
}
function FutureCasePanel({
  project,
  minimumOutletPressureKgCm2G,
}: {
  project: Project;
  minimumOutletPressureKgCm2G: number;
}) {
  const [capacityIncreasePercent, setCapacityIncreasePercent] = useState(20);
  const [roughnessIncreasePercent, setRoughnessIncreasePercent] = useState(0);
  const futureProject = useMemo(
    () =>
      projectForFutureCase(
        project,
        capacityIncreasePercent,
        roughnessIncreasePercent,
      ),
    [project, capacityIncreasePercent, roughnessIncreasePercent],
  );
  const futureResult = useMemo(
    () => safeCalculate(futureProject),
    [futureProject],
  );
  const futureSizing = useMemo(
    () =>
      sizePipe(
        futureProject,
        kgCm2GToAbsolutePa(
          minimumOutletPressureKgCm2G,
          futureProject.atmosphericPressurePaA,
        ),
      ),
    [futureProject, minimumOutletPressureKgCm2G],
  );
  const recommendation = !futureSizing.supported
    ? futureSizing.message
    : futureSizing.recommended
      ? `Future recommendation: NPS ${futureSizing.recommended.npsDisplay}, ID ${futureSizing.recommended.insideDiameterMm.toFixed(2)} mm.`
      : "No standard candidate meets the future-case hydraulic criteria.";
  return (
    <section className="future-case-panel">
      <div>
        <span className="eyebrow">Optional resilience check</span>
        <h2>Future capacity & fouling review</h2>
        <p>
          Tests a separate future case. Your entered design case and selected
          diameter are not changed.
        </p>
      </div>
      <div className="grid two">
        <NumberField
          label="Future flow increase"
          unit="%"
          value={capacityIncreasePercent}
          onChange={setCapacityIncreasePercent}
        />
        <NumberField
          label="Roughness increase"
          unit="%"
          value={roughnessIncreasePercent}
          onChange={setRoughnessIncreasePercent}
        />
      </div>
      <div className="future-case-result">
        <div>
          <span>Future pressure change</span>
          <strong>
            {Math.abs(paToKgCm2(futureResult.totalPressureLossPa)).toFixed(2)}{" "}
            kg/cm² {futureResult.totalPressureLossPa < 0 ? "gain" : "loss"}
          </strong>
          <small>
            Outlet{" "}
            {absolutePaToKgCm2G(
              futureResult.outletPressurePaA,
              project.atmosphericPressurePaA,
            ).toFixed(2)}{" "}
            kg/cm²(g)
          </small>
        </div>
        <div>
          <span>Future pipe-size outcome</span>
          <strong>{recommendation}</strong>
          <small>
            Use approved corrosion allowance and actual aged-pipe roughness;
            this review does not reduce pipe ID.
          </small>
        </div>
      </div>
    </section>
  );
}
function ScenarioComparison({ project }: { project: Project }) {
  const factors = [0.8, 1, 1.2];
  const rows = factors.map((factor) => {
    const p = {
      ...project,
      liquidFlowM3S: project.liquidFlowM3S * factor,
      gasFlowM3S: project.gasFlowM3S * factor,
      massFlowKgS: project.massFlowKgS * factor,
      steamMassFlowKgS: (project.steamMassFlowKgS ?? 0) * factor,
    };
    return { factor, result: safeCalculate(p) };
  });
  return (
    <div className="scenario">
      <h3>Flow sensitivity</h3>
      <p>Quick comparison at ±20% of entered phase flow rates.</p>
      <div className="scenario-grid">
        {rows.map(({ factor, result }) => (
          <div className={factor === 1 ? "current" : ""} key={factor}>
            <span>{(factor * 100).toFixed(0)}% flow</span>
            <strong>
              {Math.abs(paToKgCm2(result.totalPressureLossPa)).toFixed(2)}{" "}
              kg/cm² {result.totalPressureLossPa < 0 ? "gain" : "loss"}
            </strong>
            <small>
              Outlet{" "}
              {absolutePaToKgCm2G(
                result.outletPressurePaA,
                project.atmosphericPressurePaA,
              ).toFixed(2)}{" "}
              kg/cm²(g)
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}
function SteamMethodology() {
  return (
    <section className="steam-methodology">
      <h2>Steam calculation and pipe sizing</h2>
      <h3>Steam</h3>
      <p>
        FlowSure uses IAPWS-IF97 water/steam properties with an iterative,
        steady single-phase Darcy–Weisbach calculation. It supports dry
        saturated steam, treated as quality x = 1, and superheated steam.
      </p>
      <h3>Steam sizing checks</h3>
      <p>
        For the Technip / NRL project basis (D4), pipe sizing checks the applicable
        steam velocity band by pipe size, momentum limit and pressure-gradient
        limit. Select the steam subheader or long-line service that matches the
        operating pressure range before accepting a recommended size.
      </p>
      <h3>Where this model must not be used alone</h3>
      <p>
        This is a hydraulic screening method. It does not model inlet moisture,
        condensate formation, heat loss, insulation performance, traps,
        pressure-induced phase change, water hammer, start-up or other transient
        conditions. Use a validated wet-steam or thermal-hydraulic review
        whenever these effects can occur.
      </p>
      <p>
        D4 high-velocity and solids criteria also require service duty,
        material/corrosion information and any solids content. These inputs are
        not part of the current FlowSure hydraulic form, so confirm those D4
        checks separately when they apply.
      </p>
    </section>
  );
}
function InfoPage({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="info-page">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      {children}
    </main>
  );
}
function MethodologyPage() {
  return (
    <InfoPage eyebrow="Engineering basis" title="Methods you can inspect">
      <p className="method-intro">
        These are the core equations used by FlowSure. Each worked example is
        illustrative; use verified fluid data and your approved design basis for
        refinery decisions.
      </p>
      <LineSizingCriteriaReference />
      <VelocityReferenceChart />
      <PressureDropReferenceCharts />
      <h2>Single-phase liquid</h2>
      <p>
        FlowSure calculates each segment in flow order, then adds pipe friction,
        fittings, equipment loss and elevation change.
      </p>
      <MethodCard
        title="1. Pipe flow area"
        formula="A = piD2 / 4"
        description="The inside diameter determines the open area available for flow."
        example="D = 0.200 m gives A = 0.0314 m2."
      />
      <MethodCard
        title="2. Velocity"
        formula="V = Q / A"
        description="Velocity is flow rate divided by internal pipe area. It drives friction and velocity-limit checks."
        example="Q = 0.050 m3/s and A = 0.0314 m2 gives V = 1.59 m/s."
      />
      <MethodCard
        title="3. Reynolds number"
        formula="Re = rhoVD / mu"
        description="Reynolds number identifies laminar, transitional or turbulent flow. rho is density and mu is dynamic viscosity."
        example="Water: rho = 1,000 kg/m3, V = 1.59 m/s, D = 0.200 m and mu = 0.001 Pa.s gives Re = 318,000: turbulent."
      />
      <MethodCard
        title="4. Darcy friction factor"
        formula="Laminar: f = 64 / Re; turbulent: Colebrook-White iteration"
        description="The friction factor represents resistance from pipe-wall roughness and flow regime. FlowSure uses Colebrook-White, with Churchill fallback."
        example="For commercial steel at Re about 318,000, f is typically about 0.016; exact value changes with roughness."
      />
      <MethodCard
        title="5. Straight-pipe friction loss"
        formula="DeltaP_f = f(L / D)(rhoV2 / 2)"
        description="Darcy-Weisbach calculates pressure loss along a straight pipe. L is length and rhoV2/2 is dynamic pressure."
        example="f = 0.016, L = 100 m, D = 0.200 m and V = 1.59 m/s gives about 10.1 kPa, or 0.103 kg/cm²."
      />
      <MethodCard
        title="6. Fittings and equipment loss"
        formula="DeltaP_m = K(rhoV2 / 2) + DeltaP_equipment"
        description="For each pipeline segment, Total fittings K is the sum of the approved K-values for its elbows, tees, valves, reducers, entrances and exits: K_total = K1 + K2 + K3 + …. Obtain each value from the approved company standard, piping handbook, 3D model or vendor data. Do not include straight-pipe friction in K because FlowSure calculates it separately. Enter a known vendor pressure drop for a strainer, filter, exchanger, meter or control valve as Equipment loss, unless an approved equivalent K is available."
        example="Two 90° elbows (0.9 each) + a fully open gate valve (0.15) + a tee through-run (0.6) give K_total = 2.55. If dynamic pressure is 1.27 kPa, fitting loss = 2.55 × 1.27 = 3.24 kPa."
      />
      <MethodCard
        title="7. Static elevation loss"
        formula="DeltaP_s = rhogDeltaz"
        description="An uphill segment consumes pressure; a downhill segment gains it. g is 9.80665 m/s2."
        example="Water rising 5 m gives 1,000 x 9.80665 x 5 = 49.0 kPa, or 0.500 kg/cm²."
      />
      <MethodCard
        title="8. Segment pressure balance"
        formula="DeltaP_total = DeltaP_f + DeltaP_m + DeltaP_s"
        description="FlowSure subtracts total segment loss from inlet pressure to obtain outlet pressure."
        example="0.103 kg/cm² friction + 0.039 kg/cm² fittings + 0.500 kg/cm² elevation = 0.642 kg/cm² total loss."
      />
      <h2>Gas and vapour</h2>
      <p>
        The gas method is a steady, isothermal screening model. Density is
        recalculated using average segment pressure until outlet pressure
        converges.
      </p>
      <MethodCard
        title="9. Real-gas density"
        formula="rho = PM / (ZRT)"
        description="P is absolute pressure, M molecular weight, Z compressibility factor, R universal gas constant and T absolute temperature."
        example="P = 500 kPa(a), M = 28.97 kg/kmol, Z = 1.00 and T = 300 K gives rho = 5.81 kg/m3."
      />
      <MethodCard
        title="10. Gas pressure iteration"
        formula="P_out = P_in - [DeltaP_f + DeltaP_m + DeltaP_s]"
        description="Gas density changes with pressure, so FlowSure repeats density and loss calculations using average pressure until outlet pressure stabilises."
        example="A trial changing from 480,000 Pa(a) to 479,999 Pa(a) meets the app's 1 Pa convergence target."
      />
      <MethodCard
        title="11. Speed of sound and Mach number"
        formula="a = sqrt(1.3ZRT / M); Ma = V / a"
        description="Mach number compares gas velocity with speed of sound. FlowSure uses 1.3 as a screening heat-capacity-ratio assumption."
        example="At Z = 1, T = 300 K and M = 28.97 kg/kmol, a is about 347 m/s. V = 70 m/s gives Ma about 0.20."
      />
      <SteamMethodology />
      <h2>Gas-liquid flow</h2>
      <p>
        The Beggs-Brill method estimates flow regime and liquid holdup for
        steady gas-liquid flow. It is empirical and requires independent
        verification for important decisions.
      </p>
      <MethodCard
        title="12. Superficial velocities and liquid fraction"
        formula="V_sl = Q_l/A; V_sg = Q_g/A; lambda = V_sl/(V_sl + V_sg)"
        description="Superficial velocity treats each phase as if it alone occupied the pipe. lambda is the no-slip liquid fraction used to select flow regime."
        example="V_sl = 0.40 m/s and V_sg = 0.20 m/s gives lambda = 0.667."
      />
      <MethodCard
        title="13. Froude number"
        formula="N_Fr = V_m2 / (gD)"
        description="Froude number compares flow inertia with gravity and helps determine the Beggs-Brill flow regime."
        example="V_m = 0.60 m/s and D = 0.100 m gives N_Fr = 0.367."
      />
      <MethodCard
        title="14. Two-phase acceleration correction"
        formula="DeltaP_total = (DeltaP_f + DeltaP_s + DeltaP_m) / (1 - E_k)"
        description="E_k accounts for acceleration effect caused by the gas phase. FlowSure limits E_k to a screening range."
        example="Base loss = 20 kPa and E_k = 0.05 gives total loss = 20 / 0.95 = 21.1 kPa."
      />
      <h2>NPSH</h2>
      <p>
        NPSH checks whether pressure at pump suction remains sufficiently above
        vapour pressure to prevent cavitation.
      </p>
      <MethodCard
        title="15. NPSH available"
        formula="NPSHa = (P_atm - P_vap - DeltaP_suction)/(rhog) + H_static"
        description="Only segments marked Pump suction contribute to suction loss. P_atm and P_vap must be absolute pressures; H_static is positive for flooded suction."
        example="P_atm = 101.3 kPa, P_vap = 2.34 kPa, suction loss = 14.0 kPa, rho = 1,000 kg/m3 and H_static = 5 m gives NPSHa = 13.7 m."
      />
      <MethodCard
        title="16. NPSH margin"
        formula="Margin = NPSHa - NPSHr"
        description="A negative margin means the system does not provide the pump's required NPSH at that flow. NPSHr must come from the vendor curve."
        example="NPSHa = 13.7 m and NPSHr = 3.0 m gives margin = 10.7 m. A -0.5 m margin raises a critical warning."
      />
      <p className="callout">
        These formulas are a transparent screening aid, not a substitute for
        approved pump curves, steam properties, transient analysis or formal
        design review.
      </p>
    </InfoPage>
  );
}
function LineSizingCriteriaReference() {
  const [zoomByPage, setZoomByPage] = useState<Record<number, number>>({});
  const pages = [
    "Liquid services",
    "Gas and vapour services",
    "Erosional and high-velocity services",
    "High-velocity C values and solids services",
  ];
  const originalFile = "/methodology-references/nrep-design-basis-tp-1zzza-pr-bod-0001-d4.pdf";

  return (
    <section className="criteria-reference">
      <div className="criteria-reference-heading">
        <div>
          <span className="eyebrow">Sizing reference</span>
          <h2>NREP Design Basis D4 - line sizing criteria</h2>
          <p>
            TP-1ZZZA-PR-BOD-0001_D4, Section 8.11 (pages 54-57), provided for
            audit and engineering reference. The active Technip / NRL screening
            checks in FlowSure use this revision.
          </p>
        </div>
        <a className="criteria-download" href={originalFile} download="NREP-Design-Basis-TP-1ZZZA-PR-BOD-0001_D4.pdf">Download D4 extract</a>
      </div>
      <div className="nrep-criteria-grid">
        {pages.map((title, index) => {
          const page = index + 1;
          const zoom = zoomByPage[page] ?? 1;
          const image = `/methodology-references/nrep-line-sizing-criteria-page-${page}.png`;
          const updateZoom = (change: number) => setZoomByPage((current) => ({
            ...current,
            [page]: Math.min(2.5, Math.max(0.75, zoom + change)),
          }));

          return (
            <figure key={title}>
              <div className="pressure-drop-chart-actions">
                <button type="button" onClick={() => updateZoom(-0.25)} disabled={zoom <= 0.75} aria-label={`Zoom out page ${page}`} title="Zoom out">−</button>
                <span aria-live="polite">{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => updateZoom(0.25)} disabled={zoom >= 2.5} aria-label={`Zoom in page ${page}`} title="Zoom in">+</button>
                <a href={image} download={`nrep-line-sizing-criteria-page-${page}.png`} title="Download page image">Download</a>
              </div>
              <div className="pressure-drop-chart-image" tabIndex={0} aria-label={`${title}; scroll to pan when zoomed`}>
              <img src={image} alt={`NREP Design Basis D4, Section 8.11 page ${page}: ${title}`} loading="lazy" style={{ transform: `scale(${zoom})` }} />
              </div>
              <figcaption>Page {page} - {title}</figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}

function VelocityReferenceChart() {
  const [zoom, setZoom] = useState(1);
  const image = "/methodology-references/recommended-velocity-piping-handbook.png";

  return (
    <section className="velocity-reference">
      <span className="eyebrow">Velocity reference</span>
      <h2>Recommended design velocities</h2>
      <p>
        This Piping Handbook table is a supplementary visual reference for
        selecting a preliminary velocity range. FlowSure still checks the
        configured refinery design-basis criteria when sizing a line.
      </p>
      <figure className="velocity-reference-chart">
        <div className="pressure-drop-chart-actions">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))} disabled={zoom <= 0.75} aria-label="Zoom out recommended design velocities" title="Zoom out">−</button>
          <span aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((value) => Math.min(2.5, value + 0.25))} disabled={zoom >= 2.5} aria-label="Zoom in recommended design velocities" title="Zoom in">+</button>
          <a href={image} download="flowsure-recommended-design-velocities.png" title="Download chart">Download</a>
        </div>
        <div className="pressure-drop-chart-image" tabIndex={0} aria-label="Recommended design velocities; scroll to pan when zoomed">
          <img src={image} alt="Piping Handbook table of recommended design velocities for pipelines" loading="lazy" style={{ transform: `scale(${zoom})` }} />
        </div>
        <figcaption>Recommended velocity - Piping Handbook</figcaption>
      </figure>
    </section>
  );
}

function PressureDropReferenceCharts() {
  const [zoomByChart, setZoomByChart] = useState<Record<string, number>>({});
  const charts = [
    {
      title: "Water",
      image: "/methodology-references/pressure-drop-water.png",
      alt: "Pressure-drop reference chart for water flow in straight pipes",
    },
    {
      title: "Air and gas pipe lines",
      image: "/methodology-references/pressure-drop-air-gas.png",
      alt: "Pressure-drop reference chart for air and gas pipe lines",
    },
    {
      title: "Steam lines",
      image: "/methodology-references/pressure-drop-steam.png",
      alt: "Pressure-drop reference chart for steam lines",
    },
  ];

  return (
    <section className="pressure-drop-reference">
      <span className="eyebrow">Reference charts</span>
      <h2>Pressure-drop charts</h2>
      <p>
        These visual charts are reproduced from the three supplied project
        documents for preliminary engineering reference. They do not replace
        the entered FlowSure calculation or the approved project design basis.
      </p>
      <div className="pressure-drop-chart-grid">
        {charts.map((chart) => {
          const zoom = zoomByChart[chart.title] ?? 1;
          const updateZoom = (change: number) => {
            setZoomByChart((current) => ({
              ...current,
              [chart.title]: Math.min(2.5, Math.max(0.75, zoom + change)),
            }));
          };

          return (
            <figure key={chart.title}>
              <div className="pressure-drop-chart-actions">
                <button type="button" onClick={() => updateZoom(-0.25)} disabled={zoom <= 0.75} aria-label={`Zoom out ${chart.title}`} title="Zoom out">−</button>
                <span aria-live="polite">{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => updateZoom(0.25)} disabled={zoom >= 2.5} aria-label={`Zoom in ${chart.title}`} title="Zoom in">+</button>
                <a href={chart.image} download={`flowsure-${chart.title.toLowerCase().replaceAll(" ", "-")}-pressure-drop-chart.png`} title="Download chart">Download</a>
              </div>
              <div className="pressure-drop-chart-image" tabIndex={0} aria-label={`${chart.title}; scroll to pan when zoomed`}>
                <img src={chart.image} alt={chart.alt} loading="lazy" style={{ transform: `scale(${zoom})` }} />
              </div>
              <figcaption>{chart.title}</figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}
type EquationSymbol = readonly [symbol: string, meaning: string];

function equationSymbols(formula: string): EquationSymbol[] {
  if (formula === "A = piD2 / 4") return [["A", "Internal flow area (m²)"], ["π", "Mathematical constant, pi"], ["D", "Internal pipe diameter (m)"]];
  if (formula === "V = Q / A") return [["V", "Average fluid velocity (m/s)"], ["Q", "Volumetric flow rate (m³/s)"], ["A", "Internal flow area (m²)"]];
  if (formula === "Re = rhoVD / mu") return [["Re", "Reynolds number (dimensionless)"], ["ρ", "Fluid density (kg/m³)"], ["V", "Average velocity (m/s)"], ["D", "Internal pipe diameter (m)"], ["μ", "Dynamic viscosity (Pa·s)"]];
  if (formula.startsWith("Laminar:")) return [["f", "Darcy friction factor (dimensionless)"], ["Re", "Reynolds number (dimensionless)"], ["ε", "Absolute pipe roughness (m)"], ["D", "Internal pipe diameter (m)"]];
  if (formula === "DeltaP_f = f(L / D)(rhoV2 / 2)") return [["ΔP_f", "Straight-pipe friction loss (Pa)"], ["f", "Darcy friction factor"], ["L", "Pipe length (m)"], ["D", "Internal pipe diameter (m)"], ["ρ", "Fluid density (kg/m³)"], ["V", "Average velocity (m/s)"]];
  if (formula === "DeltaP_m = K(rhoV2 / 2) + DeltaP_equipment") return [["ΔP_m", "Fittings and equipment loss (Pa)"], ["K", "Total fittings loss coefficient"], ["ρ", "Fluid density (kg/m³)"], ["V", "Average velocity (m/s)"], ["ΔP_equipment", "Entered equipment pressure loss (Pa)"]];
  if (formula === "DeltaP_s = rhogDeltaz") return [["ΔP_s", "Static elevation pressure change (Pa)"], ["ρ", "Fluid density (kg/m³)"], ["g", "Acceleration due to gravity (m/s²)"], ["Δz", "Elevation change; positive uphill (m)"]];
  if (formula === "DeltaP_total = DeltaP_f + DeltaP_m + DeltaP_s") return [["ΔP_total", "Total segment pressure change (Pa)"], ["ΔP_f", "Straight-pipe friction loss"], ["ΔP_m", "Fittings and equipment loss"], ["ΔP_s", "Static elevation pressure change"]];
  if (formula === "rho = PM / (ZRT)") return [["ρ", "Gas density (kg/m³)"], ["P", "Absolute pressure (Pa)"], ["M", "Molecular weight (kg/kmol)"], ["Z", "Gas compressibility factor"], ["R", "Universal gas constant"], ["T", "Absolute temperature (K)"]];
  if (formula.startsWith("P_out")) return [["P_out", "Calculated outlet absolute pressure (Pa)"], ["P_in", "Segment inlet absolute pressure (Pa)"], ["ΔP_f", "Friction loss"], ["ΔP_m", "Fittings and equipment loss"], ["ΔP_s", "Static elevation pressure change"]];
  if (formula.startsWith("a =")) return [["a", "Speed of sound in gas (m/s)"], ["Z", "Gas compressibility factor"], ["R", "Universal gas constant"], ["T", "Absolute temperature (K)"], ["M", "Molecular weight (kg/kmol)"], ["Ma", "Mach number"], ["V", "Gas velocity (m/s)"], ["1.3", "Screening heat-capacity-ratio assumption"]];
  if (formula.startsWith("V_sl")) return [["V_sl", "Superficial liquid velocity (m/s)"], ["Q_l", "Liquid volumetric flow rate (m³/s)"], ["V_sg", "Superficial gas velocity (m/s)"], ["Q_g", "Gas volumetric flow rate (m³/s)"], ["A", "Internal flow area (m²)"], ["λ", "No-slip liquid fraction"]];
  if (formula.startsWith("N_Fr")) return [["N_Fr", "Froude number (dimensionless)"], ["V_m", "Mixture velocity (m/s)"], ["g", "Acceleration due to gravity (m/s²)"], ["D", "Internal pipe diameter (m)"]];
  if (formula.startsWith("DeltaP_total = (")) return [["ΔP_total", "Total two-phase pressure loss (Pa)"], ["ΔP_f", "Two-phase friction loss"], ["ΔP_s", "Static elevation pressure change"], ["ΔP_m", "Fittings and equipment loss"], ["E_k", "Two-phase acceleration correction factor"]];
  if (formula.startsWith("NPSHa")) return [["NPSHa", "Net positive suction head available (m)"], ["P_atm", "Atmospheric absolute pressure (Pa)"], ["P_vap", "Liquid vapour pressure, absolute (Pa)"], ["ΔP_suction", "Suction-line pressure loss (Pa)"], ["ρ", "Liquid density (kg/m³)"], ["g", "Acceleration due to gravity (m/s²)"], ["H_static", "Static suction head (m)"]];
  if (formula.startsWith("Margin")) return [["Margin", "NPSH margin (m)"], ["NPSHa", "NPSH available (m)"], ["NPSHr", "Pump NPSH required from vendor curve (m)"]];
  return [];
}

function MethodCard({
  title,
  formula,
  description,
  example,
}: {
  title: string;
  formula: string;
  description: string;
  example: string;
}) {
  const isPressureDependentTwoPhase =
    formula.startsWith("V_sl") || formula.startsWith("DeltaP_total = (");
  const symbols = equationSymbols(formula);
  return (
    <article
      className={`method-card${formula.startsWith("NPSH") || formula.startsWith("Margin") ? " npsh-card" : ""}`}
    >
      <div className="method-formula">
        <span>Formula</span>
        <FormulaDisplay formula={formula} />
        <div className="equation-symbols" aria-label="Equation symbols">
          <strong>Symbols</strong>
          {symbols.map(([symbol, meaning]) => <div key={symbol}><b>{symbol}</b><span>{meaning}</span></div>)}
        </div>
      </div>
      <div>
        <h3>{title}</h3>
        <DescriptionDisplay formula={formula} fallback={description} />
        {isPressureDependentTwoPhase && (
          <p>
            <strong>Current app behaviour:</strong> gas density and actual gas
            volume are recalculated at average segment pressure until outlet
            pressure converges. The phase split, liquid properties, Z and
            temperature remain fixed; flashing and condensation require separate
            PVT/flash review.
          </p>
        )}
        <div className="method-example">
          <strong>Worked example</strong>
          <ExampleDisplay formula={formula} fallback={example} />
        </div>
      </div>
    </article>
  );
}
function Fraction({
  top,
  bottom,
}: {
  top: React.ReactNode;
  bottom: React.ReactNode;
}) {
  return (
    <span className="fraction">
      <span>{top}</span>
      <span>{bottom}</span>
    </span>
  );
}
function FormulaDisplay({ formula }: { formula: string }) {
  const isCompact = formula.startsWith("NPSH") || formula.startsWith("Margin");
  const f = (content: React.ReactNode) => (
    <div className={`equation${isCompact ? " compact" : ""}`}>{content}</div>
  );
  switch (formula) {
    case "A = piD2 / 4":
      return f(
        <>
          A ={" "}
          <Fraction
            top={
              <>
                πD<sup>2</sup>
              </>
            }
            bottom="4"
          />
        </>,
      );
    case "V = Q / A":
      return f(
        <>
          V = <Fraction top="Q" bottom="A" />
        </>,
      );
    case "Re = rhoVD / mu":
      return f(
        <>
          Re = <Fraction top={<>ρVD</>} bottom="μ" />
        </>,
      );
    case "Laminar: f = 64 / Re; turbulent: Colebrook-White iteration":
      return f(
        <div className="equation-stack">
          <span>
            <small>Laminar:</small> f = <Fraction top="64" bottom="Re" />
          </span>
          <span>
            <small>Turbulent:</small> <Fraction top="1" bottom={<>√f</>} /> = −2
            log<sub>10</sub>
            <span className="bracket">(</span>
            <Fraction top={<>ε/D</>} bottom="3.7" /> +{" "}
            <Fraction top="2.51" bottom={<>Re√f</>} />
            <span className="bracket">)</span>
          </span>
        </div>,
      );
    case "DeltaP_f = f(L / D)(rhoV2 / 2)":
      return f(
        <>
          ΔP<sub>f</sub> = f <Fraction top="L" bottom="D" />{" "}
          <Fraction
            top={
              <>
                ρV<sup>2</sup>
              </>
            }
            bottom="2"
          />
        </>,
      );
    case "DeltaP_m = K(rhoV2 / 2) + DeltaP_equipment":
      return f(
        <>
          ΔP<sub>m</sub> = K{" "}
          <Fraction
            top={
              <>
                ρV<sup>2</sup>
              </>
            }
            bottom="2"
          />{" "}
          + ΔP<sub>equipment</sub>
        </>,
      );
    case "DeltaP_s = rhogDeltaz":
      return f(
        <>
          ΔP<sub>s</sub> = ρgΔz
        </>,
      );
    case "DeltaP_total = DeltaP_f + DeltaP_m + DeltaP_s":
      return f(
        <>
          ΔP<sub>total</sub> = ΔP<sub>f</sub> + ΔP<sub>m</sub> + ΔP<sub>s</sub>
        </>,
      );
    case "rho = PM / (ZRT)":
      return f(
        <>
          ρ = <Fraction top="PM" bottom="ZRT" />
        </>,
      );
    case "P_out = P_in - [DeltaP_f + DeltaP_m + DeltaP_s]":
      return f(
        <>
          P<sub>out</sub> = P<sub>in</sub> − [ΔP<sub>f</sub> + ΔP<sub>m</sub> +
          ΔP<sub>s</sub>]
        </>,
      );
    case "a = sqrt(1.3ZRT / M); Ma = V / a":
      return f(
        <>
          a ={" "}
          <span className="sqrt">
            <span>
              <Fraction top="1.3ZRT" bottom="M" />
            </span>
          </span>
          <span className="small">; </span>Ma = <Fraction top="V" bottom="a" />
        </>,
      );
    case "V_sl = Q_l/A; V_sg = Q_g/A; lambda = V_sl/(V_sl + V_sg)":
      return f(
        <div className="equation-stack">
          <span>
            V<sub>sl</sub> ={" "}
            <Fraction
              top={
                <>
                  Q<sub>l</sub>
                </>
              }
              bottom="A"
            />
            ;&nbsp; V<sub>sg</sub> ={" "}
            <Fraction
              top={
                <>
                  Q<sub>g</sub>
                </>
              }
              bottom="A"
            />
          </span>
          <span>
            λ ={" "}
            <Fraction
              top={
                <>
                  V<sub>sl</sub>
                </>
              }
              bottom={
                <>
                  V<sub>sl</sub> + V<sub>sg</sub>
                </>
              }
            />
          </span>
        </div>,
      );
    case "N_Fr = V_m2 / (gD)":
      return f(
        <>
          N<sub>Fr</sub> ={" "}
          <Fraction
            top={
              <>
                V<sub>m</sub>
                <sup>2</sup>
              </>
            }
            bottom="gD"
          />
        </>,
      );
    case "DeltaP_total = (DeltaP_f + DeltaP_s + DeltaP_m) / (1 - E_k)":
      return f(
        <>
          ΔP<sub>total</sub> ={" "}
          <Fraction
            top={
              <>
                ΔP<sub>f</sub> + ΔP<sub>s</sub> + ΔP<sub>m</sub>
              </>
            }
            bottom={
              <>
                1 − E<sub>k</sub>
              </>
            }
          />
        </>,
      );
    case "NPSHa = (P_atm - P_vap - DeltaP_suction)/(rhog) + H_static":
      return f(
        <>
          NPSH<sub>a</sub> ={" "}
          <Fraction
            top={
              <>
                P<sub>atm</sub> − P<sub>vap</sub> − ΔP<sub>suction</sub>
              </>
            }
            bottom="ρg"
          />{" "}
          + H<sub>static</sub>
        </>,
      );
    case "Margin = NPSHa - NPSHr":
      return f(
        <>
          Margin = NPSH<sub>a</sub> − NPSH<sub>r</sub>
        </>,
      );
    default:
      return f(formula);
  }
}
function DescriptionDisplay({
  formula,
  fallback,
}: {
  formula: string;
  fallback: string;
}) {
  if (formula.startsWith("NPSHa"))
    return (
      <p>
        Only segments marked <strong>Pump suction</strong> contribute to suction
        loss. P<sub>atm</sub> and P<sub>vap</sub> must be absolute pressures; H
        <sub>static</sub> is positive for flooded suction.
      </p>
    );
  if (formula.startsWith("Margin"))
    return (
      <p>
        A negative margin means the available NPSH is below the pump
        requirement. NPSH<sub>r</sub> must come from the vendor curve at the
        actual operating flow and speed.
      </p>
    );
  return <p>{fallback}</p>;
}
function ExampleDisplay({
  formula,
  fallback,
}: {
  formula: string;
  fallback: string;
}) {
  const e = (content: React.ReactNode) => (
    <div className="example-equation">{content}</div>
  );
  switch (formula) {
    case "A = piD2 / 4":
      return e(
        <>
          A ={" "}
          <Fraction
            top={
              <>
                π(0.200)<sup>2</sup>
              </>
            }
            bottom="4"
          />{" "}
          ={" "}
          <b>
            0.0314 m<sup>2</sup>
          </b>
        </>,
      );
    case "V = Q / A":
      return e(
        <>
          V = <Fraction top="0.050" bottom="0.0314" /> = <b>1.59 m/s</b>
        </>,
      );
    case "Re = rhoVD / mu":
      return e(
        <>
          Re = <Fraction top={<>1,000 × 1.59 × 0.200</>} bottom="0.001" /> ={" "}
          <b>318,000</b> <em>Turbulent</em>
        </>,
      );
    case "Laminar: f = 64 / Re; turbulent: Colebrook-White iteration":
      return e(
        <>
          Re = 318,000; commercial steel → <b>f ≈ 0.016</b>
        </>,
      );
    case "DeltaP_f = f(L / D)(rhoV2 / 2)":
      return e(
        <>
          ΔP<sub>f</sub> = 0.016 × <Fraction top="100" bottom="0.200" /> ×{" "}
          <Fraction
            top={
              <>
                1,000(1.59)<sup>2</sup>
              </>
            }
            bottom="2"
          />{" "}
          = <b>10.1 kPa = 0.103 kg/cm²</b>
        </>,
      );
    case "DeltaP_m = K(rhoV2 / 2) + DeltaP_equipment":
      return e(
        <>
          ΔP<sub>m</sub> = 3 × 1.27 = <b>3.80 kPa</b>
        </>,
      );
    case "DeltaP_s = rhogDeltaz":
      return e(
        <>
          ΔP<sub>s</sub> = 1,000 × 9.80665 × 5 = <b>49.0 kPa = 0.500 kg/cm²</b>
        </>,
      );
    case "DeltaP_total = DeltaP_f + DeltaP_m + DeltaP_s":
      return e(
        <>
          ΔP<sub>total</sub> = 0.103 + 0.039 + 0.500 = <b>0.642 kg/cm²</b>
        </>,
      );
    case "rho = PM / (ZRT)":
      return e(
        <>
          ρ ={" "}
          <Fraction
            top={<>500,000 × 28.97</>}
            bottom={<>1.00 × 8,314 × 300</>}
          />{" "}
          ={" "}
          <b>
            5.81 kg/m<sup>3</sup>
          </b>
        </>,
      );
    case "P_out = P_in - [DeltaP_f + DeltaP_m + DeltaP_s]":
      return e(
        <>
          P<sub>out,new</sub> = 479,999 Pa(a); |ΔP| = 1 Pa → <b>converged</b>
        </>,
      );
    case "a = sqrt(1.3ZRT / M); Ma = V / a":
      return e(
        <>
          a ≈ 347 m/s;&nbsp; Ma = <Fraction top="70" bottom="347" /> ={" "}
          <b>0.20</b>
        </>,
      );
    case "V_sl = Q_l/A; V_sg = Q_g/A; lambda = V_sl/(V_sl + V_sg)":
      return e(
        <>
          λ = <Fraction top="0.40" bottom={<>0.40 + 0.20</>} /> = <b>0.667</b>
        </>,
      );
    case "N_Fr = V_m2 / (gD)":
      return e(
        <>
          N<sub>Fr</sub> ={" "}
          <Fraction
            top={
              <>
                (0.60)<sup>2</sup>
              </>
            }
            bottom={<>9.80665 × 0.100</>}
          />{" "}
          = <b>0.367</b>
        </>,
      );
    case "DeltaP_total = (DeltaP_f + DeltaP_s + DeltaP_m) / (1 - E_k)":
      return e(
        <>
          ΔP<sub>total</sub> = <Fraction top="20" bottom={<>1 − 0.05</>} /> ={" "}
          <b>21.1 kPa</b>
        </>,
      );
    case "NPSHa = (P_atm - P_vap - DeltaP_suction)/(rhog) + H_static":
      return e(
        <>
          NPSH<sub>a</sub> ={" "}
          <Fraction
            top={<>(101.3 − 2.34 − 14.0) × 1,000</>}
            bottom={<>1,000 × 9.80665</>}
          />{" "}
          + 5 = <b>13.7 m</b>
        </>,
      );
    case "Margin = NPSHa - NPSHr":
      return e(
        <>
          Margin = 13.7 − 3.0 = <b>10.7 m</b>
        </>,
      );
    default:
      return <span>{fallback}</span>;
  }
}
function GuidedLearningExample({ onLoad }: { onLoad: () => void }) {
  const learningCase = useMemo(() => genericLearningProject(), []);
  const learningResult = useMemo(() => calculateProject(learningCase), [learningCase]);
  const segment = learningResult.segments[0];

  return (
    <section className="learning-example">
      <span className="eyebrow">Guided example</span>
      <h2>First calculation: generic liquid transfer line</h2>
      <p>
        Use this short case to learn where inputs go and how to read the output.
        It is illustrative only; do not use these values for a real line.
      </p>
      <div className="learning-steps">
        <article><b>1</b><div><strong>Select the service</strong><span>Liquid flow, Generic screening basis, General liquid service.</span></div></article>
        <article><b>2</b><div><strong>Enter fluid and operating data</strong><span>72.00 m³/h; 4.00 kg/cm²(g); 30.00 °C; density 1,000 kg/m³; viscosity 1.00 cP.</span></div></article>
        <article><b>3</b><div><strong>Add one simple segment</strong><span>100 m length; 154 mm inside diameter; 0 m elevation; fittings K = 2; roughness 0.045 mm.</span></div></article>
        <article><b>4</b><div><strong>Calculate and review</strong><span>Check velocity first, then total pressure loss and outlet pressure. Review warnings before accepting any result.</span></div></article>
      </div>
      <div className="learning-result">
        <div><span>Expected method</span><strong>{learningResult.method}</strong></div>
        <div><span>Velocity</span><strong>{segment?.velocityMS.toFixed(2) ?? "—"} m/s</strong></div>
        <div><span>Total pressure loss</span><strong>{paToKgCm2(learningResult.totalPressureLossPa).toFixed(2)} kg/cm²</strong></div>
        <div><span>Outlet pressure</span><strong>{absolutePaToKgCm2G(learningResult.outletPressurePaA, learningCase.atmosphericPressurePaA).toFixed(2)} kg/cm²(g)</strong></div>
      </div>
      <div className="learning-actions">
        <button className="primary" onClick={onLoad}>Load this example in Calculator</button>
        <small>After loading, change one input at a time and use Calculate / Update results to see its effect.</small>
      </div>
    </section>
  );
}

function engineeringReviewCategory(code: string) {
  if (code.includes("NPSH")) return "Pump suction";
  if (code.includes("VELOCITY")) return "Velocity criterion";
  if (code.includes("PRESSURE_GRADIENT") || code.includes("PRESSURE_DROP")) return "Pressure-drop criterion";
  if (code.includes("MOMENTUM")) return "Momentum / erosion";
  if (code.includes("STEAM")) return "Steam screening";
  if (code.includes("TWO_PHASE")) return "Two-phase screening";
  if (code.includes("LOW_PRESSURE")) return "Pressure safeguard";
  if (code.includes("REQUIRED_PRESSURE")) return "Required outlet pressure";
  if (code.includes("INVALID")) return "Input validation";
  return "Hydraulic screening";
}

function EngineeringReview({ warnings }: { warnings: CalculationResult["warnings"] }) {
  const rows = warnings.length === 0
    ? [{ code: "AUTOMATIC_CHECKS", severity: "info" as const, message: "No automatic warnings were found. Continue with independent engineering review before using the result." }]
    : warnings;

  return (
    <section className="engineering-review-register" aria-label="Engineering review">
      <div className="engineering-review-head">
        <div>
          <span className="review-step" aria-label="Step 5">05</span>
          <h3>Checks and warnings</h3>
        </div>
        <span className="review-badge">Engineering review</span>
      </div>
      <div className="engineering-review-table-wrap">
        <table className="engineering-review-table">
          <thead>
            <tr><th>Category</th><th>Assessment</th><th>Status</th><th>Remarks / action</th></tr>
          </thead>
          <tbody>
            {rows.map((warning, index) => {
              const isPass = warning.severity === "info";
              const status = isPass ? "Pass" : warning.severity === "critical" ? "Review required" : "Warning";
              return <tr key={`${warning.code}-${index}`}>
                <td>{isPass ? "Screening result" : engineeringReviewCategory(warning.code)}</td>
                <td>{isPass ? "Automatic checks" : warning.code.replaceAll("_", " ")}</td>
                <td><span className={`review-status ${warning.severity}`}><i aria-hidden="true" />{status}</span></td>
                <td>{warning.message}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function safeCalculate(project: Project): CalculationResult {
  const checked = validateProject(project);
  if (checked.valid) return calculateProject(checked.project);
  return {
    method: "Input validation required",
    totalPressureLossPa: 0,
    outletPressurePaA: project.inletPressurePaA || 0,
    converged: false,
    segments: [],
    warnings: checked.errors.map((message) => ({
      severity: "critical",
      code: "INVALID_INPUT",
      message,
    })),
  };
}

export default App;
