import { useEffect, useMemo, useRef, useState } from "react";
import {
  Timestamp,
  collection,
  doc,
  getDocs,
  increment,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import Button from "../components/ui/Button";
import DataTable from "../components/ui/DataTable";
import FormField from "../components/ui/FormField";
import PageCard from "../components/ui/PageCard";
import PageHeader from "../components/ui/PageHeader";
import SectionIntro from "../components/ui/SectionIntro";
import StatusMessage from "../components/ui/StatusMessage";
import { useFactory } from "../contexts/FactoryContext";
import { useToast } from "../contexts/ToastContext";
import { db } from "../lib/firebase";
import {
  expandAssignmentMachines,
  getActiveAssignments,
  getActiveWorkers,
  getFactoryBeams,
  getFactoryMachines,
  getMachineStateMap,
  invalidateFactoryCache,
  resolveBeamForDateFromList,
  updateMachineStateCache,
} from "../services/factoryData";
import { formatDisplayDate, toDateKey, toMonthKey } from "../utils/date";

function createClientId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createProductionRow(machineNumber, beam, lastTaka = "", overrides = {}) {
  return {
    clientId: overrides.clientId || createClientId(),
    productionId: overrides.productionId || "",
    machineNumber: Number(machineNumber),
    beamId: beam.id,
    beamNo: beam.beamNo,
    takaNo: overrides.takaNo ?? lastTaka,
    meters: overrides.meters ?? "",
    entryType: overrides.entryType || "normal",
    originalMeters: Number(overrides.originalMeters) || 0,
    originalEntryType: overrides.originalEntryType || "normal",
    originalBeamId: overrides.originalBeamId || beam.id,
    originalBeamNo: overrides.originalBeamNo || beam.beamNo,
    originalTakaNo: overrides.originalTakaNo ?? "",
    originalWorkerId: overrides.originalWorkerId || "",
    originalWorkerName: overrides.originalWorkerName || "",
    productionDate: overrides.productionDate || "",
    shift: overrides.shift || "",
  };
}

function getEntryTimestamp(dateValue, shift) {
  if (shift === "Day") {
    return new Date(`${dateValue}T12:00:00`);
  }

  if (shift === "Night") {
    return new Date(`${dateValue}T23:00:00`);
  }

  return new Date(`${dateValue}T00:00:00`);
}

function addMetricDelta(targetMap, key, delta) {
  const normalizedDelta = Number(delta) || 0;

  if (!key || normalizedDelta === 0) {
    return;
  }

  targetMap[key] = (targetMap[key] || 0) + normalizedDelta;

  if (targetMap[key] === 0) {
    delete targetMap[key];
  }
}

function addMetricChange(targetMap, oldKey, oldValue, newKey, newValue) {
  const previousValue = Number(oldValue) || 0;
  const nextValue = Number(newValue) || 0;

  if (oldKey && newKey && oldKey === newKey) {
    addMetricDelta(targetMap, newKey, nextValue - previousValue);
    return;
  }

  addMetricDelta(targetMap, oldKey, previousValue * -1);
  addMetricDelta(targetMap, newKey, nextValue);
}

function applyMetricDeltas(payload, fieldName, deltaMap) {
  Object.entries(deltaMap).forEach(([key, delta]) => {
    if (delta !== 0) {
      payload[`${fieldName}.${key}`] = increment(delta);
    }
  });
}

function queueMergedSet(batch, reference, payload, minimumFields = 2) {
  if (Object.keys(payload).length <= minimumFields) {
    return;
  }

  batch.set(reference, payload, { merge: true });
}

export default function ProductionPage() {
  const { factoryId } = useFactory();
  const { showToast } = useToast();
  const [workers, setWorkers] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [productionDate, setProductionDate] = useState(toDateKey());
  const [shift, setShift] = useState("");

  const [entryMode, setEntryMode] = useState("byWorker");
  const [machines, setMachines] = useState([]);
  const [selectedMachine, setSelectedMachine] = useState("");
  const [startDate, setStartDate] = useState(toDateKey());
  const [endDate, setEndDate] = useState(toDateKey());
  const [machineWorkers, setMachineWorkers] = useState([]);

  const [rows, setRows] = useState([]);
  const [infoText, setInfoText] = useState("");
  const [message, setMessage] = useState({ tone: "neutral", text: "" });
  const [loadingRows, setLoadingRows] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRefs = useRef({});
  const [pendingFocus, setPendingFocus] = useState(null);
  const removedRowsRef = useRef([]);

  const firstEntryClientIdByMachine = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      if (!map.has(row.machineNumber)) {
        map.set(row.machineNumber, row.clientId);
      }
    });
    return map;
  }, [rows]);

  useEffect(() => {
    if (!factoryId) {
      return;
    }

    let isActive = true;

    async function loadInitialData() {
      try {
        const [nextWorkers, nextMachines] = await Promise.all([
          getActiveWorkers(factoryId, { force: true }),
          getFactoryMachines(factoryId)
        ]);

        if (isActive) {
          setWorkers(nextWorkers);
          setMachines(nextMachines);
        }
      } catch (error) {
        console.error("Production initial data load failed:", error);

        if (isActive) {
          setMessage({ tone: "error", text: "Initial data could not be loaded." });
        }
      }
    }

    loadInitialData();

    return () => {
      isActive = false;
    };
  }, [factoryId]);

  useEffect(() => {
    if (entryMode === "byMachine" && selectedMachine) {
      let isActive = true;
      async function findWorkers() {
        try {
           const assignments = await getActiveAssignments(factoryId);
           const machineNum = Number(selectedMachine);
           const validWorkerIds = assignments.filter(a => {
              const assignedMachines = expandAssignmentMachines(a.ranges);
              return assignedMachines.includes(machineNum);
           }).map(a => a.workerId);
           
           if (isActive) {
             setMachineWorkers(workers.filter(w => validWorkerIds.includes(w.id)));
             setSelectedWorkerId("");
             setRows([]);
             setInfoText("");
           }
        } catch (e) {
           console.error("Failed to find workers for machine", e);
        }
      }
      findWorkers();
      return () => { isActive = false; };
    } else {
      setMachineWorkers(workers);
    }
  }, [entryMode, selectedMachine, workers, factoryId]);

  useEffect(() => {
    if (!pendingFocus) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const target = inputRefs.current[`${pendingFocus.rowId}:${pendingFocus.field}`];
      target?.focus();
      target?.select?.();
      setPendingFocus(null);
    });

    return () => cancelAnimationFrame(frame);
  }, [pendingFocus, rows]);

  useEffect(() => {
    if (entryMode === "byWorker") {
      if (!selectedWorkerId || !productionDate || !shift) {
        removedRowsRef.current = [];
        setRows([]);
        setInfoText("");
        return;
      }
      loadProductionForEditOrCreate(selectedWorkerId, productionDate, shift);
    } else {
      if (!selectedMachine || !selectedWorkerId || !startDate || !endDate || !shift) {
        removedRowsRef.current = [];
        setRows([]);
        setInfoText("");
        return;
      }
      loadProductionForMachineRange(selectedMachine, selectedWorkerId, startDate, endDate, shift);
    }
  }, [entryMode, selectedWorkerId, productionDate, selectedMachine, startDate, endDate, shift]);

  function registerInputRef(rowId, field) {
    return (node) => {
      const key = `${rowId}:${field}`;

      if (node) {
        inputRefs.current[key] = node;
      } else {
        delete inputRefs.current[key];
      }
    };
  }

  function handleRemoveRow(rowId) {
    if (rows.length <= 1) {
      return; // safety: prevent removing everything
    }

    const rowToRemove = rows.find((row) => row.clientId === rowId);
    if (!rowToRemove) {
      return;
    }

    const confirmed = window.confirm("Are you sure you want to remove this entry?");
    if (!confirmed) {
      return;
    }

    if (rowToRemove.productionId) {
      removedRowsRef.current.push({
        productionId: rowToRemove.productionId,
        machineNumber: rowToRemove.machineNumber,
        originalMeters: rowToRemove.originalMeters,
        originalEntryType: rowToRemove.originalEntryType,
        originalBeamId: rowToRemove.originalBeamId,
        originalBeamNo: rowToRemove.originalBeamNo,
        originalTakaNo: rowToRemove.originalTakaNo,
        originalWorkerId: rowToRemove.originalWorkerId,
        originalWorkerName: rowToRemove.originalWorkerName,
        productionDate: rowToRemove.productionDate,
        shift: rowToRemove.shift,
      });
    }

    setPendingFocus((current) => (current?.rowId === rowId ? null : current));
    setRows((currentRows) => currentRows.filter((row) => row.clientId !== rowId));
  }

  function updateRow(rowId, field, value) {
    setRows((currentRows) =>
      currentRows.map((row) => (row.clientId === rowId ? { ...row, [field]: value } : row)),
    );
  }

  function addRowAfter(rowId) {
    setRows((currentRows) => {
      const rowIndex = currentRows.findIndex((row) => row.clientId === rowId);

      if (rowIndex === -1) {
        return currentRows;
      }

      const sourceRow = currentRows[rowIndex];
      const nextRow = createProductionRow(sourceRow.machineNumber, {
        id: sourceRow.beamId,
        beamNo: sourceRow.beamNo,
      }, "", {
        productionDate: sourceRow.productionDate,
        shift: sourceRow.shift
      });

      const nextRows = [...currentRows];
      nextRows.splice(rowIndex + 1, 0, nextRow);
      setPendingFocus({ rowId: nextRow.clientId, field: "taka" });
      return nextRows;
    });
  }

  function handleFieldKeyDown(event, rowId, field) {
    if (event.key === "Enter" && event.ctrlKey) {
      event.preventDefault();
      handleSaveBulk();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();

      if (field === "taka") {
        setPendingFocus({ rowId, field: "meter" });
        return;
      }

      if (field === "meter") {
        const currentIndex = rows.findIndex((row) => row.clientId === rowId);
        const nextRow = rows[currentIndex + 1];

        if (nextRow) {
          setPendingFocus({ rowId: nextRow.clientId, field: "taka" });
        }
      }

      return;
    }

    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      addRowAfter(rowId);
    }
  }

  async function renderBulkRows(machineNumbers, dateValue) {
    const entryDate = new Date(`${dateValue}T00:00:00`);
    const [beams, machineStates] = await Promise.all([
      getFactoryBeams(factoryId),
      getMachineStateMap(factoryId, machineNumbers),
    ]);

    const nextRows = [];
    const missingMachines = [];

    machineNumbers.forEach((machineNumber) => {
      const beam = resolveBeamForDateFromList(beams, machineNumber, entryDate);

      if (!beam) {
        missingMachines.push(machineNumber);
        return;
      }

      nextRows.push(
        createProductionRow(
          machineNumber,
          beam,
          machineStates[machineNumber]?.lastTaka || "",
        ),
      );
    });

    setRows(nextRows);
    setInfoText(
      missingMachines.length
        ? `No active beam found for machine ${missingMachines.join(", ")}. Remaining rows are still editable.`
        : "",
    );

    if (nextRows.length) {
      setPendingFocus({ rowId: nextRows[0].clientId, field: "meter" });
    }
  }

  function renderBulkFromExisting(docSnaps) {
    const sortedDocs = [...docSnaps].sort((left, right) => {
      if (left.data().machineNumber !== right.data().machineNumber) {
        return left.data().machineNumber - right.data().machineNumber;
      }

      return (left.data().createdAt?.seconds || 0) - (right.data().createdAt?.seconds || 0);
    });

    const nextRows = sortedDocs.map((docSnap) => {
      const createdAt = docSnap.data().createdAt?.toDate();
      const dateKeyStr = createdAt ? toDateKey(createdAt) : "";

      return createProductionRow(
        docSnap.data().machineNumber,
        { id: docSnap.data().beamId, beamNo: docSnap.data().beamNo },
        docSnap.data().takaNo,
        {
          productionId: docSnap.id,
          takaNo: docSnap.data().takaNo,
          meters: docSnap.data().meters,
          entryType: docSnap.data().entryType || "normal",
          productionDate: dateKeyStr,
          shift: docSnap.data().shift,
          originalMeters: docSnap.data().meters,
          originalEntryType: docSnap.data().entryType || "normal",
          originalBeamId: docSnap.data().beamId,
          originalBeamNo: docSnap.data().beamNo,
          originalTakaNo: docSnap.data().takaNo,
          originalWorkerId: docSnap.data().workerId,
          originalWorkerName: docSnap.data().workerName,
        },
      );
    });

    setRows(nextRows);
    setInfoText("");

    if (nextRows.length) {
      setPendingFocus({ rowId: nextRows[0].clientId, field: "meter" });
    }
  }

  async function loadProductionForMachineRange(machineNum, workerId, start, end, shiftValue) {
    removedRowsRef.current = [];
    setLoadingRows(true);
    setMessage({ tone: "neutral", text: "" });

    try {
      const startD = getEntryTimestamp(start, shiftValue);
      const endD = getEntryTimestamp(end, shiftValue);
      endD.setHours(23, 59, 59, 999);
      
      const snapshot = await getDocs(
        query(
          collection(db, "production"),
          where("factoryId", "==", factoryId),
          where("machineNumber", "==", Number(machineNum)),
          where("workerId", "==", workerId),
          where("shift", "==", shiftValue),
          where("createdAt", ">=", Timestamp.fromDate(startD)),
          where("createdAt", "<=", Timestamp.fromDate(endD)),
        ),
      );

      const existingDocs = snapshot.docs;
      
      const [beams, machineStates] = await Promise.all([
        getFactoryBeams(factoryId),
        getMachineStateMap(factoryId, [Number(machineNum)]),
      ]);

      const nextRows = [];
      const missingDates = [];
      
      const dateKeys = [];
      let curr = new Date(`${start}T00:00:00`);
      const endObj = new Date(`${end}T00:00:00`);
      while (curr <= endObj) {
        dateKeys.push(toDateKey(curr));
        curr.setDate(curr.getDate() + 1);
      }

      const existingByDate = {};
      existingDocs.forEach(docSnap => {
         const createdAt = docSnap.data().createdAt?.toDate();
         const dateKeyStr = createdAt ? toDateKey(createdAt) : "";
         if (!existingByDate[dateKeyStr]) existingByDate[dateKeyStr] = [];
         existingByDate[dateKeyStr].push(docSnap);
      });

      let lastTaka = machineStates[Number(machineNum)]?.lastTaka || "";

      dateKeys.forEach(dateKeyStr => {
         if (existingByDate[dateKeyStr] && existingByDate[dateKeyStr].length > 0) {
            const sortedDocs = existingByDate[dateKeyStr].sort((a,b) => (a.data().createdAt?.seconds || 0) - (b.data().createdAt?.seconds || 0));
            sortedDocs.forEach(docSnap => {
              nextRows.push(
                createProductionRow(
                  machineNum,
                  { id: docSnap.data().beamId, beamNo: docSnap.data().beamNo },
                  docSnap.data().takaNo,
                  {
                    productionId: docSnap.id,
                    takaNo: docSnap.data().takaNo,
                    meters: docSnap.data().meters,
                    entryType: docSnap.data().entryType || "normal",
                    productionDate: dateKeyStr,
                    shift: docSnap.data().shift,
                    originalMeters: docSnap.data().meters,
                    originalEntryType: docSnap.data().entryType || "normal",
                    originalBeamId: docSnap.data().beamId,
                    originalBeamNo: docSnap.data().beamNo,
                    originalTakaNo: docSnap.data().takaNo,
                    originalWorkerId: docSnap.data().workerId,
                    originalWorkerName: docSnap.data().workerName,
                  }
                )
              );
              lastTaka = docSnap.data().takaNo;
            });
         } else {
            const entryDate = new Date(`${dateKeyStr}T00:00:00`);
            const beam = resolveBeamForDateFromList(beams, Number(machineNum), entryDate);
            if (!beam) {
               missingDates.push(dateKeyStr);
            } else {
               nextRows.push(
                 createProductionRow(
                   machineNum,
                   beam,
                   lastTaka,
                   { productionDate: dateKeyStr, shift: shiftValue }
                 )
               );
            }
         }
      });

      setRows(nextRows);
      setInfoText(
        missingDates.length
          ? `No active beam found for dates: ${missingDates.join(", ")}. Remaining rows are still editable.`
          : "",
      );

      if (nextRows.length) {
        setPendingFocus({ rowId: nextRows[0].clientId, field: "meter" });
      }

    } catch (error) {
      console.error("Production load failed:", error);
      setRows([]);
      setInfoText("");
      setMessage({ tone: "error", text: "Production rows could not be loaded." });
    } finally {
      setLoadingRows(false);
    }
  }

  async function loadMachinesForWorker(workerId, dateValue) {
    const assignments = await getActiveAssignments(factoryId);
    const assignment = assignments.find((item) => item.workerId === workerId);

    if (!assignment) {
      setInfoText("No active assignment found for this worker.");
      setRows([]);
      return;
    }

    await renderBulkRows(expandAssignmentMachines(assignment.ranges), dateValue);
  }

  async function loadProductionForEditOrCreate(workerId, dateValue, shiftValue) {
    removedRowsRef.current = [];
    setLoadingRows(true);
    setMessage({ tone: "neutral", text: "" });

    try {
      const entryTime = getEntryTimestamp(dateValue, shiftValue);
      const start = new Date(entryTime);
      const end = new Date(entryTime);

      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      const snapshot = await getDocs(
        query(
          collection(db, "production"),
          where("factoryId", "==", factoryId),
          where("workerId", "==", workerId),
          where("shift", "==", shiftValue),
          where("createdAt", ">=", Timestamp.fromDate(start)),
          where("createdAt", "<=", Timestamp.fromDate(end)),
        ),
      );

      if (!snapshot.empty) {
        renderBulkFromExisting(snapshot.docs);
        return;
      }

      await loadMachinesForWorker(workerId, dateValue);
    } catch (error) {
      console.error("Production load failed:", error);
      setRows([]);
      setInfoText("");
      setMessage({ tone: "error", text: "Production rows could not be loaded." });
    } finally {
      setLoadingRows(false);
    }
  }

  async function handleSaveBulk() {
    if (!rows.length) {
      setMessage({ tone: "error", text: "There are no production rows to save." });
      return;
    }

    const selectedWorker = workers.find((worker) => worker.id === selectedWorkerId);

    if (!selectedWorker) {
      setMessage({ tone: "error", text: "Select a valid worker before saving." });
      return;
    }

    setSaving(true);
    setMessage({ tone: "neutral", text: "" });

    try {
      const batch = writeBatch(db);
      const removedRows = removedRowsRef.current || [];
      const removedProductionIds = [...new Set(removedRows.map((r) => r.productionId).filter(Boolean))];
      let didWriteProductionDocs = removedProductionIds.length > 0;

      // Remove deleted production documents so they don't reappear on the next load.
      removedProductionIds.forEach((productionId) => {
        batch.delete(doc(db, "production", productionId));
      });

      const dateStats = {};
      const monthStats = {};
      const machineDailyDeltas = {};
      const workerDailyDeltas = {};
      const workerDailyNames = {};
      const beamDeltas = {};
      const machineStateUpdates = {};

      function getDateStat(dk) {
        if (!dateStats[dk]) {
          dateStats[dk] = { totalDelta: 0, dayShiftDelta: 0, nightShiftDelta: 0, machineDeltas: {}, workerDeltas: {}, beamDeltas: {}, takaDeltas: {} };
        }
        return dateStats[dk];
      }
      function getMonthStat(mk) {
        if (!monthStats[mk]) {
          monthStats[mk] = { totalDelta: 0, machineDeltas: {}, workerDeltas: {} };
        }
        return monthStats[mk];
      }

      for (const row of rows) {
        const taka = row.takaNo.trim();
        const metersRaw = String(row.meters).trim();

        if (!taka) {
          setMessage({ tone: "error", text: "Enter every Taka number before saving." });
          setSaving(false);
          return;
        }

        if (metersRaw === "") {
          setMessage({ tone: "error", text: "Fill every meters field. Zero is allowed." });
          setSaving(false);
          return;
        }

        const meters = Number(metersRaw);

        if (Number.isNaN(meters) || meters < 0) {
          setMessage({ tone: "error", text: "Meters must be a valid number." });
          setSaving(false);
          return;
        }

        const countInWorker = row.entryType === "normal";
        const workerLabel = countInWorker
          ? selectedWorker.displayName || selectedWorker.name
          : "Adjustment";

        const oldMeters = row.productionId ? Number(row.originalMeters) || 0 : 0;
        const oldCountInWorker = row.productionId ? row.originalEntryType !== "adjustment" : false;
        const oldWorkerId = oldCountInWorker ? row.originalWorkerId : "";
        const oldWorkerName = oldCountInWorker ? row.originalWorkerName || selectedWorker.name : "";
        const newWorkerId = countInWorker ? selectedWorkerId : "";
        const newWorkerName = countInWorker ? selectedWorker.name : "";
        const workerMetersBefore = oldCountInWorker ? oldMeters : 0;
        const workerMetersAfter = countInWorker ? meters : 0;
        const metersDelta = meters - oldMeters;

        // Avoid redundant writes for rows that haven't changed.
        const oldTakaNo = row.productionId ? String(row.originalTakaNo ?? "").trim() : "";
        const oldEntryType = row.productionId ? row.originalEntryType || "normal" : "normal";
        const oldBeamIdField = row.productionId ? row.originalBeamId || row.beamId : row.beamId;
        const oldBeamNoField = row.productionId ? row.originalBeamNo || row.beamNo : row.beamNo;
        const oldWorkerIdField = row.productionId ? row.originalWorkerId || "" : "";
        const oldWorkerNameField = row.productionId ? row.originalWorkerName || "" : "";

        const rowDateKey = row.productionDate || productionDate;
        const rowShift = row.shift || shift;
        const rowMonthKey = toMonthKey(`${rowDateKey}T00:00:00`);
        const rowCreatedAt = Timestamp.fromDate(getEntryTimestamp(rowDateKey, rowShift));

        const shouldWriteProductionEntry =
          !row.productionId ||
          oldTakaNo !== taka ||
          oldMeters !== meters ||
          row.entryType !== oldEntryType ||
          oldWorkerIdField !== selectedWorkerId ||
          oldWorkerNameField !== selectedWorker.name ||
          oldBeamIdField !== row.beamId ||
          oldBeamNoField !== row.beamNo;

        const productionRef = row.productionId
          ? doc(db, "production", row.productionId)
          : doc(collection(db, "production"));

        if (shouldWriteProductionEntry) {
          didWriteProductionDocs = true;
          batch.set(
            productionRef,
            {
              factoryId,
              machineNumber: Number(row.machineNumber),
              beamId: row.beamId,
              beamNo: row.beamNo,
              workerId: selectedWorkerId,
              workerName: selectedWorker.name,
              workerLabel,
              takaNo: taka,
              meters,
              shift: rowShift,
              createdAt: rowCreatedAt,
              entryType: row.entryType,
              countInWorker,
              updatedAt: Timestamp.now(),
            },
            { merge: true },
          );
        }

        const ds = getDateStat(rowDateKey);
        const ms = getMonthStat(rowMonthKey);

        ds.totalDelta += metersDelta;
        ds.dayShiftDelta += rowShift === "Day" ? metersDelta : 0;
        ds.nightShiftDelta += rowShift === "Night" ? metersDelta : 0;

        addMetricDelta(machineDailyDeltas, `${row.machineNumber}_${rowDateKey}`, metersDelta);
        addMetricDelta(ds.machineDeltas, row.machineNumber, metersDelta);
        addMetricDelta(ms.machineDeltas, row.machineNumber, metersDelta);
        
        addMetricChange(beamDeltas, row.originalBeamId, oldMeters, row.beamId, meters);
        addMetricChange(ds.beamDeltas, row.originalBeamNo, oldMeters, row.beamNo, meters);
        addMetricChange(ds.takaDeltas, row.originalTakaNo, oldMeters, taka, meters);
        
        addMetricChange(ds.workerDeltas, oldWorkerName, workerMetersBefore, newWorkerName, workerMetersAfter);
        addMetricChange(ms.workerDeltas, oldWorkerName, workerMetersBefore, newWorkerName, workerMetersAfter);
        
        addMetricChange(workerDailyDeltas, oldWorkerId ? `${oldWorkerId}_${rowDateKey}` : "", workerMetersBefore, newWorkerId ? `${newWorkerId}_${rowDateKey}` : "", workerMetersAfter);

        if (oldWorkerId) workerDailyNames[oldWorkerId] = row.originalWorkerName || selectedWorker.name;
        if (newWorkerId) workerDailyNames[newWorkerId] = selectedWorker.name;

        if (!machineStateUpdates[row.machineNumber] || new Date(rowDateKey) >= new Date(machineStateUpdates[row.machineNumber].dateKey)) {
            machineStateUpdates[row.machineNumber] = {
              lastTaka: taka,
              beamId: row.beamId,
              beamNo: row.beamNo,
              dateKey: rowDateKey
            };
        }
      }

      if (removedRows.length) {
        removedRows.forEach((removed) => {
          const oldMeters = Number(removed.originalMeters) || 0;
          if (oldMeters === 0) return;

          const metersDelta = oldMeters * -1;
          const rowDateKey = removed.productionDate || productionDate;
          const rowShift = removed.shift || shift;
          const rowMonthKey = toMonthKey(`${rowDateKey}T00:00:00`);

          const ds = getDateStat(rowDateKey);
          const ms = getMonthStat(rowMonthKey);

          ds.totalDelta += metersDelta;
          ds.dayShiftDelta += rowShift === "Day" ? metersDelta : 0;
          ds.nightShiftDelta += rowShift === "Night" ? metersDelta : 0;

          addMetricDelta(machineDailyDeltas, `${removed.machineNumber}_${rowDateKey}`, metersDelta);
          addMetricDelta(ds.machineDeltas, removed.machineNumber, metersDelta);
          addMetricDelta(ms.machineDeltas, removed.machineNumber, metersDelta);

          addMetricDelta(beamDeltas, removed.originalBeamId, metersDelta);
          addMetricDelta(ds.beamDeltas, removed.originalBeamNo, metersDelta);
          addMetricDelta(ds.takaDeltas, removed.originalTakaNo, metersDelta);

          const oldCountInWorker = removed.originalEntryType !== "adjustment";
          const oldWorkerId = oldCountInWorker ? removed.originalWorkerId : "";
          const oldWorkerName = oldCountInWorker ? (removed.originalWorkerName || selectedWorker.name) : "";
          const workerMetersBefore = oldCountInWorker ? oldMeters : 0;

          addMetricChange(ds.workerDeltas, oldWorkerName, workerMetersBefore, "", 0);
          addMetricChange(ms.workerDeltas, oldWorkerName, workerMetersBefore, "", 0);
          addMetricChange(workerDailyDeltas, oldWorkerId ? `${oldWorkerId}_${rowDateKey}` : "", workerMetersBefore, "", 0);

          if (oldWorkerId) {
            workerDailyNames[oldWorkerId] = oldWorkerName || selectedWorker.name;
          }
        });
      }

      Object.entries(beamDeltas).forEach(([beamId, delta]) => {
        if (delta !== 0) {
          batch.update(doc(db, "beams", beamId), {
            producedMeters: increment(delta),
          });
        }
      });

      Object.entries(machineDailyDeltas).forEach(([key, delta]) => {
        if (delta !== 0) {
          const [machineNumber, dateKey] = key.split("_");
          batch.set(
            doc(db, "machine_daily_stats", `${factoryId}_${machineNumber}_${dateKey}`),
            {
              factoryId,
              machineNumber: Number(machineNumber),
              date: dateKey,
              meters: increment(delta),
            },
            { merge: true },
          );
        }
      });

      Object.entries(workerDailyDeltas).forEach(([key, delta]) => {
        if (key && delta !== 0) {
          const [workerId, dateKey] = key.split("_");
          batch.set(
            doc(db, "worker_daily_stats", `${factoryId}_${workerId}_${dateKey}`),
            {
              factoryId,
              workerId,
              workerName: workerDailyNames[workerId] || selectedWorker.name,
              date: dateKey,
              meters: increment(delta),
            },
            { merge: true },
          );
        }
      });

      Object.entries(dateStats).forEach(([dateKey, stats]) => {
        const dailyPayload = { factoryId, dateKey };
        if (stats.totalDelta !== 0) dailyPayload.totalMeters = increment(stats.totalDelta);
        if (stats.dayShiftDelta !== 0) dailyPayload.dayShiftMeters = increment(stats.dayShiftDelta);
        if (stats.nightShiftDelta !== 0) dailyPayload.nightShiftMeters = increment(stats.nightShiftDelta);
        applyMetricDeltas(dailyPayload, "machineMap", stats.machineDeltas);
        applyMetricDeltas(dailyPayload, "workerMap", stats.workerDeltas);
        applyMetricDeltas(dailyPayload, "beamMap", stats.beamDeltas);
        applyMetricDeltas(dailyPayload, "takaMap", stats.takaDeltas);
        queueMergedSet(batch, doc(db, "daily_stats", `${factoryId}_${dateKey}`), dailyPayload);
      });

      Object.entries(monthStats).forEach(([monthKey, stats]) => {
        const monthlyPayload = { factoryId, monthKey };
        if (stats.totalDelta !== 0) monthlyPayload.totalMeters = increment(stats.totalDelta);
        applyMetricDeltas(monthlyPayload, "machineMap", stats.machineDeltas);
        applyMetricDeltas(monthlyPayload, "workerMap", stats.workerDeltas);
        queueMergedSet(batch, doc(db, "monthly_stats", `${factoryId}_${monthKey}`), monthlyPayload);
      });

      Object.entries(machineStateUpdates).forEach(([machineNumber, state]) => {
        const { dateKey, ...cleanState } = state;
        batch.set(
          doc(db, "machine_state", `${factoryId}_${machineNumber}`),
          {
            ...cleanState,
            updatedAt: Timestamp.now(),
          },
          { merge: true },
        );
      });

      await batch.commit();

      invalidateFactoryCache(factoryId, [
        "beams",
        "machineState",
        "dailyStats",
        "monthlyStats",
        "dailyStatsRange",
      ]);

      Object.entries(machineStateUpdates).forEach(([machineNumber, state]) => {
        updateMachineStateCache(factoryId, machineNumber, state);
      });

      // Avoid a full refetch when nothing changed (keeps the "Save" button responsive).
      if (didWriteProductionDocs) {
        if (entryMode === "byWorker") {
          await loadProductionForEditOrCreate(selectedWorkerId, productionDate, shift);
        } else {
          await loadProductionForMachineRange(selectedMachine, selectedWorkerId, startDate, endDate, shift);
        }
      }
      setMessage({ tone: "neutral", text: "" });
      showToast({ tone: "success", message: "Production saved successfully." });
    } catch (error) {
      console.error("Production save failed:", error);
      setMessage({ tone: "error", text: "Production could not be saved." });
      showToast({ tone: "error", message: "Production could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Production"
        title="Production entry"
        subtitle="Load worker assignments, reuse cached machine state, and save edits without double-counting aggregate totals."
      />

      <StatusMessage tone={message.tone}>{message.text}</StatusMessage>

      <PageCard>
        <SectionIntro
          eyebrow="Entry Mode"
          title="Shift production"
          description="Choose how you want to enter production."
        />
        
        <div style={{ marginBottom: "24px", display: "flex", gap: "16px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input 
              type="radio" 
              name="entryMode" 
              value="byWorker" 
              checked={entryMode === "byWorker"} 
              onChange={() => setEntryMode("byWorker")} 
            />
            By Worker
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input 
              type="radio" 
              name="entryMode" 
              value="byMachine" 
              checked={entryMode === "byMachine"} 
              onChange={() => setEntryMode("byMachine")} 
            />
            By Machine (Date Range)
          </label>
        </div>

        {entryMode === "byWorker" ? (
          <div className="form-grid form-grid--filters">
            <FormField label="Date" htmlFor="productionDate">
              <input
                id="productionDate"
                type="date"
                value={productionDate}
                onChange={(event) => setProductionDate(event.target.value)}
              />
            </FormField>

            <FormField label="Worker" htmlFor="workerSelect">
              <select
                id="workerSelect"
                value={selectedWorkerId}
                onChange={(event) => setSelectedWorkerId(event.target.value)}
              >
                <option value="">Select Worker</option>
                {workers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.displayName}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Shift" htmlFor="shiftSelect">
              <select id="shiftSelect" value={shift} onChange={(event) => setShift(event.target.value)}>
                <option value="">Select Shift</option>
                <option value="Day">Day</option>
                <option value="Night">Night</option>
              </select>
            </FormField>
          </div>
        ) : (
          <div className="form-grid form-grid--filters">
            <FormField label="Machine" htmlFor="machineSelect">
              <select
                id="machineSelect"
                value={selectedMachine}
                onChange={(event) => setSelectedMachine(event.target.value)}
              >
                <option value="">Select Machine</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.machineNumber}>
                    Machine {m.machineNumber}
                  </option>
                ))}
              </select>
            </FormField>
            
            <FormField label="Start Date" htmlFor="startDate">
              <input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </FormField>

            <FormField label="End Date" htmlFor="endDate">
              <input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </FormField>

            <FormField label="Worker" htmlFor="workerSelect">
              <select
                id="workerSelect"
                value={selectedWorkerId}
                onChange={(event) => setSelectedWorkerId(event.target.value)}
              >
                <option value="">Select Worker</option>
                {machineWorkers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.displayName}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Shift" htmlFor="shiftSelect">
              <select id="shiftSelect" value={shift} onChange={(event) => setShift(event.target.value)}>
                <option value="">Select Shift</option>
                <option value="Day">Day</option>
                <option value="Night">Night</option>
              </select>
            </FormField>
          </div>
        )}

        <DataTable className="production-table" wrapperClassName="table-scroll--tall">
          <thead>
            <tr>
              <th>{entryMode === "byMachine" ? "Date" : "Machine"}</th>
              <th>Beam</th>
              <th>Taka No</th>
              <th>Meters</th>
              <th>Type</th>
              <th>Add</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr
                  key={row.clientId}
                  className={row.entryType === "adjustment" ? "production-row production-row--adjustment" : "production-row"}
                >
                  <td>
                    {entryMode === "byMachine" 
                      ? (row.productionDate ? formatDisplayDate(row.productionDate) : `Machine ${row.machineNumber}`)
                      : `Machine ${row.machineNumber}`
                    }
                  </td>
                  <td>{row.beamNo}</td>
                  <td>
                    <input
                      ref={registerInputRef(row.clientId, "taka")}
                      className="table-input"
                      value={row.takaNo}
                      onChange={(event) => updateRow(row.clientId, "takaNo", event.target.value)}
                      onKeyDown={(event) => handleFieldKeyDown(event, row.clientId, "taka")}
                    />
                  </td>
                  <td>
                    <input
                      ref={registerInputRef(row.clientId, "meter")}
                      className="table-input table-input--numeric"
                      type="number"
                      min="0"
                      value={row.meters}
                      onChange={(event) => updateRow(row.clientId, "meters", event.target.value)}
                      onKeyDown={(event) => handleFieldKeyDown(event, row.clientId, "meter")}
                    />
                  </td>
                  <td>
                    <select
                      className="table-select"
                      value={row.entryType}
                      onChange={(event) => updateRow(row.clientId, "entryType", event.target.value)}
                    >
                      <option value="normal">Normal</option>
                      <option value="adjustment">Adjustment</option>
                    </select>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => addRowAfter(row.clientId)}
                        aria-label="Add another entry for this machine"
                      >
                        +
                      </button>
                      {rows.length > 1 && firstEntryClientIdByMachine.get(row.machineNumber) !== row.clientId ? (
                        <button
                          type="button"
                          className="icon-button icon-button--danger"
                          onClick={() => handleRemoveRow(row.clientId)}
                          aria-label="Remove this production entry"
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6">
                  {loadingRows
                    ? "Loading production rows..."
                    : "Select a worker, date, and shift to load production rows."}
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>

        {infoText ? <StatusMessage tone="neutral">{infoText}</StatusMessage> : null}

        <Button type="button" block className="save-bar" loading={saving} onClick={handleSaveBulk}>
          Save Production
        </Button>
      </PageCard>
    </>
  );
}



