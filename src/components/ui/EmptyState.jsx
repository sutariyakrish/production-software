export default function EmptyState({
  title,
  description,
  action = null,
  compact = false,
}) {
  return (
    <div className={`empty-panel ${compact ? "empty-panel--compact" : ""}`.trim()}>
      <div>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="empty-panel__action">{action}</div> : null}
    </div>
  );
}
