// memory.js — Memory usage benchmarks.
// Each exported function accepts a ctx object:
//   { runAll, BINS, NAMES, N, WARMUP, ITERATIONS }

"use strict";

const { makeBytesResult } = require("./helpers");

function benchMemoryStartup(ctx) {
  const { runAll, NAMES, N, WARMUP, ITERATIONS } = ctx;
  const code = `setTimeout(() => { const m = process.memoryUsage(); console.log(JSON.stringify(m)); }, 100);`;

  for (let i = 0; i < WARMUP; i++) runAll(["-e", code]);

  const mems = Array.from({ length: N }, () => []);
  for (let i = 0; i < ITERATIONS; i++) {
    runAll(["-e", code]).forEach((r, idx) => {
      try {
        mems[idx].push(JSON.parse(r.stdout.trim()));
      } catch {}
    });
  }

  return [
    makeBytesResult(
      "Memory: RSS at startup",
      NAMES,
      mems.map((m) => m.map((x) => x.rss)),
    ),
    makeBytesResult(
      "Memory: Heap Used at startup",
      NAMES,
      mems.map((m) => m.map((x) => x.heapUsed)),
    ),
    makeBytesResult(
      "Memory: Heap Total at startup",
      NAMES,
      mems.map((m) => m.map((x) => x.heapTotal)),
    ),
    makeBytesResult(
      "Memory: External at startup",
      NAMES,
      mems.map((m) => m.map((x) => x.external)),
    ),
  ];
}

function benchMemoryHeavy(ctx) {
  const { runAll, NAMES, N, WARMUP, ITERATIONS } = ctx;
  const code = `
    const arr = [];
    for (let i = 0; i < 500000; i++) arr.push({ idx: i, data: 'x'.repeat(20) });
    console.log(JSON.stringify(process.memoryUsage()));
  `;

  const mems = Array.from({ length: N }, () => []);
  for (let i = 0; i < WARMUP; i++) runAll(["-e", code]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAll(["-e", code]).forEach((r, idx) => {
      try {
        mems[idx].push(JSON.parse(r.stdout.trim()));
      } catch {}
    });
  }

  return [
    makeBytesResult(
      "Memory: RSS under 500k objects",
      NAMES,
      mems.map((m) => m.map((x) => x.rss)),
    ),
    makeBytesResult(
      "Memory: Heap Used under 500k objects",
      NAMES,
      mems.map((m) => m.map((x) => x.heapUsed)),
    ),
  ];
}

module.exports = { benchMemoryStartup, benchMemoryHeavy };
