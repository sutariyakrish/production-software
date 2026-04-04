function padNumber(value) {
  return String(value).padStart(2, "0");
}

function toDateValue(input) {
  if (!input) {
    return new Date();
  }

  if (input instanceof Date) {
    return input;
  }

  return new Date(input);
}

export function toDateKey(input = new Date()) {
  const value = toDateValue(input);
  return `${value.getFullYear()}-${padNumber(value.getMonth() + 1)}-${padNumber(value.getDate())}`;
}

export function toMonthKey(input = new Date()) {
  const value = toDateValue(input);
  return `${value.getFullYear()}-${padNumber(value.getMonth() + 1)}`;
}

export function getPreviousDateKey(dateKey) {
  const value = new Date(`${dateKey}T00:00:00`);
  value.setDate(value.getDate() - 1);
  return toDateKey(value);
}

export function getPreviousMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const value = new Date(year, month - 2, 1);
  return toMonthKey(value);
}

export function getMonthBounds(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);

  return {
    startKey: toDateKey(start),
    endKey: toDateKey(end),
  };
}

export function formatDisplayDate(input = new Date()) {
  return toDateValue(input).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDisplayMonth(input = new Date()) {
  return toDateValue(input).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

export function formatDisplayRange(startKey, endKey) {
  if (!startKey || !endKey) {
    return "";
  }

  if (startKey === endKey) {
    return formatDisplayDate(`${startKey}T00:00:00`);
  }

  return `${formatDisplayDate(`${startKey}T00:00:00`)} to ${formatDisplayDate(`${endKey}T00:00:00`)}`;
}

export function resolveReportRange(dateMode, singleDay, fromDate, toDate, monthSelect) {
  if (dateMode === "day" && singleDay) {
    return {
      startKey: singleDay,
      endKey: singleDay,
      label: formatDisplayDate(`${singleDay}T00:00:00`),
    };
  }

  if (dateMode === "range" && fromDate && toDate) {
    return {
      startKey: fromDate,
      endKey: toDate,
      label: formatDisplayRange(fromDate, toDate),
    };
  }

  if (dateMode === "month" && monthSelect) {
    const bounds = getMonthBounds(monthSelect);

    return {
      ...bounds,
      label: formatDisplayMonth(`${monthSelect}-01T00:00:00`),
    };
  }

  return {
    startKey: "",
    endKey: "",
    label: "",
  };
}
