import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import FormField from "../components/ui/FormField";
import PageCard from "../components/ui/PageCard";
import ThemeToggle from "../components/ui/ThemeToggle";
import StatusMessage from "../components/ui/StatusMessage";
import { useAuth } from "../contexts/AuthContext";
import { useFactory } from "../contexts/FactoryContext";
import { useToast } from "../contexts/ToastContext";
import { auth, db } from "../lib/firebase";

export default function FactoriesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectFactory, clearFactorySelection } = useFactory();
  const { showToast } = useToast();

  const createCardRef = useRef(null);

  const [factories, setFactories] = useState([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState("");

  const [factorySearch, setFactorySearch] = useState("");
  const [factoryNameInput, setFactoryNameInput] = useState("");
  const [machineCount, setMachineCount] = useState("");

  const [loadingFactories, setLoadingFactories] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState({ tone: "neutral", text: "" });

  useEffect(() => {
    if (user?.uid) {
      loadFactories(user.uid);
    }
  }, [user]);

  async function loadFactories(uid) {
    setLoadingFactories(true);
    setMessage({ tone: "neutral", text: "" });

    try {
      const snapshot = await getDocs(
        query(collection(db, "factories"), where("createdBy", "==", uid), where("isActive", "==", true)),
      );

      setFactories(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    } catch (error) {
      console.error("Load factories failed:", error);
      setMessage({ tone: "error", text: "Factories could not be loaded." });
    } finally {
      setLoadingFactories(false);
    }
  }

  const filteredFactories = useMemo(() => {
    const queryText = factorySearch.trim().toLowerCase();
    if (!queryText) {
      return factories;
    }

    return factories.filter((factory) => String(factory.name || "").toLowerCase().includes(queryText));
  }, [factories, factorySearch]);

  function handleProceed() {
    const selectedFactory = factories.find((factory) => factory.id === selectedFactoryId);

    if (!selectedFactory) {
      setMessage({ tone: "error", text: "Select a factory to continue." });
      return;
    }

    selectFactory({ id: selectedFactory.id, name: selectedFactory.name });
    showToast({ tone: "success", message: `Welcome to ${selectedFactory.name}` });
    navigate("/dashboard", { replace: true });
  }

  async function handleCreateFactory() {
    const normalizedName = factoryNameInput.trim();
    const normalizedMachineCount = Number(machineCount);

    if (!user || !normalizedName || normalizedMachineCount <= 0) {
      setMessage({ tone: "error", text: "Enter a factory name and machine count." });
      return;
    }

    setIsCreating(true);
    setMessage({ tone: "neutral", text: "" });

    try {
      const factoryRef = await addDoc(collection(db, "factories"), {
        name: normalizedName,
        machineCount: normalizedMachineCount,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        isActive: true,
      });

      const batch = writeBatch(db);
      for (let index = 1; index <= normalizedMachineCount; index += 1) {
        batch.set(
          doc(db, "factories", factoryRef.id, "machines", `machine_${index}`),
          {
            machineNumber: index,
            status: "idle",
            isActive: true,
            createdAt: serverTimestamp(),
          },
        );
      }

      await batch.commit();

      setFactoryNameInput("");
      setMachineCount("");
      setSelectedFactoryId(factoryRef.id);
      setMessage({ tone: "neutral", text: "" });
      showToast({ tone: "success", message: "Factory created successfully." });

      await loadFactories(user.uid);
    } catch (error) {
      console.error("Create factory failed:", error);
      setMessage({ tone: "error", text: "Factory could not be created." });
    } finally {
      setIsCreating(false);
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      sessionStorage.clear();
      clearFactorySelection();
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Logout failed:", error);
      window.alert("Logout failed. Please try again.");
    }
  }

  return (
    <div className="factory-shell">
      <div className="factory-shell__header">
        <div>
          <p className="eyebrow">Factory Setup</p>
          <h1 className="hero-title hero-title--compact">Choose the factory workspace</h1>
          <p className="hero-copy hero-copy--compact">
            Select an existing factory or create a new one with the same machine-seeding workflow used by LoomTrack production.
          </p>
        </div>

        <div className="factory-shell__actions">
          <ThemeToggle />
          <Button type="button" variant="secondary" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>

      <div className="factory-grid">
        <PageCard className="factory-panel">
          <h2 className="panel-title">Select Factory</h2>
          <p className="panel-copy">Continue with an existing workspace.</p>

          <FormField label="Search" htmlFor="factorySearch" className="factory-search">
            <input
              id="factorySearch"
              type="text"
              value={factorySearch}
              placeholder="Search by factory name"
              onChange={(e) => setFactorySearch(e.target.value)}
            />
          </FormField>

          {loadingFactories ? (
            <div className="factory-list" aria-busy="true" aria-label="Loading factories">
              {[1, 2, 3].map((i) => (
                <div key={i} className="factory-option">
                  <div style={{ flex: 1 }}>
                    <div className="skeleton-block skeleton-line skeleton-line--title" style={{ height: 18, width: "55%" }} />
                    <div className="skeleton-block skeleton-line skeleton-line--copy" style={{ height: 12, width: "70%", marginTop: 8 }} />
                  </div>
                  <div className="skeleton-block" style={{ height: 28, width: 120 }} />
                </div>
              ))}
            </div>
          ) : filteredFactories.length ? (
            <>
              <div className="factory-list" role="list" aria-label="Factories">
                {filteredFactories.map((factory) => {
                  const isActive = factory.id === selectedFactoryId;
                  return (
                    <button
                      key={factory.id}
                      type="button"
                      className={`factory-option ${isActive ? "factory-option--active" : ""}`.trim()}
                      onClick={() => setSelectedFactoryId(factory.id)}
                      aria-pressed={isActive}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div className="factory-option__name">{factory.name}</div>
                        <div className="factory-option__meta">
                          {factory.machineCount ? `${factory.machineCount} production lines` : "Factory workspace"}
                        </div>
                      </div>
                      <span className={`badge ${isActive ? "badge--accent" : ""}`.trim()}>
                        {isActive ? "Selected" : "Select"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ marginTop: 16 }}>
                <Button
                  type="button"
                  block
                  disabled={!selectedFactoryId}
                  onClick={handleProceed}
                >
                  Proceed
                </Button>
              </div>
            </>
          ) : (
            <EmptyState
              title="No factories available"
              description="Create a factory to start tracking production, workers, and beams."
              action={
                <Button
                  type="button"
                  onClick={() => createCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  Create a factory
                </Button>
              }
            />
          )}
        </PageCard>

        <div ref={createCardRef}>
          <PageCard className="factory-panel factory-panel--accent">
            <h2 className="panel-title">Create New Factory</h2>
            <p className="panel-copy">Create a factory and seed all machine records in one step.</p>

            <div className="stack-form">
              <FormField label="Factory Name" htmlFor="factoryName">
                <input
                  id="factoryName"
                  type="text"
                  value={factoryNameInput}
                  placeholder="Factory Name"
                  onChange={(event) => setFactoryNameInput(event.target.value)}
                />
              </FormField>

              <FormField label="Number of Production Lines" htmlFor="machineCount">
                <input
                  id="machineCount"
                  type="number"
                  min="1"
                  value={machineCount}
                  placeholder="Number of Production Lines"
                  onChange={(event) => setMachineCount(event.target.value)}
                />
              </FormField>

              <Button
                type="button"
                block
                loading={isCreating}
                onClick={handleCreateFactory}
              >
                Create Factory
              </Button>
            </div>
          </PageCard>
        </div>
      </div>

      <StatusMessage tone={message.tone}>{message.text}</StatusMessage>
    </div>
  );
}

