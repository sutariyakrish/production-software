export default function StatCard({
  label,
  value,
  meta = "",
  trend = "",
  trendTone = "neutral",
  accent = false,
}) {
  return (
    <article className={`stat-card ${accent ? "stat-card--accent" : ""}`.trim()}>
      <div className="stat-card__top">
        <p className="stat-card__label">{label}</p>
        {trend ? <span className={`trend-pill trend-pill--${trendTone}`}>{trend}</span> : null}
      </div>
      <div>
        <h3 className="stat-card__value">{value}</h3>
        {meta ? <p className="stat-card__meta">{meta}</p> : null}
      </div>
    </article>
  );
}
