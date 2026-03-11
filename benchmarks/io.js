// io.js — I/O and stream benchmarks exercising Node's C++ internals.
// Each exported function accepts a ctx object:
//   { runAll, BINS, NAMES, N, WARMUP, ITERATIONS }

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { makeDurationResult } = require("./helpers");

function benchFSRead(ctx) {
  const { runAll, NAMES, N, WARMUP, ITERATIONS } = ctx;
  const tmpFile = path.join(os.tmpdir(), "node_bench_test.txt");
  fs.writeFileSync(tmpFile, "x".repeat(64 * 1024)); // 64KB

  const code = `
    const { performance } = require('perf_hooks');
    const fs = require('fs');
    const start = performance.now();
    for (let i = 0; i < 5000; i++) {
      fs.readFileSync(${JSON.stringify(tmpFile.replace(/\\/g, "/"))});
    }
    console.log(performance.now() - start);
  `;
  const times = Array.from({ length: N }, () => []);
  for (let i = 0; i < WARMUP; i++) runAll(["-e", code]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAll(["-e", code]).forEach((r, idx) => {
      const t = parseFloat(r.stdout.trim());
      if (!isNaN(t)) times[idx].push(t);
    });
  }
  try {
    fs.unlinkSync(tmpFile);
  } catch {}
  return makeDurationResult("FS: readFileSync 64KB (5000x)", NAMES, times);
}

function benchStreamPipe(ctx) {
  // PassThrough pipe chain exercises Node's C++ stream internals
  const { runAll, NAMES, N, WARMUP, ITERATIONS } = ctx;
  const code = `
    const { performance } = require('perf_hooks');
    const { PassThrough } = require('stream');
    let done = 0;
    const total = 200;
    const chunk = Buffer.alloc(16 * 1024, 0x42);
    const start = performance.now();

    for (let r = 0; r < total; r++) {
      const src = new PassThrough();
      const mid = new PassThrough();
      const dst = new PassThrough();
      src.pipe(mid).pipe(dst);
      let bytes = 0;
      dst.on('data', (d) => { bytes += d.length; });
      dst.on('end', () => {
        if (++done === total) console.log(performance.now() - start);
      });
      for (let i = 0; i < 100; i++) src.write(chunk);
      src.end();
    }
  `;
  const times = Array.from({ length: N }, () => []);
  for (let i = 0; i < WARMUP; i++) runAll(["-e", code]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAll(["-e", code]).forEach((r, idx) => {
      const t = parseFloat(r.stdout.trim());
      if (!isNaN(t)) times[idx].push(t);
    });
  }
  return makeDurationResult("Stream pipe 3-chain (200x100 16KB)", NAMES, times);
}

module.exports = { benchFSRead, benchStreamPipe };
