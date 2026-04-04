export default function PageCard({ children, className = "" }) {
  return <section className={`page-card ${className}`.trim()}>{children}</section>;
}
