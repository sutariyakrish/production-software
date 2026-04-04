function resolveStorage(type) {
  if (typeof window === "undefined") {
    return null;
  }

  if (type === "session") {
    return window.sessionStorage;
  }

  return window.localStorage;
}

export function readCachedValue(key, options = {}) {
  const { storage = "local", maxAge = Number.POSITIVE_INFINITY } = options;
  const storageObject = resolveStorage(storage);

  if (!storageObject) {
    return null;
  }

  try {
    const rawValue = storageObject.getItem(key);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);

    if (
      parsedValue &&
      typeof parsedValue === "object" &&
      typeof parsedValue.ts === "number" &&
      Date.now() - parsedValue.ts <= maxAge
    ) {
      return parsedValue.value;
    }

    storageObject.removeItem(key);
    return null;
  } catch (error) {
    storageObject.removeItem(key);
    return null;
  }
}

export function writeCachedValue(key, value, options = {}) {
  const { storage = "local" } = options;
  const storageObject = resolveStorage(storage);

  if (!storageObject) {
    return;
  }

  try {
    storageObject.setItem(
      key,
      JSON.stringify({
        ts: Date.now(),
        value,
      }),
    );
  } catch (error) {
    // Ignore storage write failures so the app still works without caching.
  }
}

export function removeCachedValuesByPrefix(prefix, options = {}) {
  const { storage = "local" } = options;
  const storageObject = resolveStorage(storage);

  if (!storageObject) {
    return;
  }

  const keysToDelete = [];

  for (let index = 0; index < storageObject.length; index += 1) {
    const key = storageObject.key(index);

    if (key && key.startsWith(prefix)) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach((key) => storageObject.removeItem(key));
}
