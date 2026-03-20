// Shared statistical helpers, formatters, and benchmark result builders.
// All benchmark files import from here.

"use strict";

// ─── Statistics ───────────────────────────────────────────────────────────────

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr) {
  const m = mean(arr);
  return Math.sqrt(
    arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1),
  );
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + " KB";
  return bytes + " B";
}

function formatMs(ms) {
  return ms.toFixed(2) + " ms";
}

function pctDiff(a, b) {
  const diff = ((b - a) / a) * 100;
  const sign = diff > 0 ? "+" : "";
  return sign + diff.toFixed(2) + "%";
}

// ─── Winner selection ─────────────────────────────────────────────────────────

/**
 * Pick the winning binary name from an array of values.
 * Returns a name from `names`, or '~Tie' (statistically indistinguishable),
 * or 'Tie' (exact equal values across all binaries).
 *
 * @param {string[]} names - binary name for each index
 * @param {number[]} values - one measurement per binary
 * @param {boolean} lowerIsBetter
 * @param {number[]|null} rawStds - per-binary stddev; enables statistical tie detection
 */
function pickWinner(names, values, lowerIsBetter = true, rawStds = null) {
  let bestIdx = 0;
  for (let i = 1; i < values.length; i++) {
    if (
      lowerIsBetter ? values[i] < values[bestIdx] : values[i] > values[bestIdx]
    )
      bestIdx = i;
  }
  if (values.every((v) => v === values[bestIdx])) return "Tie";
  if (rawStds) {
    const best = values[bestIdx];
    // For N>2: ~Tie only when ALL non-best overlap with best.
    // For N=2: same effect (one pair to check).
    let allOverlap = true;
    for (let i = 0; i < values.length; i++) {
      if (i === bestIdx) continue;
      const diff = Math.abs(values[i] - best);
      const noise = Math.max(rawStds[bestIdx], rawStds[i]);
      // When stddev is zero (discrete/constant values), use 0.5% of the
      // larger value as a minimum noise floor so V8 rounding artefacts
      // (a few bytes, a few µs) don't produce false winners.
      const floor = noise === 0 ? Math.max(values[i], best) * 0.005 : 0;
      if (diff > noise + floor) {
        allOverlap = false;
        break;
      }
    }
    if (allOverlap) return "~Tie";
  }
  return names[bestIdx];
}

// ─── Result builders ──────────────────────────────────────────────────────────

/**
 * Build a BenchResult from per-binary timing sample arrays.
 * @param {string} name - benchmark display name
 * @param {string[]} names - binary name for each index
 * @param {number[][]} times - outer index = binary, inner = samples (ms)
 * @returns {BenchResult}
 */
function makeDurationResult(name, names, times) {
  const values = times.map((t) => median(t));
  const rawStds = times.map((t) => stddev(t));
  return {
    name,
    values,
    fmts: values.map((v) => formatMs(v)),
    stds: rawStds.map((s) => formatMs(s)),
    rawStds,
    winner: pickWinner(names, values, true, rawStds),
    unit: "ms",
    lowerIsBetter: true,
  };
}

/**
 * Build a BenchResult from per-binary byte-value sample arrays.
 * @param {string} name - benchmark display name
 * @param {string[]} names - binary name for each index
 * @param {number[][]} arrays - outer index = binary, inner = samples (bytes)
 * @returns {BenchResult}
 */
function makeBytesResult(name, names, arrays) {
  const values = arrays.map((a) => median(a));
  const rawStds = arrays.map((a) => stddev(a));
  return {
    name,
    values,
    fmts: values.map((v) => formatBytes(v)),
    stds: rawStds.map((s) => formatBytes(s)),
    rawStds,
    winner: pickWinner(names, values, true, rawStds),
    unit: "bytes",
    lowerIsBetter: true,
  };
}

module.exports = {
  median,
  mean,
  stddev,
  formatBytes,
  formatMs,
  pctDiff,
  pickWinner,
  makeDurationResult,
  makeBytesResult,
};
