import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  createEmptyDailyStats,
  createEmptyMonthlyStats,
  normalizeDailyStats,
  normalizeMonthlyStats,
} from "../utils/stats";
import {
  readCachedValue,
  removeCachedValuesByPrefix,
  writeCachedValue,
} from "./storageCache";
import { formatWorkerLabel } from "./workerLabel";

const CACHE_VERSION = 2;
const memoryCache = new Map();

const TTL = {
  machines: 60 * 60 * 1000,
  assignments: 5 * 60 * 1000,
  workers: 5 * 60 * 1000,
  beams: 5 * 60 * 1000,
  machineState: 10 * 60 * 1000,
  dailyStats: 10 * 60 * 1000,
  monthlyStats: 15 * 60 * 1000,
  dailyStatsRange: 10 * 60 * 1000,
};

function getFactoryBucket(factoryId) {
  if (!memoryCache.has(factoryId)) {
    memoryCache.set(factoryId, {});
  }

  return memoryCache.get(factoryId);
}

function getBucketKey(resource, suffix = "") {
  return suffix ? `${resource}:${suffix}` : resource;
}

function getCacheKey(factoryId, resource, suffix = "") {
  return `loomtrack:v${CACHE_VERSION}:${factoryId}:${resource}${suffix ? `:${suffix}` : ""}`;
}

function getMemoryValue(factoryId, resource, suffix = "") {
  return getFactoryBucket(factoryId)[getBucketKey(resource, suffix)];
}

function setMemoryValue(factoryId, resource, value, suffix = "") {
  getFactoryBucket(factoryId)[getBucketKey(resource, suffix)] = value;
  return value;
}

async function getCachedFactoryResource(factoryId, resource, loader, options = {}) {
  const {
    force = false,
    storage = "session",
    maxAge = TTL[resource] ?? Number.POSITIVE_INFINITY,
    suffix = "",
  } = options;

  if (!factoryId) {
    return null;
  }

  if (!force) {
    const memoryValue = getMemoryValue(factoryId, resource, suffix);

    if (typeof memoryValue !== "undefined") {
      return memoryValue;
    }

    const cachedValue = readCachedValue(getCacheKey(factoryId, resource, suffix), {
      storage,
      maxAge,
    });

    if (cachedValue !== null) {
      return setMemoryValue(factoryId, resource, cachedValue, suffix);
    }
  }

  const loadedValue = await loader();
  setMemoryValue(factoryId, resource, loadedValue, suffix);
  writeCachedValue(getCacheKey(factoryId, resource, suffix), loadedValue, { storage });
  return loadedValue;
}

function sortMachines(machines = []) {
  return [...machines].sort((left, right) => left.machineNumber - right.machineNumber);
}

function sortWorkers(workers = []) {
  return [...workers].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
  );
}

function chunkArray(values, chunkSize) {
  const chunks = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}
export function invalidateFactoryCache(factoryId, resources = []) {
  if (!factoryId) {
    return;
  }

  if (!resources.length) {
    memoryCache.delete(factoryId);
    removeCachedValuesByPrefix(`loomtrack:v${CACHE_VERSION}:${factoryId}:`, { storage: "session" });
    removeCachedValuesByPrefix(`loomtrack:v${CACHE_VERSION}:${factoryId}:`, { storage: "local" });
    return;
  }

  const bucket = getFactoryBucket(factoryId);

  resources.forEach((resource) => {
    Object.keys(bucket).forEach((key) => {
      if (key === resource || key.startsWith(`${resource}:`)) {
        delete bucket[key];
      }
    });

    removeCachedValuesByPrefix(getCacheKey(factoryId, resource), { storage: "session" });
    removeCachedValuesByPrefix(getCacheKey(factoryId, resource), { storage: "local" });
  });
}

export async function getFactoryMachines(factoryId, options = {}) {
  return getCachedFactoryResource(
    factoryId,
    "machines",
    async () => {
      const snapshot = await getDocs(collection(db, "factories", factoryId, "machines"));

      return sortMachines(
        snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          machineNumber: Number(docSnap.data().machineNumber),
          ...docSnap.data(),
        })),
      );
    },
    { storage: "session", ...options },
  );
}

export async function getActiveAssignments(factoryId, options = {}) {
  return getCachedFactoryResource(
    factoryId,
    "assignments",
    async () => {
      const snapshot = await getDocs(
        query(
          collection(db, "assignments"),
          where("factoryId", "==", factoryId),
          where("status", "==", "active"),
        ),
      );

      return snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
        displayLabel: formatWorkerLabel(docSnap.data().workerName, docSnap.data().ranges || []),
      }));
    },
    { storage: "session", ...options },
  );
}

export function buildWorkerLabelMap(assignments = []) {
  return assignments.reduce((labels, assignment) => {
    labels[assignment.workerId] = assignment.displayLabel || assignment.workerName;
    return labels;
  }, {});
}

export function expandAssignmentMachines(ranges = []) {
  const machines = [];

  ranges.forEach((range) => {
    for (let machineNumber = Number(range.from); machineNumber <= Number(range.to); machineNumber += 1) {
      machines.push(machineNumber);
    }
  });

  return [...new Set(machines)].sort((left, right) => left - right);
}
export async function getActiveWorkers(factoryId, options = {}) {
  const assignments = await getActiveAssignments(factoryId, options);
  const labels = buildWorkerLabelMap(assignments || []);

  return getCachedFactoryResource(
    factoryId,
    "workers",
    async () => {
      const snapshot = await getDocs(
        query(
          collection(db, "workers"),
          where("factoryId", "==", factoryId),
          where("isActive", "==", true),
        ),
      );

      return sortWorkers(
        snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
          displayName: labels[docSnap.id] || docSnap.data().name,
        })),
      );
    },
    { storage: "session", ...options },
  );
}

export async function getFactoryBeams(factoryId, options = {}) {
  return getCachedFactoryResource(
    factoryId,
    "beams",
    async () => {
      const snapshot = await getDocs(
        query(collection(db, "beams"), where("factoryId", "==", factoryId)),
      );

      return snapshot.docs
        .map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
        .sort((left, right) => {
          if (left.machineNumber !== right.machineNumber) {
            return Number(left.machineNumber) - Number(right.machineNumber);
          }

          const leftStart = left.startDate?.toMillis?.() || 0;
          const rightStart = right.startDate?.toMillis?.() || 0;
          return rightStart - leftStart;
        });
    },
    { storage: "session", ...options },
  );
}

export function resolveBeamForDateFromList(beams = [], machineNumber, entryDate) {
  return (
    beams
      .filter((beam) => Number(beam.machineNumber) === Number(machineNumber))
      .filter((beam) => {
        if (!beam.startDate?.toDate) {
          return false;
        }

        const startDate = beam.startDate.toDate();
        const endDate = beam.endDate?.toDate?.() || null;

        return startDate <= entryDate && (!endDate || entryDate < endDate);
      })
      .sort((left, right) => right.startDate.toMillis() - left.startDate.toMillis())[0] || null
  );
}

export async function getMachineStateMap(factoryId, machineNumbers = [], options = {}) {
  const uniqueNumbers = [...new Set(machineNumbers.map((value) => Number(value)).filter(Boolean))];

  if (!uniqueNumbers.length) {
    return {};
  }

  const cachedMap =
    (await getCachedFactoryResource(factoryId, "machineState", async () => ({}), {
      storage: "session",
      ...options,
    })) || {};

  const missingNumbers = options.force
    ? uniqueNumbers
    : uniqueNumbers.filter(
        (machineNumber) => !Object.prototype.hasOwnProperty.call(cachedMap, String(machineNumber)),
      );

  if (missingNumbers.length) {
    const ids = missingNumbers.map((machineNumber) => `${factoryId}_${machineNumber}`);

    for (const chunk of chunkArray(ids, 30)) {
      const snapshot = await getDocs(
        query(collection(db, "machine_state"), where(documentId(), "in", chunk)),
      );

      const receivedIds = new Set();

      snapshot.docs.forEach((docSnap) => {
        const machineNumber = Number(docSnap.id.replace(`${factoryId}_`, ""));
        cachedMap[machineNumber] = docSnap.data();
        receivedIds.add(docSnap.id);
      });

      chunk.forEach((documentKey) => {
        if (!receivedIds.has(documentKey)) {
          const machineNumber = Number(documentKey.replace(`${factoryId}_`, ""));
          cachedMap[machineNumber] = {};
        }
      });
    }

    setMemoryValue(factoryId, "machineState", cachedMap);
    writeCachedValue(getCacheKey(factoryId, "machineState"), cachedMap, {
      storage: "session",
    });
  }

  return uniqueNumbers.reduce((states, machineNumber) => {
    states[machineNumber] = cachedMap[machineNumber] || {};
    return states;
  }, {});
}
export async function getDailyStatsDoc(factoryId, dateKey, options = {}) {
  return (
    (await getCachedFactoryResource(
      factoryId,
      "dailyStats",
      async () => {
        const snapshot = await getDoc(doc(db, "daily_stats", `${factoryId}_${dateKey}`));

        if (!snapshot.exists()) {
          return createEmptyDailyStats(dateKey);
        }

        return normalizeDailyStats(snapshot.data(), dateKey);
      },
      {
        storage: "local",
        suffix: dateKey,
        ...options,
      },
    )) || createEmptyDailyStats(dateKey)
  );
}

export async function getMonthlyStatsDoc(factoryId, monthKey, options = {}) {
  return (
    (await getCachedFactoryResource(
      factoryId,
      "monthlyStats",
      async () => {
        const snapshot = await getDoc(doc(db, "monthly_stats", `${factoryId}_${monthKey}`));

        if (!snapshot.exists()) {
          return createEmptyMonthlyStats(monthKey);
        }

        return normalizeMonthlyStats(snapshot.data(), monthKey);
      },
      {
        storage: "local",
        suffix: monthKey,
        ...options,
      },
    )) || createEmptyMonthlyStats(monthKey)
  );
}

export async function getDailyStatsRange(factoryId, startKey, endKey, options = {}) {
  if (!startKey || !endKey) {
    return [];
  }

  return (
    (await getCachedFactoryResource(
      factoryId,
      "dailyStatsRange",
      async () => {
        const snapshot = await getDocs(
          query(
            collection(db, "daily_stats"),
            where(documentId(), ">=", `${factoryId}_${startKey}`),
            where(documentId(), "<=", `${factoryId}_${endKey}`),
          ),
        );

        return snapshot.docs
          .map((docSnap) =>
            normalizeDailyStats(docSnap.data(), docSnap.id.replace(`${factoryId}_`, "")),
          )
          .sort((left, right) => left.dateKey.localeCompare(right.dateKey));
      },
      {
        storage: "local",
        suffix: `${startKey}:${endKey}`,
        ...options,
      },
    )) || []
  );
}

export function updateMachineStateCache(factoryId, machineNumber, nextState) {
  if (!factoryId || !machineNumber) {
    return;
  }

  const cachedState = getMemoryValue(factoryId, "machineState") || {};
  const nextMachineStateMap = {
    ...cachedState,
    [machineNumber]: {
      ...(cachedState[machineNumber] || {}),
      ...nextState,
    },
  };

  setMemoryValue(factoryId, "machineState", nextMachineStateMap);
  writeCachedValue(getCacheKey(factoryId, "machineState"), nextMachineStateMap, {
    storage: "session",
  });
}
