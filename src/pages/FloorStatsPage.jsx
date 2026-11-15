import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
import { getDailyStatsRange, getFactoryBeams, getFactoryMachines } from "../services/factoryData";
import { getFactoryFloors, getFloorForMachine, getMachineTakaCounts } from "../services/floors";
import { resolveReportRange, toDateKey, toMonthKey } from "../utils/date";
import { aggregateDailyStats } from "../utils/stats";
import { formatNumber, formatPercent } from "../utils/format";

const ALL = "__all__";
const UNASSIGNED = "__unassigned__";

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

const meterFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
function formatMeters2(value) {
  return meterFormatter.format(Number(value) || 0);
}

function isOpenBeam(beam) {
  return beam.isActive === true && (beam.endDate === null || typeof beam.endDate === "undefined");
}

function buildMachineRows(machines, beams, floors, periodMachineMap, takaCounts = {}) {
  const beamsByMachine = new Map();

  beams.forEach((beam) => {
    const number = Number(beam.machineNumber);
    if (!beamsByMachine.has(number)) beamsByMachine.set(number, []);
    beamsByMachine.get(number).push(beam);
  });

  return machines.map((machine) => {
    const number = Number(machine.machineNumber);
    const machineBeams = beamsByMachine.get(number) || [];
    // Beams are already sorted newest-first per machine by getFactoryBeams.
    const activeBeam =
      machineBeams.find((beam) => isOpenBeam(beam) && (!beam.machineId || beam.machineId === machine.id)) ||
      null;
    const beamTotal = Number(activeBeam?.totalMeters) || 0;
    const beamProduced = Number(activeBeam?.producedMeters) || 0;
    // Beam remaining = beam total - meters produced on this beam (rounded to 2 decimals).
    const remaining = activeBeam ? round2(Math.max(beamTotal - beamProduced, 0)) : 0;
    const floor = getFloorForMachine(floors, number);

    return {
      machineNumber: number,
      floorId: floor?.id || UNASSIGNED,
      floorName: floor?.name || "Unassigned",
      beamNo: activeBeam?.beamNo || "",
      beamTotal,
      remaining,
      // Remaining % = beam remaining / beam total * 100
      remainingPercent: beamTotal > 0 ? (remaining / beamTotal) * 100 : 0,
      hasBeam: Boolean(activeBeam),
      producedMeters: Number(periodMachineMap?.[number]) || 0,
      takas: Number(takaCounts?.[number]) || 0,
    };
  });
}

function summarize(rows) {
  return rows.reduce(
    (summary, row) => {
      summary.machines += 1;
      summary.activeBeams += row.hasBeam ? 1 : 0;
      summary.beamTotal += row.beamTotal;
      summary.remaining = round2(summary.remaining + row.remaining);
      summary.producedMeters += row.producedMeters;
      summary.takas += row.takas;
      return summary;
    },
    { machines: 0, activeBeams: 0, beamTotal: 0, remaining: 0, producedMeters: 0, takas: 0 },
  );
}

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

function FloorSummaryCard({ title, summary, active, onClick, accent = false }) {
  return (
    <button
      type="button"
      className={`floor-card ${active ? "floor-card--active" : ""} ${accent ? "floor-card--accent" : ""}`.trim()}
      onClick={onClick}
      aria-pressed={active}
    >
      <div className="floor-card__head">
        <strong>{title}</strong>
        <span className="badge">{summary.machines} machines</span>
      </div>
      <div className="floor-card__grid">
        <div>
          <span>Active beams</span>
          <strong>{summary.activeBeams}</strong>
        </div>
        <div>
          <span>Beam meters left</span>
          <strong>{formatMeters2(summary.remaining)} m</strong>
        </div>
        <div>
          <span>Produced meters</span>
          <strong>{formatNumber(summary.producedMeters)} m</strong>
        </div>
        <div>
          <span>Takas</span>
          <strong>{formatNumber(summary.takas)}</strong>
        </div>
      </div>
    </button>
  );
}

export default function FloorStatsPage() {
  const { factoryId } = useFactory();
  const { showToast } = useToast();
  const loadSeq = useRef(0);
  const [dateMode, setDateMode] = useState("month");
  const [singleDay, setSingleDay] = useState(toDateKey());
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [monthSelect, setMonthSelect] = useState(toMonthKey());
  const [period, setPeriod] = useState(() => resolveReportRange("month", "", "", "", toMonthKey()));
  const [periodError, setPeriodError] = useState("");
  const [selectedFloor, setSelectedFloor] = useState(ALL);
  const [floors, setFloors] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (force = false) => {
      const id = ++loadSeq.current;
      setLoading(true);
      setError("");

      try {
        const [machines, beams, nextFloors, dailyStats, takaCounts] = await Promise.all([
          getFactoryMachines(factoryId, { force }),
          getFactoryBeams(factoryId, { force }),
          getFactoryFloors(factoryId, { force }),
          getDailyStatsRange(factoryId, period.startKey, period.endKey, { force }),
          getMachineTakaCounts(factoryId, period.startKey, period.endKey),
        ]);
        const periodTotals = aggregateDailyStats(dailyStats || []);

        if (loadSeq.current !== id) return;

        setFloors(nextFloors);
        setRows(buildMachineRows(machines || [], beams || [], nextFloors, periodTotals.machineMap, takaCounts));
      } catch (loadError) {
        console.error("Floor stats load failed:", loadError);
        if (loadSeq.current === id) {
          setError("Floor stats could not be loaded. Check your connection and try again.");
        }
      } finally {
        if (loadSeq.current === id) setLoading(false);
      }
    },
    [factoryId, period.startKey, period.endKey],
  );

  useEffect(() => {
    if (factoryId) load();
  }, [factoryId, load]);

  const floorSummaries = useMemo(
    () =>
      floors.map((floor) => ({
        floor,
        summary: summarize(rows.filter((row) => row.floorId === floor.id)),
      })),
    [floors, rows],
  );

  const unassignedRows = useMemo(() => rows.filter((row) => row.floorId === UNASSIGNED), [rows]);
  const allSummary = useMemo(() => summarize(rows), [rows]);

  const visibleRows = useMemo(() => {
    if (selectedFloor === ALL) return rows;
    return rows.filter((row) => row.floorId === selectedFloor);
  }, [rows, selectedFloor]);

  const visibleSummary = useMemo(() => summarize(visibleRows), [visibleRows]);
  const showFloorColumn = selectedFloor === ALL;
  const selectedLabel =
    selectedFloor === ALL
      ? "All floors"
      : selectedFloor === UNASSIGNED
        ? "Unassigned machines"
        : floors.find((floor) => floor.id === selectedFloor)?.name || "Floor";
  const periodLabel = period.label;

  function applyPeriod() {
    const next = resolveReportRange(dateMode, singleDay, fromDate, toDate, monthSelect);

    if (!next.startKey || !next.endKey) {
      setPeriodError("Choose a valid day, date range, or month.");
      return;
    }

    if (next.startKey > next.endKey) {
      setPeriodError("'From' date must be on or before the 'To' date.");
      return;
    }

    setPeriodError("");
    if (next.startKey === period.startKey && next.endKey === period.endKey) {
      load(true);
    } else {
      setPeriod(next);
    }
  }

  function handleExport() {
    if (!visibleRows.length) {
      showToast({ tone: "warning", message: "Nothing to export yet." });
      return;
    }

    const header = [
      "Floor",
      "Machine",
      "Beam No",
      "Beam Total (m)",
      `Produced Meters - ${periodLabel} (m)`,
      "Takas",
      "Remaining in Beam (m)",
      "Remaining %",
    ];
    const body = visibleRows.map((row) => [
      row.floorName,
      row.machineNumber,
      row.beamNo || "-",
      row.beamTotal,
      row.producedMeters,
      row.takas,
      row.remaining,
      row.hasBeam ? row.remainingPercent.toFixed(2) : "-",
    ]);
    const footer = [
      "TOTAL",
      `${visibleSummary.machines} machines`,
      `${visibleSummary.activeBeams} active`,
      visibleSummary.beamTotal,
      visibleSummary.producedMeters,
      visibleSummary.takas,
      visibleSummary.remaining,
      visibleSummary.beamTotal > 0
        ? ((visibleSummary.remaining / visibleSummary.beamTotal) * 100).toFixed(2)
        : "-",
    ];

    const filename = `floor_stats_${selectedLabel.replace(/\s+/g, "_").toLowerCase()}_${period.startKey}_to_${period.endKey}.csv`;
    downloadCsv(filename, [header, ...body, footer]);
    showToast({ tone: "success", message: `Download started: ${filename}` });
  }

  return (
    <>
      <PageHeader
        eyebrow="Stats"
        title="Floor stats"
        subtitle="Per floor, per machine: the current beam, meters produced in the chosen period, and meters left on the beam, with an all-floors total."
        actions={
          <Button type="button" variant="secondary" onClick={handleExport} disabled={!visibleRows.length}>
            Export CSV
          </Button>
        }
      />

      {error ? (
        <ErrorCallout onRetry={() => load(true)} retryLabel="Retry loading floor stats">
          {error}
        </ErrorCallout>
      ) : null}

      {!loading && !floors.length ? (
        <PageCard>
          <EmptyState
            title="No floors set up yet"
            description="Set which machines are on each floor first. Until then all machines show as Unassigned."
            action={
              <Link to="/floors" className="button button--primary button--small">
                Set up floors
              </Link>
            }
          />
        </PageCard>
      ) : null}

      <PageCard>
        <SectionIntro
          eyebrow="Overview"
          title="Floors at a glance"
          description={`Showing production for ${periodLabel}. Click a floor to see its machines below.`}
          actions={
            <div className="floor-toolbar">
              <FormField label="Period" htmlFor="floorStatsMode">
                <select
                  id="floorStatsMode"
                  value={dateMode}
                  onChange={(event) => setDateMode(event.target.value)}
                >
                  <option value="day">Single Day</option>
                  <option value="range">Date Range</option>
                  <option value="month">Month</option>
                </select>
              </FormField>

              {dateMode === "day" ? (
                <FormField label="Date" htmlFor="floorStatsDay">
                  <input
                    id="floorStatsDay"
                    type="date"
                    value={singleDay}
                    onChange={(event) => setSingleDay(event.target.value)}
                  />
                </FormField>
              ) : null}

              {dateMode === "range" ? (
                <>
                  <FormField label="From" htmlFor="floorStatsFrom">
                    <input
                      id="floorStatsFrom"
                      type="date"
                      value={fromDate}
                      onChange={(event) => setFromDate(event.target.value)}
                    />
                  </FormField>
                  <FormField label="To" htmlFor="floorStatsTo">
                    <input
                      id="floorStatsTo"
                      type="date"
                      value={toDate}
                      onChange={(event) => setToDate(event.target.value)}
                    />
                  </FormField>
                </>
              ) : null}

              {dateMode === "month" ? (
                <FormField label="Month" htmlFor="floorStatsMonth">
                  <input
                    id="floorStatsMonth"
                    type="month"
                    value={monthSelect}
                    onChange={(event) => setMonthSelect(event.target.value)}
                  />
                </FormField>
              ) : null}

              <Button type="button" loading={loading} onClick={applyPeriod}>
                Show Stats
              </Button>
            </div>
          }
        />

        <div className="floor-card-grid">
          <FloorSummaryCard
            title="All floors"
            summary={allSummary}
            active={selectedFloor === ALL}
            onClick={() => setSelectedFloor(ALL)}
            accent
          />
          {floorSummaries.map(({ floor, summary }) => (
            <FloorSummaryCard
              key={floor.id}
              title={`${floor.name} (M${floor.from}-${floor.to})`}
              summary={summary}
              active={selectedFloor === floor.id}
              onClick={() => setSelectedFloor(floor.id)}
            />
          ))}
          {unassignedRows.length && floors.length ? (
            <FloorSummaryCard
              title="Unassigned"
              summary={summarize(unassignedRows)}
              active={selectedFloor === UNASSIGNED}
              onClick={() => setSelectedFloor(UNASSIGNED)}
            />
          ) : null}
        </div>
      </PageCard>

      {periodError ? <StatusMessage tone="error">{periodError}</StatusMessage> : null}

      <PageCard>
        <SectionIntro
          eyebrow={selectedLabel}
          title="Machine-wise detail"
          description={`${visibleSummary.machines} machines, ${visibleSummary.activeBeams} with an active beam. Produced meters are for ${periodLabel}.`}
        />

        {loading ? (
          <TableSkeleton columns={8} rows={10} wrapperClassName="table-scroll--tall" />
        ) : visibleRows.length ? (
          <DataTable wrapperClassName="table-scroll--tall" className="floor-stats-table">
            <thead>
              <tr>
                {showFloorColumn ? <th>Floor</th> : null}
                <th>Machine</th>
                <th>Beam No</th>
                <th>Beam Total</th>
                <th>Produced Meters</th>
                <th>Takas</th>
                <th>Remaining in Beam</th>
                <th>Remaining %</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.machineNumber}>
                  {showFloorColumn ? <td>{row.floorName}</td> : null}
                  <td>{`Machine ${row.machineNumber}`}</td>
                  <td>{row.beamNo || <span className="muted-text">No active beam</span>}</td>
                  <td>{row.hasBeam ? `${formatNumber(row.beamTotal)} m` : "-"}</td>
                  <td>{formatNumber(row.producedMeters)} m</td>
                  <td>{formatNumber(row.takas)}</td>
                  <td>
                    {row.hasBeam ? (
                      <strong className={row.remainingPercent <= 10 ? "trend-text trend-text--danger" : ""}>
                        {formatMeters2(row.remaining)} m
                      </strong>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{row.hasBeam ? formatPercent(row.remainingPercent, 2) : "-"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="floor-stats-table__total">
                {showFloorColumn ? <td>All floors</td> : null}
                <td>{`${visibleSummary.machines} machines`}</td>
                <td>{`${visibleSummary.activeBeams} active`}</td>
                <td>{formatNumber(visibleSummary.beamTotal)} m</td>
                <td>{formatNumber(visibleSummary.producedMeters)} m</td>
                <td>{formatNumber(visibleSummary.takas)}</td>
                <td>{formatMeters2(visibleSummary.remaining)} m</td>
                <td>
                  {visibleSummary.beamTotal > 0
                    ? formatPercent((visibleSummary.remaining / visibleSummary.beamTotal) * 100, 2)
                    : "-"}
                </td>
              </tr>
            </tfoot>
          </DataTable>
        ) : (
          <EmptyState title="No machines" description="There are no machines in this floor range." />
        )}
      </PageCard>
    </>
  );
}
