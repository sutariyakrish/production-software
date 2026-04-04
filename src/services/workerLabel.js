export function formatWorkerLabel(workerName, ranges = []) {
  if (!ranges.length) {
    return workerName;
  }

  const parts = ranges.map((range) =>
    range.from === range.to ? `${range.from}` : `${range.from}-${range.to}`,
  );

  return `${workerName} ${parts.join(" ")}`;
}
