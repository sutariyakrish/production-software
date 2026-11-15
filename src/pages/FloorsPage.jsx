import { useEffect, useMemo, useState } from "react";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import FormField from "../components/ui/FormField";
import PageCard from "../components/ui/PageCard";
import PageHeader from "../components/ui/PageHeader";
import SectionIntro from "../components/ui/SectionIntro";
import StatusMessage from "../components/ui/StatusMessage";
import { useFactory } from "../contexts/FactoryContext";
import { useToast } from "../contexts/ToastContext";
import { getFactoryMachines } from "../services/factoryData";
import { getFactoryFloors, saveFactoryFloors, validateFloors } from "../services/floors";

let rowSeed = 0;
function newRow(partial = {}) {
  rowSeed += 1;
  return {
    key: `row_${Date.now()}_${rowSeed}`,
    id: partial.id || "",
    name: partial.name ?? "",
    from: partial.from ? String(partial.from) : "",
    to: partial.to ? String(partial.to) : "",
  };
}

function rowsToFloors(rows) {
  return rows.map((row) => ({
    id: row.id,
    name: row.name.trim(),
    from: Number(row.from),
    to: Number(row.to),
  }));
}

export default function FloorsPage() {
  const { factoryId } = useFactory();
  const { showToast } = useToast();
  const [machineNumbers, setMachineNumbers] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [splitCount, setSplitCount] = useState("4");
  const [message, setMessage] = useState({ tone: "neutral", text: "" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setMessage({ tone: "neutral", text: "" });

      try {
        const [machines, floors] = await Promise.all([
          getFactoryMachines(factoryId),
          getFactoryFloors(factoryId, { force: true }),
        ]);

        if (cancelled) return;

        setMachineNumbers(
          (machines || []).map((machine) => Number(machine.machineNumber)).filter(Boolean),
        );
        setRows(floors.length ? floors.map((floor) => newRow(floor)) : []);
      } catch (error) {
        console.error("Floor setup load failed:", error);
        if (!cancelled) {
          setMessage({ tone: "error", text: "Floor setup could not be loaded." });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (factoryId) load();
    return () => {
      cancelled = true;
    };
  }, [factoryId]);

  const machineSet = useMemo(() => new Set(machineNumbers), [machineNumbers]);
  const maxMachine = machineNumbers.length ? Math.max(...machineNumbers) : 0;

  const unassigned = useMemo(() => {
    const floors = rowsToFloors(rows).filter((floor) => floor.from > 0 && floor.to >= floor.from);
    return machineNumbers.filter(
      (machine) => !floors.some((floor) => machine >= floor.from && machine <= floor.to),
    );
  }, [rows, machineNumbers]);

  function updateRow(key, field, value) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    setRows((current) => {
      const lastTo = current.reduce((max, row) => Math.max(max, Number(row.to) || 0), 0);
      const from = lastTo + 1;
      return [
        ...current,
        newRow({
          name: `Floor ${current.length + 1}`,
          from: from <= maxMachine ? from : "",
          to: from <= maxMachine ? maxMachine : "",
        }),
      ];
    });
  }

  function removeRow(key) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  function splitEqually() {
    const count = Number(splitCount);

    if (!Number.isInteger(count) || count <= 0 || !maxMachine) {
      setMessage({ tone: "error", text: "Enter how many floors to split the machines into." });
      return;
    }

    const perFloor = Math.ceil(maxMachine / count);
    const nextRows = [];

    for (let index = 0; index < count; index += 1) {
      const from = index * perFloor + 1;
      const to = Math.min((index + 1) * perFloor, maxMachine);
      if (from > maxMachine) break;
      nextRows.push(newRow({ name: `Floor ${index + 1}`, from, to }));
    }

    setRows(nextRows);
    setMessage({
      tone: "neutral",
      text: "Floors filled in. Adjust the ranges if your floors are not equal, then click Save Floors.",
    });
  }

  async function handleSave() {
    const floors = rowsToFloors(rows);
    const error = validateFloors(floors, machineSet);

    if (error) {
      setMessage({ tone: "error", text: error });
      return;
    }

    setSaving(true);
    setMessage({ tone: "neutral", text: "" });

    try {
      const saved = await saveFactoryFloors(factoryId, floors);
      setRows(saved.map((floor) => newRow(floor)));
      showToast({ tone: "success", message: "Floors saved." });
      setMessage({
        tone: "success",
        text: unassigned.length
          ? `Floors saved. ${unassigned.length} machine(s) are not on any floor yet.`
          : "Floors saved. Every machine is assigned to a floor.",
      });
    } catch (saveError) {
      console.error("Save floors failed:", saveError);
      setMessage({ tone: "error", text: "Floors could not be saved. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Floors"
        title="Floor setup"
        subtitle="Tell LoomTrack which machines are on which floor, for example Floor 1 = machines 1 to 92."
      />

      <StatusMessage tone={message.tone}>{message.text}</StatusMessage>

      <div className="split-layout floor-setup-layout">
        <PageCard>
          <SectionIntro
            eyebrow="Ranges"
            title="Machines on each floor"
            description={
              maxMachine
                ? `This factory has ${machineNumbers.length} machines (1 to ${maxMachine}).`
                : "Machine list is loading."
            }
          />

          {loading ? (
            <p className="panel-copy">Loading floors...</p>
          ) : rows.length ? (
            <div className="floor-rows">
              <div className="floor-row floor-row--head">
                <span>Floor name</span>
                <span>From machine</span>
                <span>To machine</span>
                <span>Machines</span>
                <span />
              </div>
              {rows.map((row) => {
                const from = Number(row.from);
                const to = Number(row.to);
                const count = from > 0 && to >= from ? to - from + 1 : 0;

                return (
                  <div key={row.key} className="floor-row">
                    <input
                      type="text"
                      aria-label="Floor name"
                      value={row.name}
                      placeholder="Floor name"
                      onChange={(event) => updateRow(row.key, "name", event.target.value)}
                    />
                    <input
                      type="number"
                      min="1"
                      aria-label="From machine"
                      value={row.from}
                      placeholder="From"
                      onChange={(event) => updateRow(row.key, "from", event.target.value)}
                    />
                    <input
                      type="number"
                      min="1"
                      aria-label="To machine"
                      value={row.to}
                      placeholder="To"
                      onChange={(event) => updateRow(row.key, "to", event.target.value)}
                    />
                    <span className="badge">{count}</span>
                    <Button
                      type="button"
                      variant="secondary"
                      className="button--small"
                      onClick={() => removeRow(row.key)}
                    >
                      Remove
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No floors yet"
              description="Add floors one by one, or split all machines equally using the panel on the right."
            />
          )}

          <div className="button-row button-row--inline" style={{ marginTop: 16 }}>
            <Button type="button" variant="secondary" onClick={addRow} disabled={loading}>
              Add Floor
            </Button>
            <Button type="button" loading={saving} onClick={handleSave} disabled={loading}>
              Save Floors
            </Button>
          </div>
        </PageCard>

        <div className="dashboard-stack">
          <PageCard>
            <SectionIntro
              eyebrow="Quick start"
              title="Split equally"
              description="Fills in equal ranges for you. You can still edit each range before saving."
            />
            <div className="stack-form">
              <FormField label="Number of floors" htmlFor="splitCount">
                <input
                  id="splitCount"
                  type="number"
                  min="1"
                  value={splitCount}
                  onChange={(event) => setSplitCount(event.target.value)}
                />
              </FormField>
              <Button type="button" variant="secondary" onClick={splitEqually} disabled={loading}>
                Fill ranges
              </Button>
            </div>
          </PageCard>

          <PageCard>
            <SectionIntro
              eyebrow="Check"
              title="Unassigned machines"
              description="Machines that are not inside any floor range."
            />
            {loading ? null : unassigned.length ? (
              <p className="panel-copy">
                <strong>{unassigned.length}</strong> machine(s):{" "}
                {unassigned.length > 40
                  ? `${unassigned.slice(0, 40).join(", ")} ...`
                  : unassigned.join(", ")}
              </p>
            ) : (
              <p className="panel-copy">All machines are on a floor.</p>
            )}
          </PageCard>
        </div>
      </div>
    </>
  );
}
