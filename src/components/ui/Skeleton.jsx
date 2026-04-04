export function Skeleton({ className = "", style, ...props }) {
  return (
    <div
      className={`skeleton-block ${className}`.trim()}
      style={style}
      aria-hidden
      {...props}
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div
      className="dashboard-stack dashboard-skeleton"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <div className="dashboard-hero-grid">
        {[1, 2, 3, 4].map((key) => (
          <div key={key} className="skeleton-stat-card">
            <Skeleton className="skeleton-stat-card__label" />
            <Skeleton className="skeleton-stat-card__value" />
            <Skeleton className="skeleton-stat-card__meta" />
          </div>
        ))}
      </div>

      <div className="dashboard-body-grid">
        <div className="dashboard-body-grid__main dashboard-stack">
          <div className="page-card skeleton-panel">
            <Skeleton className="skeleton-line skeleton-line--short" />
            <Skeleton className="skeleton-line skeleton-line--title" />
            <Skeleton className="skeleton-line skeleton-line--copy" />
            <div className="summary-panels">
              <div className="skeleton-summary">
                <Skeleton className="skeleton-line skeleton-line--sm" />
                {[1, 2, 3, 4, 5].map((key) => (
                  <div key={key} className="skeleton-leader-row">
                    <Skeleton className="skeleton-circle" />
                    <div className="skeleton-leader-row__text">
                      <Skeleton className="skeleton-line skeleton-line--md" />
                      <Skeleton className="skeleton-line skeleton-line--xs" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="skeleton-summary">
                <Skeleton className="skeleton-line skeleton-line--sm" />
                {[1, 2, 3, 4, 5].map((key) => (
                  <div key={key} className="skeleton-leader-row">
                    <Skeleton className="skeleton-circle" />
                    <div className="skeleton-leader-row__text">
                      <Skeleton className="skeleton-line skeleton-line--md" />
                      <Skeleton className="skeleton-line skeleton-line--xs" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="page-card skeleton-panel">
            <Skeleton className="skeleton-line skeleton-line--short" />
            <Skeleton className="skeleton-line skeleton-line--title" />
            <div className="skeleton-heatmap">
              {[1, 2, 3, 4, 5, 6].map((key) => (
                <Skeleton key={key} className="skeleton-heatmap-tile" />
              ))}
            </div>
          </div>
        </div>

        <div className="dashboard-body-grid__side dashboard-stack">
          <div className="page-card skeleton-panel">
            <Skeleton className="skeleton-line skeleton-line--short" />
            <Skeleton className="skeleton-line skeleton-line--title" />
            {[1, 2, 3, 4].map((key) => (
              <div key={key} className="skeleton-leader-row">
                <Skeleton className="skeleton-circle" />
                <div className="skeleton-leader-row__text">
                  <Skeleton className="skeleton-line skeleton-line--md" />
                  <Skeleton className="skeleton-line skeleton-line--xs" />
                </div>
              </div>
            ))}
          </div>

          <div className="page-card skeleton-panel">
            <Skeleton className="skeleton-line skeleton-line--title" />
            <Skeleton className="skeleton-progress" />
            <Skeleton className="skeleton-progress" />
          </div>

          <div className="page-card skeleton-panel">
            <Skeleton className="skeleton-line skeleton-line--title" />
            {[1, 2, 3, 4].map((key) => (
              <Skeleton key={key} className="skeleton-insight" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({ columns = 4, rows = 6, wrapperClassName = "" }) {
  return (
    <div
      className={`table-scroll table-skeleton-wrap ${wrapperClassName}`.trim()}
      aria-busy="true"
      aria-label="Loading table"
    >
      <table className="app-table table-skeleton-table">
        <thead>
          <tr>
            {Array.from({ length: columns }, (_, index) => (
              <th key={index}>
                <Skeleton className="skeleton-line skeleton-line--th" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }, (_, colIndex) => (
                <td key={colIndex}>
                  <Skeleton className="skeleton-line skeleton-line--td" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
