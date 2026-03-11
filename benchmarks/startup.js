// startup.js — Node.js process startup and module loading benchmarks.
// Each exported function accepts a ctx object:
//   { runAll, BINS, NAMES, N, WARMUP, ITERATIONS }

"use strict";

const { makeDurationResult } = require("./helpers");

function benchStartupTime(ctx) {
  const { runAll, NAMES, N, WARMUP, ITERATIONS } = ctx;
  const times = Array.from({ length: N }, () => []);

  for (let i = 0; i < WARMUP; i++) runAll(["-e", "0"]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAll(["-e", "0"]).forEach((r, idx) => times[idx].push(r.durationMs));
  }
  return makeDurationResult('Startup Time (node -e "0")', NAMES, times);
}

function benchRequireFS(ctx) {
  const { runAll, NAMES, N, WARMUP, ITERATIONS } = ctx;
  const code = `const fs = require('fs'); process.exit(0);`;
  const times = Array.from({ length: N }, () => []);

  for (let i = 0; i < WARMUP; i++) runAll(["-e", code]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAll(["-e", code]).forEach((r, idx) => times[idx].push(r.durationMs));
  }
  return makeDurationResult('require("fs") + exit', NAMES, times);
}

function benchRequireHeavy(ctx) {
  const { runAll, NAMES, N, WARMUP, ITERATIONS } = ctx;
  const code = `
    require('http'); require('https'); require('crypto'); require('fs');
    require('path'); require('os'); require('url'); require('stream');
    require('zlib'); require('events'); process.exit(0);
  `;
  const times = Array.from({ length: N }, () => []);

  for (let i = 0; i < WARMUP; i++) runAll(["-e", code]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAll(["-e", code]).forEach((r, idx) => times[idx].push(r.durationMs));
  }
  return makeDurationResult("Require 10 core modules", NAMES, times);
}

module.exports = { benchStartupTime, benchRequireFS, benchRequireHeavy };
