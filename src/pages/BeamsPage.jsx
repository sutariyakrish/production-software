import { useState } from "react";
import {
  Timestamp,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import FormField from "../components/ui/FormField";
import PageCard from "../components/ui/PageCard";
import PageHeader from "../components/ui/PageHeader";
import SectionIntro from "../components/ui/SectionIntro";
import StatusMessage from "../components/ui/StatusMessage";
import { useFactory } from "../contexts/FactoryContext";
import { db } from "../lib/firebase";
import {
  getFactoryBeams,
  getFactoryMachines,
  invalidateFactoryCache,
} from "../services/factoryData";
import { formatNumber, formatPercent } from "../utils/format";

export default function BeamsPage() {
  const { factoryId } = useFactory();
  const [machineNumberInput, setMachineNumberInput] = useState("");
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [activeBeam, setActiveBeam] = useState(null);
  const [activeBeamDocId, setActiveBeamDocId] = useState("");
  const [statusText, setStatusText] = useState("Enter a machine number to inspect the active beam.");
  const [message, setMessage] = useState({ tone: "neutral", text: "" });
  const [isEditing, setIsEditing] = useState(false);
  const [editBeamNo, setEditBeamNo] = useState("");
  const [editBeamMeters, setEditBeamMeters] = useState("");
  const [beamNo, setBeamNo] = useState("");
  const [beamMeters, setBeamMeters] = useState("");
  const [beamStartDate, setBeamStartDate] = useState("");
  const [busyAction, setBusyAction] = useState("");

  async function handleMachineLookup(force = false) {
    const machineNumber = Number(machineNumberInput);

    if (!factoryId || !machineNumber) {
      setMessage({ tone: "error", text: "Enter a valid machine number." });
      return;
    }

    setMessage({ tone: "neutral", text: "" });

    try {
      const machines = await getFactoryMachines(factoryId, { force });
      const machine = machines.find((item) => Number(item.machineNumber) === machineNumber);

      if (!machine) {
        setSelectedMachine(null);
        setActiveBeam(null);
        setActiveBeamDocId("");
        setIsEditing(false);
        setStatusText("Enter a machine number to inspect the active beam.");
        setMessage({ tone: "error", text: "Machine not found in this factory." });
        return;
      }

      const nextMachine = {
        id: machine.id,
        number: Number(machine.machineNumber),
      };

      setSelectedMachine(nextMachine);
      await loadActiveBeam(nextMachine, force);
    } catch (error) {
      console.error("Machine lookup failed:", error);
      setMessage({ tone: "error", text: "Beam details could not be loaded." });
    }
  }

  function handleMachineKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleMachineLookup();
    }
  }

  async function loadActiveBeam(machine, force = false) {
    const beams = await getFactoryBeams(factoryId, { force });
    const beam = beams.find(
      (item) =>
        item.machineId === machine.id &&
        item.isActive === true &&
        (item.endDate === null || typeof item.endDate === "undefined"),
    );

    if (!beam) {
      setActiveBeam(null);
      setActiveBeamDocId("");
      setIsEditing(false);
      setStatusText(`No active beam found on Machine ${machine.number}.`);
      return;
    }

    setActiveBeamDocId(beam.id);
    setActiveBeam(beam);
    setEditBeamNo(beam.beamNo || "");
    setEditBeamMeters(String(beam.totalMeters || ""));
    setIsEditing(false);
    setStatusText(`Active beam loaded for Machine ${beam.machineNumber}.`);
  }

  async function handleSaveEdit() {
    const nextBeamNo = editBeamNo.trim();
    const nextMeters = Number(editBeamMeters);

    if (!nextBeamNo || nextMeters <= 0) {
      setMessage({ tone: "error", text: "Enter valid beam details before saving." });
      return;
    }

    setBusyAction("save-edit");

    try {
      await updateDoc(doc(db, "beams", activeBeamDocId), {
        beamNo: nextBeamNo,
        totalMeters: nextMeters,
        updatedAt: serverTimestamp(),
      });

      invalidateFactoryCache(factoryId, ["beams"]);
      setMessage({ tone: "success", text: "Beam updated successfully." });
      await loadActiveBeam(selectedMachine, true);
    } catch (error) {
      console.error("Beam update failed:", error);
      setMessage({ tone: "error", text: "Beam could not be updated." });
    } finally {
      setBusyAction("");
    }
  }

  async function handleAddBeam() {
    if (!selectedMachine) {
      setMessage({ tone: "error", text: "Load a machine before adding a beam." });
      return;
    }

    const normalizedBeamNo = beamNo.trim();
    const normalizedMeters = Number(beamMeters);

    if (!normalizedBeamNo || normalizedMeters <= 0) {
      setMessage({ tone: "error", text: "Enter valid beam details." });
      return;
    }

    if (!beamStartDate) {
      setMessage({ tone: "error", text: "Select a beam start date." });
      return;
    }

    setBusyAction("add-beam");

    try {
      const startDate = Timestamp.fromDate(new Date(`${beamStartDate}T00:00:00`));
      const beams = await getFactoryBeams(factoryId, { force: true });
      const batch = writeBatch(db);

      beams
        .filter(
          (beam) =>
            beam.machineId === selectedMachine.id &&
            (beam.endDate === null || typeof beam.endDate === "undefined"),
        )
        .forEach((beam) => {
          batch.update(doc(db, "beams", beam.id), {
            endDate: startDate,
            isActive: false,
            updatedAt: serverTimestamp(),
          });
        });

      batch.set(doc(collection(db, "beams")), {
        factoryId,
        machineId: selectedMachine.id,
        machineNumber: selectedMachine.number,
        beamNo: normalizedBeamNo,
        totalMeters: normalizedMeters,
        startDate,
        endDate: null,
        isActive: true,
        producedMeters: 0,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      invalidateFactoryCache(factoryId, ["beams"]);
      setBeamNo("");
      setBeamMeters("");
      setBeamStartDate("");
      setMessage({ tone: "success", text: "Beam added successfully." });
      await loadActiveBeam(selectedMachine, true);
    } catch (error) {
      console.error("Add beam failed:", error);
      setMessage({ tone: "error", text: "Beam could not be added." });
    } finally {
      setBusyAction("");
    }
  }

  const producedMeters = Number(activeBeam?.producedMeters) || 0;
  const remainingMeters = activeBeam
    ? Math.max((Number(activeBeam.totalMeters) || 0) - producedMeters, 0)
    : 0;
  const shortagePercent =
    activeBeam && Number(activeBeam.totalMeters) > 0
      ? (remainingMeters / Number(activeBeam.totalMeters)) * 100
      : 0;

  return (
    <>
      <PageHeader
        eyebrow="Beams"
        title="Beam lifecycle"
        subtitle="Inspect active beams by machine, edit beam details, and replace a beam while preserving its handoff timeline."
      />

      <StatusMessage tone={message.tone}>{message.text}</StatusMessage>

      <div className="split-layout split-layout--narrow">
        <PageCard>
          <SectionIntro
            eyebrow="Lookup"
            title="Select machine"
            description="Use the machine number to inspect the current beam and its production balance."
          />

          <FormField label="Machine Number" htmlFor="machineNumberInput">
            <input
              id="machineNumberInput"
              type="number"
              value={machineNumberInput}
              placeholder="Enter machine number"
              onChange={(event) => setMachineNumberInput(event.target.value)}
              onBlur={() => handleMachineLookup()}
              onKeyDown={handleMachineKeyDown}
            />
          </FormField>

          <div className="beam-panel">
            {activeBeam ? (
              <>
                {!isEditing ? (
                  <div className="metric-list">
                    <div className="metric-list__item">
                      <span>Machine number</span>
                      <strong>{activeBeam.machineNumber}</strong>
                    </div>
                    <div className="metric-list__item">
                      <span>Active beam</span>
                      <strong>{activeBeam.beamNo}</strong>
                    </div>
                    <div className="metric-list__item">
                      <span>Total meters</span>
                      <strong>{formatNumber(activeBeam.totalMeters)} m</strong>
                    </div>
                    <div className="metric-list__item">
                      <span>Produced</span>
                      <strong>{formatNumber(producedMeters)} m</strong>
                    </div>
                    <div className="metric-list__item">
                      <span>Remaining</span>
                      <strong>{formatNumber(remainingMeters)} m</strong>
                    </div>
                    <div className="metric-list__item">
                      <span>Shortage %</span>
                      <strong>{formatPercent(shortagePercent, 2)}</strong>
                    </div>
                  </div>
                ) : (
                  <div className="stack-form">
                    <FormField label="Beam No" htmlFor="editBeamNo">
                      <input
                        id="editBeamNo"
                        type="text"
                        value={editBeamNo}
                        onChange={(event) => setEditBeamNo(event.target.value)}
                      />
                    </FormField>

                    <FormField label="Total Meters" htmlFor="editBeamMeters">
                      <input
                        id="editBeamMeters"
                        type="number"
                        value={editBeamMeters}
                        onChange={(event) => setEditBeamMeters(event.target.value)}
                      />
                    </FormField>
                  </div>
                )}

                <div className="button-row button-row--inline">
                  {!isEditing ? (
                    <Button type="button" onClick={() => setIsEditing(true)}>
                      Edit Beam
                    </Button>
                  ) : (
                    <>
                      <Button type="button" loading={busyAction === "save-edit"} onClick={handleSaveEdit}>
                        Save Changes
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => setIsEditing(false)}>
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <EmptyState title="No active beam" description={statusText} />
            )}
          </div>
        </PageCard>

        <PageCard>
          <SectionIntro
            eyebrow="Replacement"
            title="Add or replace beam"
            description="When a beam is replaced, the previous active beam is closed with the selected start date."
          />

          {selectedMachine ? (
            <div className="stack-form">
              <FormField label="Beam No / ID" htmlFor="beamNo">
                <input
                  id="beamNo"
                  type="text"
                  value={beamNo}
                  placeholder="Beam No / ID"
                  onChange={(event) => setBeamNo(event.target.value)}
                />
              </FormField>

              <FormField label="Total Meters" htmlFor="beamMeters">
                <input
                  id="beamMeters"
                  type="number"
                  value={beamMeters}
                  placeholder="Total meters"
                  onChange={(event) => setBeamMeters(event.target.value)}
                />
              </FormField>

              <FormField label="Beam Start Date" htmlFor="beamStartDate">
                <input
                  id="beamStartDate"
                  type="date"
                  value={beamStartDate}
                  onChange={(event) => setBeamStartDate(event.target.value)}
                />
              </FormField>

              <Button type="button" loading={busyAction === "add-beam"} onClick={handleAddBeam}>
                Add Beam
              </Button>
            </div>
          ) : (
            <EmptyState
              title="Machine required"
              description="Load a machine first so LoomTrack can attach the beam to the correct production line."
            />
          )}
        </PageCard>
      </div>
    </>
  );
}
