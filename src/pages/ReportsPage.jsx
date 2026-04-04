import { useCallback, useEffect, useRef, useState } from "react";
import Button from "../components/ui/Button";
import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import ErrorCallout from "../components/ui/ErrorCallout";
import FormField from "../components/ui/FormField";
import PageCard from "../components/ui/PageCard";
import PageHeader from "../components/ui/PageHeader";
import SectionIntro from "../components/ui/SectionIntro";
import { TableSkeleton } from "../components/ui/Skeleton";
import StatusMessage from "../components/ui/StatusMessage";
import { useFactory } from "../contexts/FactoryContext";
import { useToast } from "../contexts/ToastContext";
import { buildReportSnapshot } from "../services/reporting";
import { resolveReportRange } from "../utils/date";
import { formatNumber } from "../utils/format";

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { factoryId } = useFactory();
  const { showToast } = useToast();
  const loadSeq = useRef(0);
  const [dateMode, setDateMode] = useState("");
  const [singleDay, setSingleDay] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [monthSelect, setMonthSelect] = useState("");
  const [tableType, setTableType] = useState("worker");
  const [beamStatusFilter, setBeamStatusFilter] = useState("active");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ tone: "neutral", text: "" });
  const [failedRange, setFailedRange] = useState(null);
  const [currentRange, setCurrentRange] = useState(null);
  const [report, setReport] = useState({
    columns: [],
    rows: [],
    filename: "worker_report.csv",
    totalMeters: 0,
    dayCount: 0,
  });

  useEffect(() => {
    setCurrentRange(null);
    setFailedRange(null);
    setMessage({ tone: "neutral", text: "" });
    setReport({
      columns: [],
      rows: [],
      filename: "worker_report.csv",
      totalMeters: 0,
      dayCount: 0,
    });
  }, [factoryId]);

  const loadReport = useCallback(
    async (range, showLoading = true) => {
      if (!factoryId) {
        setMessage({ tone: "error", text: "Select a factory first." });
        return;
      }

      const id = ++loadSeq.current;

      if (showLoading) {
        setLoading(true);
      }

      setMessage({ tone: "neutral", text: "" });
      setFailedRange(null);

      try {
        const nextReport = await buildReportSnapshot(factoryId, {
          startKey: range.startKey,
          endKey: range.endKey,
          tableType,
          beamStatusFilter,
          label: range.label || "report",
        });

        if (loadSeq.current !== id) {
          return;
        }

        setReport(nextReport);
        setCurrentRange(range);
        setFailedRange(null);

        if (!nextReport.rows.length) {
          setMessage({ tone: "neutral", text: "" });
        }
      } catch (error) {
        console.error("Report load failed:", error);
        if (loadSeq.current !== id) {
          return;
        }
        setFailedRange(range);
        setMessage({
          tone: "error",
          text: "Report data could not be loaded. You can retry with the same filters.",
        });
      } finally {
        if (loadSeq.current === id && showLoading) {
          setLoading(false);
        }
      }
    },
    [factoryId, tableType, beamStatusFilter],
  );

  /* Refetch when report shape filters change; omit currentRange from deps to avoid re-running after a successful load. */
  useEffect(() => {
    if (!currentRange?.startKey || !currentRange?.endKey) {
      return;
    }

    loadReport(currentRange, false);
  }, [tableType, beamStatusFilter, loadReport]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional stale currentRange read

  function handleLoadReports() {
    const range = resolveReportRange(dateMode, singleDay, fromDate, toDate, monthSelect);

    if (!range.startKey || !range.endKey) {
      setMessage({ tone: "error", text: "Choose a valid report period first." });
      return;
    }

    loadReport(range);
  }

  function handleExport() {
    if (!report.rows.length) {
      showToast({ tone: "warning", message: "Load a report before exporting." });
      return;
    }

    downloadCsv(report.filename, [report.columns, ...report.rows]);
    showToast({ tone: "success", message: `Download started: ${report.filename}` });
  }

  return (
    <>
      <PageHeader
        eyebrow="Reports"
        title="Aggregated reports"
        subtitle="Generate worker, machine, shift, beam, and taka reports from daily aggregates to keep reporting responsive and low-cost."
        actions={
          <Button type="button" variant="secondary" onClick={handleExport} disabled={!report.rows.length}>
            Export CSV
          </Button>
        }
      />

      {message.text ? <StatusMessage tone={message.tone}>{message.text}</StatusMessage> : null}

      {failedRange ? (
        <ErrorCallout onRetry={() => loadReport(failedRange)} retryLabel="Retry report load">
          {message.tone === "error" && message.text
            ? message.text
            : "Report data could not be loaded."}
        </ErrorCallout>
      ) : null}

      <PageCard>
        <SectionIntro
          eyebrow="Filters"
          title="Report builder"
          description="Pick a time window and report type. Daily and monthly exports now reuse aggregate documents instead of raw production scans."
        />

        <div className="report-toolbar">
          <FormField label="Time Period" htmlFor="dateMode">
            <select id="dateMode" value={dateMode} onChange={(event) => setDateMode(event.target.value)}>
              <option value="">Select Time Period</option>
              <option value="day">Single Day</option>
              <option value="range">Date Range</option>
              <option value="month">Month</option>
            </select>
          </FormField>

          {dateMode === "day" ? (
            <FormField label="Date" htmlFor="singleDay">
              <input
                id="singleDay"
                type="date"
                value={singleDay}
                onChange={(event) => setSingleDay(event.target.value)}
              />
            </FormField>
          ) : null}

          {dateMode === "range" ? (
            <>
              <FormField label="From" htmlFor="fromDate">
                <input
                  id="fromDate"
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              </FormField>

              <FormField label="To" htmlFor="toDate">
                <input
                  id="toDate"
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
              </FormField>
            </>
          ) : null}

          {dateMode === "month" ? (
            <FormField label="Month" htmlFor="monthSelect">
              <input
                id="monthSelect"
                type="month"
                value={monthSelect}
                onChange={(event) => setMonthSelect(event.target.value)}
              />
            </FormField>
          ) : null}

          <FormField label="Report Type" htmlFor="tableType">
            <select id="tableType" value={tableType} onChange={(event) => setTableType(event.target.value)}>
              <option value="worker">Worker-wise</option>
              <option value="machine">Machine-wise</option>
              <option value="shift">Shift-wise</option>
              <option value="beam">Beam-wise</option>
              <option value="taka">Taka-wise</option>
            </select>
          </FormField>

          {tableType === "beam" ? (
            <FormField label="Beam Status" htmlFor="beamStatusFilter">
              <select
                id="beamStatusFilter"
                value={beamStatusFilter}
                onChange={(event) => setBeamStatusFilter(event.target.value)}
              >
                <option value="active">Active Beams</option>
                <option value="inactive">Inactive Beams</option>
              </select>
            </FormField>
          ) : null}

          <div className="report-toolbar__action">
            <Button type="button" loading={loading} onClick={handleLoadReports}>
              Load Report
            </Button>
          </div>
        </div>

        {currentRange ? (
          <div className="report-summary-bar">
            <div className="report-summary-chip">
              <span>Total meters</span>
              <strong>{formatNumber(report.totalMeters)}</strong>
            </div>
            <div className="report-summary-chip">
              <span>Days covered</span>
              <strong>{report.dayCount}</strong>
            </div>
            <div className="report-summary-chip">
              <span>Rows</span>
              <strong>{report.rows.length}</strong>
            </div>
          </div>
        ) : null}

        {loading ? (
          <TableSkeleton
            columns={Math.max(report.columns.length, 6)}
            rows={10}
            wrapperClassName="table-scroll--tall"
          />
        ) : null}

        {!loading && report.rows.length ? (
          <DataTable wrapperClassName="table-scroll--tall">
            <thead>
              <tr>
                {report.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row, rowIndex) => (
                <tr key={`${row[0]}-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${row[0]}-${cellIndex}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : null}

        {!loading && !report.rows.length && currentRange ? (
          <EmptyState
            title="No rows for this period"
            description="Try a different date range or report type, or confirm production data exists for the selected window."
          />
        ) : null}

        {!loading && !report.rows.length && !currentRange && !failedRange ? (
          <EmptyState
            title="Load a report"
            description="Pick a time period and report type, then click Load Report to preview aggregated output."
            action={
              <Button type="button" onClick={handleLoadReports}>
                Load report
              </Button>
            }
          />
        ) : null}
      </PageCard>
    </>
  );
}
