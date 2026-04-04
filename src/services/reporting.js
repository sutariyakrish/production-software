import { getDailyStatsRange, getFactoryBeams } from "./factoryData";
import { aggregateDailyStats } from "../utils/stats";

export function getReportFilename(type, label = "report") {
  return `${type}_${label.replace(/\s+/g, "_").toLowerCase()}.csv`;
}

function sortMetricRows(metricMap, mapKey) {
  const entries = Object.entries(metricMap || {});

  if (mapKey === "machine") {
    return entries.sort((left, right) => Number(left[0]) - Number(right[0]));
  }

  return entries.sort((left, right) =>
    String(left[0]).localeCompare(String(right[0]), undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

export async function buildReportSnapshot(factoryId, options) {
  const { startKey, endKey, tableType, beamStatusFilter = "active", label = "report" } = options;
  const dailyStats = await getDailyStatsRange(factoryId, startKey, endKey);
  const aggregate = aggregateDailyStats(dailyStats);

  if (tableType === "worker") {
    return {
      columns: ["Worker", "Total Meters"],
      rows: sortMetricRows(aggregate.workerMap).map(([worker, meters]) => [worker, meters]),
      filename: getReportFilename("worker", label),
      totalMeters: aggregate.totalMeters,
      dayCount: dailyStats.length,
    };
  }

  if (tableType === "machine") {
    return {
      columns: ["Machine", "Total Meters"],
      rows: sortMetricRows(aggregate.machineMap, "machine").map(([machine, meters]) => [
        `Machine ${machine}`,
        meters,
      ]),
      filename: getReportFilename("machine", label),
      totalMeters: aggregate.totalMeters,
      dayCount: dailyStats.length,
    };
  }

  if (tableType === "shift") {
    return {
      columns: ["Shift", "Total Meters"],
      rows: [
        ["Day", aggregate.dayShiftMeters],
        ["Night", aggregate.nightShiftMeters],
      ],
      filename: getReportFilename("shift", label),
      totalMeters: aggregate.totalMeters,
      dayCount: dailyStats.length,
    };
  }

  if (tableType === "taka") {
    return {
      columns: ["Taka No", "Total Meters"],
      rows: sortMetricRows(aggregate.takaMap).map(([takaNo, meters]) => [takaNo, meters]),
      filename: getReportFilename("taka", label),
      totalMeters: aggregate.totalMeters,
      dayCount: dailyStats.length,
    };
  }

  const beams = await getFactoryBeams(factoryId);
  const filteredBeams = beams.filter((beam) =>
    beamStatusFilter === "active" ? beam.isActive === true : beam.isActive === false,
  );

  return {
    columns: ["Beam No", "Machine", "Total", "Produced", "Bhidan", "Shortage %"],
    rows: filteredBeams.map((beam) => {
      const produced = aggregate.beamMap[beam.beamNo] || 0;
      const totalMeters = Number(beam.totalMeters) || 0;
      const bhidan = Math.max(totalMeters - produced, 0);
      const shortagePercent = totalMeters > 0 ? ((bhidan / totalMeters) * 100).toFixed(2) : "0.00";

      return [
        beam.beamNo,
        `Machine ${beam.machineNumber}`,
        totalMeters,
        produced,
        bhidan,
        `${shortagePercent}%`,
      ];
    }),
    filename: getReportFilename("beam", label),
    totalMeters: aggregate.totalMeters,
    dayCount: dailyStats.length,
  };
}
