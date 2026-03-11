// system.js — Binary size and version metadata benchmarks.
// Each exported function accepts a ctx object:
//   { runAll, BINS, NAMES, N, WARMUP, ITERATIONS }

"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");

/**
 * Returns the on-disk size for each binary.
 * No execution — purely a stat call.
 */
function benchBinarySize(ctx) {
  const { BINS, NAMES } = ctx;
  const sizes = BINS.map((b) => fs.statSync(b).size);
  const { formatBytes, pickWinner } = require("./helpers");
  return {
    name: "Binary Size",
    values: sizes,
    fmts: sizes.map(formatBytes),
    stds: null,
    rawStds: null,
    winner: pickWinner(NAMES, sizes, true),
    unit: "bytes",
    lowerIsBetter: true,
  };
}

/**
 * Returns Node version strings and V8 versions for each binary.
 * Not a timed benchmark — used for the header info block.
 * @returns {{ name: string, bin: string, version: string, v8: string }[]}
 */
function benchVersionInfo(ctx) {
  const { BINS, NAMES } = ctx;
  return BINS.map((bin, i) => ({
    name: NAMES[i],
    bin,
    version: execFileSync(bin, ["--version"], { encoding: "utf8" }).trim(),
    v8: execFileSync(bin, ["-e", "console.log(process.versions.v8)"], {
      encoding: "utf8",
    }).trim(),
  }));
}

module.exports = { benchBinarySize, benchVersionInfo };
