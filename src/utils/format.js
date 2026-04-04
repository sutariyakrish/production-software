const numberFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

const compactNumberFormatter = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatNumber(value) {
  return numberFormatter.format(Number(value) || 0);
}

export function formatCompactNumber(value) {
  return compactNumberFormatter.format(Number(value) || 0);
}

export function formatMeters(value) {
  return `${formatNumber(value)} m`;
}

export function formatPercent(value, fractionDigits = 1) {
  return `${Number(value || 0).toFixed(fractionDigits)}%`;
}

export function formatSignedNumber(value) {
  const normalizedValue = Number(value) || 0;

  if (normalizedValue > 0) {
    return `+${formatNumber(normalizedValue)}`;
  }

  return formatNumber(normalizedValue);
}

export function formatSignedPercent(value, fractionDigits = 1) {
  const normalizedValue = Number(value) || 0;

  if (normalizedValue > 0) {
    return `+${normalizedValue.toFixed(fractionDigits)}%`;
  }

  return `${normalizedValue.toFixed(fractionDigits)}%`;
}
