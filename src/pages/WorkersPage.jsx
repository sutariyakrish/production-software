import { useCallback, useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import Button from "../components/ui/Button";
import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import FormField from "../components/ui/FormField";
import PageCard from "../components/ui/PageCard";
import PageHeader from "../components/ui/PageHeader";
import SectionIntro from "../components/ui/SectionIntro";
import { TableSkeleton } from "../components/ui/Skeleton";
import StatusMessage from "../components/ui/StatusMessage";
import ErrorCallout from "../components/ui/ErrorCallout";
import { useFactory } from "../contexts/FactoryContext";
import { useToast } from "../contexts/ToastContext";
import { db } from "../lib/firebase";
import { logAudit } from "../services/audit";
import { confirmOwnerPassword } from "../services/confirmPassword";
import {
  getActiveAssignments,
  getActiveWorkers,
  getFactoryMachines,
  invalidateFactoryCache,
} from "../services/factoryData";

export default function WorkersPage() {
  const { factoryId } = useFactory();
  const { showToast } = useToast();
  const [workers, setWorkers] = useState([]);
  const [factoryMachines, setFactoryMachines] = useState([]);
  const [workerName, setWorkerName] = useState("");
  const [message, setMessage] = useState({ tone: "neutral", text: "" });
  const [loadError, setLoadError] = useState("");
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [tempRanges, setTempRanges] = useState([]);
  const [fromMachine, setFromMachine] = useState("");
  const [toMachine, setToMachine] = useState("");
  const [rangeError, setRangeError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const loadSeq = useRef(0);

  const loadPageData = useCallback(
    async (force = false) => {
      const id = ++loadSeq.current;

      if (!factoryId) {
        setLoading(false);
        setLoadError("");
        return;
      }

      setLoading(true);
      setLoadError("");

      try {
        const [machines, nextWorkers] = await Promise.all([
          getFactoryMachines(factoryId, { force }),
          getActiveWorkers(factoryId, { force }),
        ]);

        if (loadSeq.current !== id) {
          return;
        }

        setFactoryMachines(machines.map((machine) => Number(machine.machineNumber)));
        setWorkers(nextWorkers);
      } catch (error) {
        console.error("Workers page load failed:", error);
        if (loadSeq.current !== id) {
          return;
        }
        setLoadError("Workers could not be loaded. Check your connection and try again.");
      } finally {
        if (loadSeq.current === id) {
          setLoading(false);
        }
      }
    },
    [factoryId],
  );

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  async function loadActiveAssignment(workerId) {
    const assignments = await getActiveAssignments(factoryId, { force: true });
    const assignment = assignments.find((item) => item.workerId === workerId);
    setTempRanges(assignment?.ranges ? [...assignment.ranges] : []);
  }

  async function handleAddWorker() {
    const normalizedName = workerName.trim();
    setMessage({ tone: "neutral", text: "" });

    if (!normalizedName) {
      setMessage({ tone: "error", text: "Worker name is required." });
      return;
    }

    if (
      workers.some(
        (worker) => worker.name.toLowerCase().trim() === normalizedName.toLowerCase(),
      )
    ) {
      setMessage({ tone: "error", text: "A worker with this name already exists." });
      return;
    }

    setBusyAction("add-worker");

    try {
      await addDoc(collection(db, "workers"), {
        factoryId,
        name: normalizedName,
        isActive: true,
        createdAt: serverTimestamp(),
      });

      invalidateFactoryCache(factoryId, ["workers"]);
      setWorkerName("");
      await loadPageData(true);
      showToast({ tone: "success", message: "Worker added successfully." });
    } catch (error) {
      console.error("Add worker failed:", error);
      showToast({ tone: "error", message: "Worker could not be added." });
    } finally {
      setBusyAction("");
    }
  }

  async function handleOpenAssign(worker) {
    setSelectedWorker(worker);
    setRangeError("");
    setFromMachine("");
    setToMachine("");

    try {
      await loadActiveAssignment(worker.id);
    } catch (error) {
      console.error("Load assignment failed:", error);
      setTempRanges([]);
      setRangeError("Assignment could not be loaded.");
    }
  }

  function handleSaveRange() {
    setRangeError("");

    const from = Number(fromMachine);
    const to = Number(toMachine);

    if (!from || !to || from > to) {
      setRangeError("Enter a valid machine range.");
      return;
    }

    for (let machine = from; machine <= to; machine += 1) {
      if (!factoryMachines.includes(machine)) {
        setRangeError(`Machine ${machine} does not exist in this factory.`);
        return;
      }
    }

    for (const range of tempRanges) {
      if (from <= range.to && to >= range.from) {
        setRangeError("This range overlaps with an existing range.");
        return;
      }
    }

    setTempRanges((currentRanges) => [...currentRanges, { from, to }]);
    setFromMachine("");
    setToMachine("");
  }

  function removeTempRange(indexToRemove) {
    setTempRanges((currentRanges) =>
      currentRanges.filter((_, index) => index !== indexToRemove),
    );
  }

  async function handleSaveAssignment() {
    if (!selectedWorker || !tempRanges.length) {
      setRangeError("Add at least one machine range before saving.");
      return;
    }

    setBusyAction("save-assignment");

    try {
      const assignments = await getActiveAssignments(factoryId, { force: true });
      const batch = writeBatch(db);

      assignments
        .filter((assignment) => assignment.workerId === selectedWorker.id)
        .forEach((assignment) => {
          batch.update(doc(db, "assignments", assignment.id), {
            status: "inactive",
            validTo: serverTimestamp(),
            isActive: false,
            updatedAt: serverTimestamp(),
          });
        });

      batch.set(doc(collection(db, "assignments")), {
        factoryId,
        workerId: selectedWorker.id,
        workerName: selectedWorker.name,
        ranges: tempRanges,
        status: "active",
        validFrom: serverTimestamp(),
        validTo: null,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      invalidateFactoryCache(factoryId, ["workers", "assignments"]);
      await loadPageData(true);
      setSelectedWorker(null);
      setTempRanges([]);
      setRangeError("");
      showToast({ tone: "success", message: "Worker assignment updated." });
    } catch (error) {
      console.error("Save assignment failed:", error);
      showToast({ tone: "error", message: "Assignment could not be saved." });
    } finally {
      setBusyAction("");
    }
  }

  async function handleDeleteWorker(worker) {
    const confirmed = await confirmOwnerPassword();

    if (!confirmed) {
      return;
    }

    setBusyAction(`delete-${worker.id}`);

    try {
      const assignments = await getActiveAssignments(factoryId, { force: true });
      const batch = writeBatch(db);

      batch.update(doc(db, "workers", worker.id), {
        isActive: false,
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      assignments
        .filter((assignment) => assignment.workerId === worker.id)
        .forEach((assignment) => {
          batch.update(doc(db, "assignments", assignment.id), {
            status: "inactive",
            validTo: serverTimestamp(),
            isActive: false,
            updatedAt: serverTimestamp(),
          });
        });

      await batch.commit();
      await logAudit(factoryId, "DELETE_WORKER", "worker", worker.id, `Deactivated ${worker.name}`);

      invalidateFactoryCache(factoryId, ["workers", "assignments"]);
      await loadPageData(true);

      if (selectedWorker?.id === worker.id) {
        setSelectedWorker(null);
        setTempRanges([]);
      }

      showToast({ tone: "success", message: "Worker deactivated successfully." });
    } catch (error) {
      console.error("Delete worker failed:", error);
      showToast({ tone: "error", message: "Worker could not be deactivated." });
    } finally {
      setBusyAction("");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Workforce"
        title="Workers"
        subtitle="Manage worker registration and machine-range assignments with fewer repeated reads and clearer feedback."
      />

      {message.text ? <StatusMessage tone={message.tone}>{message.text}</StatusMessage> : null}

      {loadError ? (
        <ErrorCallout onRetry={() => loadPageData(true)} retryLabel="Retry loading workers">
          {loadError}
        </ErrorCallout>
      ) : null}

      <div className="split-layout">
        <PageCard>
          <SectionIntro
            eyebrow="Directory"
            title="Worker register"
            description="Create workers, review active labels, and open assignment details from one table."
          />

          <div className="inline-form">
            <FormField label="Worker Name" htmlFor="workerName" className="inline-form__field">
              <input
                id="workerName"
                type="text"
                value={workerName}
                placeholder="Enter worker name"
                onChange={(event) => setWorkerName(event.target.value)}
              />
            </FormField>

            <Button
              type="button"
              loading={busyAction === "add-worker"}
              onClick={handleAddWorker}
            >
              Add Worker
            </Button>
          </div>

          {loading && !loadError ? (
            <TableSkeleton columns={4} rows={7} />
          ) : loadError ? null : (
            <DataTable>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Worker</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {workers.length ? (
                  workers.map((worker, index) => (
                    <tr key={worker.id}>
                      <td>{index + 1}</td>
                      <td>{worker.displayName}</td>
                      <td>
                        <span className="status-chip status-chip--success">Active</span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <Button
                            type="button"
                            variant="secondary"
                            className="button--small"
                            onClick={() => handleOpenAssign(worker)}
                          >
                            Assign
                          </Button>
                          <Button
                            type="button"
                            variant="danger-soft"
                            className="button--small"
                            loading={busyAction === `delete-${worker.id}`}
                            onClick={() => handleDeleteWorker(worker)}
                          >
                            Deactivate
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="table-empty-cell">
                      <EmptyState
                        compact
                        title="No active workers yet"
                        description="Add a worker name above and click Add Worker to register your team."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </DataTable>
          )}
        </PageCard>

        <PageCard className="assign-card">
          {selectedWorker ? (
            <>
              <SectionIntro
                eyebrow="Assignment"
                title={selectedWorker.name}
                description="Set or replace the active machine ranges for this worker."
              />

              <div className="form-grid">
                <FormField label="From Machine" htmlFor="fromMachine">
                  <input
                    id="fromMachine"
                    type="number"
                    value={fromMachine}
                    placeholder="From"
                    onChange={(event) => setFromMachine(event.target.value)}
                  />
                </FormField>

                <FormField label="To Machine" htmlFor="toMachine">
                  <input
                    id="toMachine"
                    type="number"
                    value={toMachine}
                    placeholder="To"
                    onChange={(event) => setToMachine(event.target.value)}
                  />
                </FormField>
              </div>

              <div className="button-row button-row--inline">
                <Button type="button" variant="secondary" onClick={handleSaveRange}>
                  Add Range
                </Button>
                <Button
                  type="button"
                  loading={busyAction === "save-assignment"}
                  onClick={handleSaveAssignment}
                >
                  Save Assignment
                </Button>
              </div>

              {rangeError ? <StatusMessage tone="error">{rangeError}</StatusMessage> : null}

              <div className="range-stack">
                <h3 className="range-stack__title">Assigned ranges</h3>
                {tempRanges.length ? (
                  <ul className="range-list">
                    {tempRanges.map((range, index) => (
                      <li key={`${range.from}-${range.to}-${index}`}>
                        <span>
                          {range.from} to {range.to}
                        </span>
                        <button type="button" onClick={() => removeTempRange(index)}>
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    compact
                    title="No ranges added yet"
                    description="Start by adding the first machine range for this worker."
                  />
                )}
              </div>
            </>
          ) : (
            <EmptyState
              title="Select a worker"
              description="Choose a worker from the register to manage their active machine ranges."
            />
          )}
        </PageCard>
      </div>
    </>
  );
}
