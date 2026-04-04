export default function StatusMessage({ tone = "neutral", children, className = "" }) {
  if (!children) {
    return null;
  }

  return <p className={`notice notice--${tone} ${className}`.trim()}>{children}</p>;
}
