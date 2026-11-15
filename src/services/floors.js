import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";

/*
 * Floors are stored on the factory document as:
 *   floors: [{ id, name, from, to }]
 * where `from` / `to` are inclusive machine-number ranges (e.g. Floor 1 = 1-92).
 */

const floorCache = new Map();

function normalizeFloor(floor, index) {
  return {
    id: String(floor?.id || `floor_${index + 1}`),
    name: String(floor?.name || `Floor ${index + 1}`).trim(),
    from: Number(floor?.from) || 0,
    to: Number(floor?.to) || 0,
  };
}

export function sortFloors(floors = []) {
  return [...floors].sort((left, right) => left.from - right.from);
}

export async function getFactoryConfig(factoryId, options = {}) {
  if (!factoryId) {
    return { floors: [], machineCount: 0 };
  }

  if (!options.force && floorCache.has(factoryId)) {
    return floorCache.get(factoryId);
  }

  const snapshot = await getDoc(doc(db, "factories", factoryId));
  const data = snapshot.exists() ? snapshot.data() : {};
  const config = {
    floors: sortFloors((Array.isArray(data.floors) ? data.floors : []).map(normalizeFloor)),
    machineCount: Number(data.machineCount) || 0,
  };

  floorCache.set(factoryId, config);
  return config;
}

export async function getFactoryFloors(factoryId, options = {}) {
  const config = await getFactoryConfig(factoryId, options);
  return config.floors;
}

/**
 * Returns an error message string if the floor list is invalid, otherwise "".
 * `validMachineNumbers` is a Set of machine numbers that exist in the factory.
 */
export function validateFloors(floors = [], validMachineNumbers = new Set()) {
  const names = new Set();

  for (const floor of floors) {
    const label = floor.name || "A floor";

    if (!floor.name) {
      return "Every floor needs a name.";
    }

    if (names.has(floor.name.toLowerCase())) {
      return `Floor name "${floor.name}" is used twice.`;
    }
    names.add(floor.name.toLowerCase());

    if (!Number.isInteger(floor.from) || !Number.isInteger(floor.to) || floor.from <= 0 || floor.to <= 0) {
      return `${label}: enter whole machine numbers for From and To.`;
    }

    if (floor.from > floor.to) {
      return `${label}: "From" machine must be less than or equal to "To" machine.`;
    }

    if (validMachineNumbers.size) {
      for (let machine = floor.from; machine <= floor.to; machine += 1) {
        if (!validMachineNumbers.has(machine)) {
          return `${label}: machine ${machine} does not exist in this factory.`;
        }
      }
    }
  }

  const sorted = sortFloors(floors);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];

    if (current.from <= previous.to) {
      return `${previous.name} (${previous.from}-${previous.to}) overlaps with ${current.name} (${current.from}-${current.to}).`;
    }
  }

  return "";
}

export async function saveFactoryFloors(factoryId, floors = []) {
  const cleaned = sortFloors(
    floors.map((floor, index) => ({
      ...normalizeFloor(floor, index),
      id: floor.id || `floor_${Date.now()}_${index}`,
    })),
  );

  await updateDoc(doc(db, "factories", factoryId), {
    floors: cleaned,
    floorsUpdatedAt: serverTimestamp(),
  });

  const existing = floorCache.get(factoryId) || { machineCount: 0 };
  floorCache.set(factoryId, { ...existing, floors: cleaned });
  return cleaned;
}

export function getFloorForMachine(floors = [], machineNumber) {
  const number = Number(machineNumber);
  return floors.find((floor) => number >= floor.from && number <= floor.to) || null;
}

/**
 * Counts distinct taka numbers produced per machine between two date keys
 * (YYYY-MM-DD, inclusive). Only entries with meters > 0 are counted.
 * Returns { [machineNumber]: count }.
 */
export async function getMachineTakaCounts(factoryId, startKey, endKey) {
  if (!factoryId || !startKey || !endKey) {
    return {};
  }

  const start = new Date(`${startKey}T00:00:00`);
  const end = new Date(`${endKey}T23:59:59.999`);
  let docs;

  try {
    const snapshot = await getDocs(
      query(
        collection(db, "production"),
        where("factoryId", "==", factoryId),
        where("createdAt", ">=", Timestamp.fromDate(start)),
        where("createdAt", "<=", Timestamp.fromDate(end)),
      ),
    );
    docs = snapshot.docs.map((docSnap) => docSnap.data());
  } catch (error) {
    if (error?.code !== "failed-precondition") {
      throw error;
    }

    // Firestore needs a composite index (factoryId + createdAt) for the fast query.
    // The error message contains a one-click link to create it. Until then, fall back
    // to reading this factory's production and filtering by date here.
    console.warn("Create the Firestore index for faster taka counts:", error.message);
    const snapshot = await getDocs(
      query(collection(db, "production"), where("factoryId", "==", factoryId)),
    );
    docs = snapshot.docs
      .map((docSnap) => docSnap.data())
      .filter((entry) => {
        const createdAt = entry.createdAt?.toDate?.();
        return createdAt && createdAt >= start && createdAt <= end;
      });
  }

  const takaSets = {};

  docs.forEach((entry) => {
    const machineNumber = Number(entry.machineNumber);
    const takaNo = String(entry.takaNo ?? "").trim();

    if (!machineNumber || !takaNo || !(Number(entry.meters) > 0)) {
      return;
    }

    if (!takaSets[machineNumber]) takaSets[machineNumber] = new Set();
    takaSets[machineNumber].add(takaNo);
  });

  return Object.fromEntries(
    Object.entries(takaSets).map(([machineNumber, takas]) => [machineNumber, takas.size]),
  );
}
