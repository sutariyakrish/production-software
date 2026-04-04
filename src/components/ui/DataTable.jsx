export default function DataTable({
  children,
  className = "",
  wrapperClassName = "",
}) {
  return (
    <div className={`table-scroll ${wrapperClassName}`.trim()}>
      <table className={`app-table ${className}`.trim()}>{children}</table>
    </div>
  );
}
