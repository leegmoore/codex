const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");

function isObject(value) {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function formatNumber(value) {
  return NUMBER_FORMATTER.format(value);
}

export function createRateLimitDisplay(target) {
  return function updateRateLimits(snapshot) {
    if (!target || typeof target !== "object") {
      return;
    }

    if (!isObject(snapshot)) {
      target.textContent = "";
      return;
    }

    const segments = [];
    for (const [name, raw] of Object.entries(snapshot)) {
      if (!isObject(raw)) {
        continue;
      }

      const limit = raw.limit;
      const remaining = raw.remaining;
      if (!isFiniteNumber(limit) || !isFiniteNumber(remaining)) {
        continue;
      }

      let segment = `${name} ${formatNumber(remaining)} / ${formatNumber(limit)}`;

      if (typeof raw.interval === "string" && raw.interval.trim().length > 0) {
        segment += ` (${raw.interval.trim()})`;
      }

      segments.push(segment);
    }

    if (segments.length === 0) {
      target.textContent = "";
      return;
    }

    target.textContent = `Rate limits · ${segments.join(" · ")}`;
  };
}
