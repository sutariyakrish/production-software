function readMetricMap(data, key) {
  if (data?.[key] && typeof data[key] === "object") {
    return data[key];
  }

  return Object.fromEntries(
    Object.entries(data || {})
      .filter(([field]) => field.startsWith(`${key}.`))
      .map(([field, value]) => [field.split(".")[1], Number(value) || 0]),
  );
}

function normalizeMapValues(metricMap = {}) {
  return Object.fromEntries(
    Object.entries(metricMap).map(([key, value]) => [key, Number(value) || 0]),
  );
}

export function createEmptyDailyStats(dateKey = "") {
  return {
    dateKey,
    totalMeters: 0,
    dayShiftMeters: 0,
    nightShiftMeters: 0,
    machineMap: {},
    workerMap: {},
    beamMap: {},
    takaMap: {},
  };
}

export function createEmptyMonthlyStats(monthKey = "") {
  return {
    monthKey,
    totalMeters: 0,
    machineMap: {},
    workerMap: {},
  };
}

export function normalizeDailyStats(data = {}, fallbackDateKey = "") {
  return {
    dateKey: data.dateKey || fallbackDateKey,
    totalMeters: Number(data.totalMeters) || 0,
    dayShiftMeters: Number(data.dayShiftMeters) || 0,
    nightShiftMeters: Number(data.nightShiftMeters) || 0,
    machineMap: normalizeMapValues(readMetricMap(data, "machineMap")),
    workerMap: normalizeMapValues(readMetricMap(data, "workerMap")),
    beamMap: normalizeMapValues(readMetricMap(data, "beamMap")),
    takaMap: normalizeMapValues(readMetricMap(data, "takaMap")),
  };
}

export function normalizeMonthlyStats(data = {}, fallbackMonthKey = "") {
  return {
    monthKey: data.monthKey || fallbackMonthKey,
    totalMeters: Number(data.totalMeters) || 0,
    machineMap: normalizeMapValues(readMetricMap(data, "machineMap")),
    workerMap: normalizeMapValues(readMetricMap(data, "workerMap")),
  };
}

export function mergeMetricMaps(targetMap, sourceMap) {
  Object.entries(sourceMap || {}).forEach(([key, value]) => {
    targetMap[key] = (targetMap[key] || 0) + (Number(value) || 0);
  });

  return targetMap;
}

export function aggregateDailyStats(statsList = []) {
  return statsList.reduce((aggregate, stats) => {
    aggregate.totalMeters += Number(stats.totalMeters) || 0;
    aggregate.dayShiftMeters += Number(stats.dayShiftMeters) || 0;
    aggregate.nightShiftMeters += Number(stats.nightShiftMeters) || 0;
    mergeMetricMaps(aggregate.machineMap, stats.machineMap);
    mergeMetricMaps(aggregate.workerMap, stats.workerMap);
    mergeMetricMaps(aggregate.beamMap, stats.beamMap);
    mergeMetricMaps(aggregate.takaMap, stats.takaMap);
    return aggregate;
  }, createEmptyDailyStats());
}

export function getTopEntries(metricMap = {}, limit = 5) {
  return Object.entries(metricMap)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return String(left[0]).localeCompare(String(right[0]), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    })
    .slice(0, limit);
}

export function calculateTrend(currentValue = 0, previousValue = 0) {
  const current = Number(currentValue) || 0;
  const previous = Number(previousValue) || 0;
  const delta = current - previous;
  const percent = previous === 0 ? (current === 0 ? 0 : 100) : (delta / previous) * 100;

  return {
    current,
    previous,
    delta,
    percent,
    direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
  };
}

export function getMaxMetricValue(metricMap = {}) {
  return Math.max(...Object.values(metricMap).map((value) => Number(value) || 0), 0);
}
