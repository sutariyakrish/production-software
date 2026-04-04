import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ErrorCallout from "../components/ui/ErrorCallout";
import EmptyState from "../components/ui/EmptyState";
import PageCard from "../components/ui/PageCard";
import PageHeader from "../components/ui/PageHeader";
import SectionIntro from "../components/ui/SectionIntro";
import StatCard from "../components/ui/StatCard";
import { DashboardSkeleton } from "../components/ui/Skeleton";
import { useFactory } from "../contexts/FactoryContext";
import { getDashboardSnapshot } from "../services/dashboard";
import { formatDisplayDate, formatDisplayMonth } from "../utils/date";
import { formatCompactNumber, formatNumber, formatSignedPercent } from "../utils/format";

function getTrendTone(change) {
  if (change > 0) {
    return "success";
  }

  if (change < 0) {
    return "danger";
  }

  return "neutral";
}

function ProductionEntryCta() {
  return (
    <Link to="/production" className="button button--primary button--small">
      Open production entry
    </Link>
  );
}

export default function DashboardPage() {
  const { factoryId, factoryName } = useFactory();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadSeq = useRef(0);

  const loadDashboard = useCallback(() => {
    const id = ++loadSeq.current;

    if (!factoryId) {
      setLoading(false);
      setSnapshot(null);
      setError("");
      return;
    }

    setLoading(true);
    setError("");

    (async () => {
      try {
        const nextSnapshot = await getDashboardSnapshot(factoryId);
        if (loadSeq.current !== id) {
          return;
        }
        setSnapshot(nextSnapshot);
      } catch (loadError) {
        console.error("Dashboard load failed:", loadError);
        if (loadSeq.current !== id) {
          return;
        }
        setError("Dashboard data could not be loaded right now. Check your connection and try again.");
        setSnapshot(null);
      } finally {
        if (loadSeq.current === id) {
          setLoading(false);
        }
      }
    })();
  }, [factoryId]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const todayStats = snapshot?.todayStats;
  const monthStats = snapshot?.monthStats;
  const todayShiftTotal = useMemo(
    () => (todayStats?.dayShiftMeters || 0) + (todayStats?.nightShiftMeters || 0),
    [todayStats?.dayShiftMeters, todayStats?.nightShiftMeters],
  );

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Dashboard"
        subtitle={`Live production summary for ${factoryName || "the selected factory"}. Daily and monthly widgets reuse aggregate collections to keep load costs low.`}
        actions={
          <div className="header-badges">
            <span className="badge">{formatDisplayDate()}</span>
            <span className="badge badge--accent">{formatDisplayMonth()}</span>
          </div>
        }
      />

      {error ? (
        <ErrorCallout onRetry={loadDashboard} retryLabel="Retry loading dashboard">
          {error}
        </ErrorCallout>
      ) : null}

      {loading ? <DashboardSkeleton /> : null}

      {!loading && snapshot ? (
        <div className="dashboard-stack">
          <div className="dashboard-hero-grid">
            <StatCard
              label="Today Total"
              value={formatNumber(todayStats.totalMeters)}
              meta="Meters logged today"
              trend={formatSignedPercent(snapshot.todayTrend.percent)}
              trendTone={getTrendTone(snapshot.todayTrend.percent)}
              accent
            />
            <StatCard
              label="Day Shift"
              value={formatNumber(todayStats.dayShiftMeters)}
              meta="Current day-shift production"
            />
            <StatCard
              label="Night Shift"
              value={formatNumber(todayStats.nightShiftMeters)}
              meta="Current night-shift production"
            />
            <StatCard
              label="Month Total"
              value={formatCompactNumber(monthStats.totalMeters)}
              meta="Meters produced this month"
              trend={formatSignedPercent(snapshot.monthTrend.percent)}
              trendTone={getTrendTone(snapshot.monthTrend.percent)}
            />
          </div>

          <div className="dashboard-body-grid">
            <div className="dashboard-body-grid__main">
              <PageCard>
                <SectionIntro
                  eyebrow="Daily Summary"
                  title="Production focus"
                  description="See the strongest contributors and spot low-output gaps without leaving the dashboard."
                />

                <div className="summary-panels">
                  <div className="summary-panel">
                    <h3 className="summary-panel__title">Top machines today</h3>
                    {snapshot.todayTopMachines.length ? (
                      <div className="leaderboard-list">
                        {snapshot.todayTopMachines.map(([machine, meters], index) => (
                          <div key={machine} className="leaderboard-row">
                            <div className="leaderboard-row__rank">{index + 1}</div>
                            <div className="leaderboard-row__content">
                              <strong>{`Machine ${machine}`}</strong>
                              <span>{formatNumber(meters)} m</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        compact
                        title="No machine output yet"
                        description="Machine rankings will appear once production is recorded."
                        action={<ProductionEntryCta />}
                      />
                    )}
                  </div>

                  <div className="summary-panel">
                    <h3 className="summary-panel__title">Workers today</h3>
                    {snapshot.todayTopWorkers.length ? (
                      <div className="leaderboard-list">
                        {snapshot.todayTopWorkers.map(([worker, meters], index) => (
                          <div key={worker} className="leaderboard-row">
                            <div className="leaderboard-row__rank">{index + 1}</div>
                            <div className="leaderboard-row__content">
                              <strong>{worker}</strong>
                              <span>{formatNumber(meters)} m</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        compact
                        title="No worker leaderboard yet"
                        description="Worker rankings update from the daily aggregate as soon as production is saved."
                        action={<ProductionEntryCta />}
                      />
                    )}
                  </div>
                </div>
              </PageCard>

              <PageCard>
                <SectionIntro
                  eyebrow="Machine Performance"
                  title="Heatmap"
                  description="Machines with deeper shades are contributing more output today."
                />

                {Object.keys(todayStats.machineMap).length ? (
                  <div className="heatmap-grid">
                    {Object.entries(todayStats.machineMap)
                      .sort((left, right) => Number(left[0]) - Number(right[0]))
                      .map(([machine, meters]) => {
                        const ratio = snapshot.machineHeatmapMax
                          ? meters / snapshot.machineHeatmapMax
                          : 0;
                        let intensityClass = "heatmap-tile--low";

                        if (ratio >= 0.66) {
                          intensityClass = "heatmap-tile--high";
                        } else if (ratio >= 0.33) {
                          intensityClass = "heatmap-tile--medium";
                        }

                        return (
                          <div key={machine} className={`heatmap-tile ${intensityClass}`}>
                            <span>{`M${machine}`}</span>
                            <strong>{formatNumber(meters)}</strong>
                            <small>meters</small>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <EmptyState
                    title="Heatmap pending"
                    description="Save production for today to populate machine performance tiles."
                    action={<ProductionEntryCta />}
                  />
                )}
              </PageCard>
            </div>

            <div className="dashboard-body-grid__side">
              <PageCard>
                <SectionIntro
                  eyebrow="Monthly Summary"
                  title="Top workers leaderboard"
                  description="Leaders are ranked from the monthly aggregate so this panel stays light on reads."
                />

                {snapshot.monthTopWorkers.length ? (
                  <div className="leaderboard-list">
                    {snapshot.monthTopWorkers.map(([worker, meters], index) => (
                      <div key={worker} className="leaderboard-row leaderboard-row--dense">
                        <div className="leaderboard-row__rank">{index + 1}</div>
                        <div className="leaderboard-row__content">
                          <strong>{worker}</strong>
                          <span>{formatNumber(meters)} m this month</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    title="No monthly leaderboard yet"
                    description="Monthly rankings appear once production rolls into the aggregate collection."
                    action={<ProductionEntryCta />}
                  />
                )}
              </PageCard>

              <PageCard>
                <SectionIntro
                  eyebrow="Shift Comparison"
                  title="Day vs night"
                  description="Compare current shift mix before operators drill into production entry."
                />

                <div className="comparison-list">
                  <div className="comparison-row">
                    <div className="comparison-row__head">
                      <span>Day shift</span>
                      <strong>{formatNumber(todayStats.dayShiftMeters)} m</strong>
                    </div>
                    <div className="progress-bar">
                      <span
                        style={{
                          width: `${todayShiftTotal ? (todayStats.dayShiftMeters / todayShiftTotal) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="comparison-row">
                    <div className="comparison-row__head">
                      <span>Night shift</span>
                      <strong>{formatNumber(todayStats.nightShiftMeters)} m</strong>
                    </div>
                    <div className="progress-bar progress-bar--muted">
                      <span
                        style={{
                          width: `${todayShiftTotal ? (todayStats.nightShiftMeters / todayShiftTotal) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </PageCard>

              <PageCard>
                <SectionIntro
                  eyebrow="Smart Insights"
                  title="Signals"
                  description="Quick change indicators built from cached daily and monthly comparisons."
                />

                <div className="insight-list">
                  {snapshot.insights.map((insight) => (
                    <div key={insight.id} className="insight-card">
                      <div className="insight-card__header">
                        <span>{insight.title}</span>
                        {typeof insight.change === "number" ? (
                          <strong className={`trend-text trend-text--${getTrendTone(insight.change)}`}>
                            {formatSignedPercent(insight.change)}
                          </strong>
                        ) : null}
                      </div>
                      <div className="insight-card__value">{insight.value}</div>
                      <p className="insight-card__copy">{insight.note}</p>
                    </div>
                  ))}
                </div>
              </PageCard>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
