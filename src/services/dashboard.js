import { getPreviousDateKey, getPreviousMonthKey, toDateKey, toMonthKey } from "../utils/date";
import { calculateTrend, getMaxMetricValue, getTopEntries } from "../utils/stats";
import { getDailyStatsDoc, getMonthlyStatsDoc } from "./factoryData";

function buildInsights(todayStats, yesterdayStats, monthStats, previousMonthStats) {
  const todayTrend = calculateTrend(todayStats.totalMeters, yesterdayStats.totalMeters);
  const monthTrend = calculateTrend(monthStats.totalMeters, previousMonthStats.totalMeters);
  const shiftTrend = calculateTrend(todayStats.dayShiftMeters, todayStats.nightShiftMeters);
  const topMachine = getTopEntries(todayStats.machineMap, 1)[0];

  return [
    {
      id: "today-output",
      title: "Daily output",
      value: todayTrend.current,
      change: todayTrend.percent,
      note:
        todayTrend.direction === "flat"
          ? "No change from yesterday"
          : `${todayTrend.delta >= 0 ? "Up" : "Down"} ${Math.abs(todayTrend.delta)} meters vs yesterday`,
    },
    {
      id: "month-output",
      title: "Monthly output",
      value: monthTrend.current,
      change: monthTrend.percent,
      note:
        monthTrend.direction === "flat"
          ? "Tracking evenly with last month"
          : `${monthTrend.delta >= 0 ? "Ahead" : "Behind"} by ${Math.abs(monthTrend.delta)} meters`,
    },
    {
      id: "shift-balance",
      title: "Shift balance",
      value: todayStats.dayShiftMeters - todayStats.nightShiftMeters,
      change: shiftTrend.percent,
      note:
        shiftTrend.direction === "flat"
          ? "Day and night shifts are aligned"
          : `${todayStats.dayShiftMeters >= todayStats.nightShiftMeters ? "Day" : "Night"} shift is leading`,
    },
    {
      id: "best-machine",
      title: "Best machine",
      value: topMachine ? `M${topMachine[0]}` : "-",
      change: 0,
      note: topMachine ? `${topMachine[1]} meters produced today` : "No machine output yet",
    },
  ];
}

export async function getDashboardSnapshot(factoryId) {
  const todayKey = toDateKey();
  const previousDateKey = getPreviousDateKey(todayKey);
  const monthKey = toMonthKey();
  const previousMonthKey = getPreviousMonthKey(monthKey);

  const [todayStats, yesterdayStats, monthStats, previousMonthStats] = await Promise.all([
    getDailyStatsDoc(factoryId, todayKey),
    getDailyStatsDoc(factoryId, previousDateKey),
    getMonthlyStatsDoc(factoryId, monthKey),
    getMonthlyStatsDoc(factoryId, previousMonthKey),
  ]);

  return {
    todayKey,
    monthKey,
    todayStats,
    yesterdayStats,
    monthStats,
    previousMonthStats,
    todayTopWorkers: getTopEntries(todayStats.workerMap, 5),
    monthTopWorkers: getTopEntries(monthStats.workerMap, 5),
    todayTopMachines: getTopEntries(todayStats.machineMap, 5),
    machineHeatmapMax: getMaxMetricValue(todayStats.machineMap),
    todayTrend: calculateTrend(todayStats.totalMeters, yesterdayStats.totalMeters),
    monthTrend: calculateTrend(monthStats.totalMeters, previousMonthStats.totalMeters),
    insights: buildInsights(todayStats, yesterdayStats, monthStats, previousMonthStats),
  };
}
