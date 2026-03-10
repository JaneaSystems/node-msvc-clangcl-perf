// Benchmark comparison: two compiled Node.js binaries
// Run with: node benchmark_compare.js <binary-a> <binary-b>

const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error(
    "Usage: node benchmark_compare.js <path-to-binary-a> <path-to-binary-b>",
  );
  process.exit(1);
}

const BIN_A = path.resolve(args[0]);
const BIN_B = path.resolve(args[1]);
if (!fs.existsSync(BIN_A)) {
  console.error(`Binary not found: ${BIN_A}`);
  process.exit(1);
}
if (!fs.existsSync(BIN_B)) {
  console.error(`Binary not found: ${BIN_B}`);
  process.exit(1);
}

function getBinaryName(binPath) {
  // Strip directory and extension (handles .exe on Windows, any extension on Linux)
  return path.basename(binPath).replace(/\.[^.]+$/, "");
}
const NAME_A = getBinaryName(BIN_A);
const NAME_B = getBinaryName(BIN_B);

const ITERATIONS = 30; // per benchmark
const WARMUP = 10;

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

function winner(aVal, bVal, lowerIsBetter = true, aStd = 0, bStd = 0) {
  if (aStd > 0 || bStd > 0) {
    if (Math.abs(aVal - bVal) < Math.max(aStd, bStd)) return "~Tie";
  }
  if (lowerIsBetter) return aVal < bVal ? NAME_A : aVal > bVal ? NAME_B : "Tie";
  return aVal > bVal ? NAME_A : aVal < bVal ? NAME_B : "Tie";
}

function runTimed(bin, binArgs, options = {}) {
  const start = process.hrtime.bigint();
  const result = spawnSync(bin, binArgs, {
    encoding: "utf8",
    timeout: 60000,
    windowsHide: true,
    ...options,
  });
  const end = process.hrtime.bigint();
  return {
    durationMs: Number(end - start) / 1e6,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    status: result.status,
  };
}

function runBothTimed(binArgs, options = {}) {
  if (Math.random() < 0.5) {
    const a = runTimed(BIN_A, binArgs, options);
    const b = runTimed(BIN_B, binArgs, options);
    return { a, b };
  } else {
    const b = runTimed(BIN_B, binArgs, options);
    const a = runTimed(BIN_A, binArgs, options);
    return { a, b };
  }
}

// ─── Benchmarks ────────────────────────────────────────────────────────────────

function benchBinarySize() {
  const sizeA = fs.statSync(BIN_A).size;
  const sizeB = fs.statSync(BIN_B).size;
  return {
    name: "Binary Size",
    a: sizeA,
    b: sizeB,
    aFmt: formatBytes(sizeA),
    bFmt: formatBytes(sizeB),
    diff: pctDiff(sizeA, sizeB),
    winner: winner(sizeA, sizeB),
    unit: "bytes",
    lowerIsBetter: true,
  };
}

function benchStartupTime() {
  const times = { a: [], b: [] };

  // Warmup
  for (let i = 0; i < WARMUP; i++) runBothTimed(["-e", "0"]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { a, b } = runBothTimed(["-e", "0"]);
    times.a.push(a.durationMs);
    times.b.push(b.durationMs);
  }

  const medA = median(times.a);
  const medB = median(times.b);
  return {
    name: 'Startup Time (node -e "0")',
    a: medA,
    b: medB,
    aFmt: formatMs(medA),
    bFmt: formatMs(medB),
    aStd: formatMs(stddev(times.a)),
    bStd: formatMs(stddev(times.b)),
    diff: pctDiff(medA, medB),
    winner: winner(medA, medB, true, stddev(times.a), stddev(times.b)),
    unit: "ms",
    lowerIsBetter: true,
  };
}

function benchRequireFS() {
  const code = `const fs = require('fs'); process.exit(0);`;
  const times = { a: [], b: [] };

  for (let i = 0; i < WARMUP; i++) runBothTimed(["-e", code]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { a, b } = runBothTimed(["-e", code]);
    times.a.push(a.durationMs);
    times.b.push(b.durationMs);
  }

  const medA = median(times.a);
  const medB = median(times.b);
  return {
    name: 'require("fs") + exit',
    a: medA,
    b: medB,
    aFmt: formatMs(medA),
    bFmt: formatMs(medB),
    aStd: formatMs(stddev(times.a)),
    bStd: formatMs(stddev(times.b)),
    diff: pctDiff(medA, medB),
    winner: winner(medA, medB, true, stddev(times.a), stddev(times.b)),
    unit: "ms",
    lowerIsBetter: true,
  };
}

function benchRequireHeavy() {
  const code = `
    require('http');
    require('https');
    require('crypto');
    require('fs');
    require('path');
    require('os');
    require('url');
    require('stream');
    require('zlib');
    require('events');
    process.exit(0);
  `;
  const times = { a: [], b: [] };

  for (let i = 0; i < WARMUP; i++) runBothTimed(["-e", code]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { a, b } = runBothTimed(["-e", code]);
    times.a.push(a.durationMs);
    times.b.push(b.durationMs);
  }

  const medA = median(times.a);
  const medB = median(times.b);
  return {
    name: "Require 10 core modules",
    a: medA,
    b: medB,
    aFmt: formatMs(medA),
    bFmt: formatMs(medB),
    aStd: formatMs(stddev(times.a)),
    bStd: formatMs(stddev(times.b)),
    diff: pctDiff(medA, medB),
    winner: winner(medA, medB, true, stddev(times.a), stddev(times.b)),
    unit: "ms",
    lowerIsBetter: true,
  };
}

function benchMemoryStartup() {
  // Measure RSS after startup using a self-reporting script
  const code = `setTimeout(() => { const m = process.memoryUsage(); console.log(JSON.stringify(m)); }, 100);`;

  for (let i = 0; i < WARMUP; i++) runBothTimed(["-e", code]);

  const memA = [];
  const memB = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const { a: aR, b: bR } = runBothTimed(["-e", code]);
    try {
      memA.push(JSON.parse(aR.stdout.trim()));
    } catch {}
    try {
      memB.push(JSON.parse(bR.stdout.trim()));
    } catch {}
  }

  const aRSS = median(memA.map((m) => m.rss));
  const bRSS = median(memB.map((m) => m.rss));
  const aHeap = median(memA.map((m) => m.heapUsed));
  const bHeap = median(memB.map((m) => m.heapUsed));
  const aHeapTotal = median(memA.map((m) => m.heapTotal));
  const bHeapTotal = median(memB.map((m) => m.heapTotal));
  const aExternal = median(memA.map((m) => m.external));
  const bExternal = median(memB.map((m) => m.external));

  const aRSSArr = memA.map((m) => m.rss);
  const bRSSArr = memB.map((m) => m.rss);
  const aHeapArr = memA.map((m) => m.heapUsed);
  const bHeapArr = memB.map((m) => m.heapUsed);
  const aHeapTotalArr = memA.map((m) => m.heapTotal);
  const bHeapTotalArr = memB.map((m) => m.heapTotal);
  const aExternalArr = memA.map((m) => m.external);
  const bExternalArr = memB.map((m) => m.external);

  return [
    {
      name: "Memory: RSS at startup",
      a: aRSS,
      b: bRSS,
      aFmt: formatBytes(aRSS),
      bFmt: formatBytes(bRSS),
      aStd: formatBytes(stddev(aRSSArr)),
      bStd: formatBytes(stddev(bRSSArr)),
      diff: pctDiff(aRSS, bRSS),
      winner: winner(aRSS, bRSS, true, stddev(aRSSArr), stddev(bRSSArr)),
      unit: "bytes",
      lowerIsBetter: true,
    },
    {
      name: "Memory: Heap Used at startup",
      a: aHeap,
      b: bHeap,
      aFmt: formatBytes(aHeap),
      bFmt: formatBytes(bHeap),
      aStd: formatBytes(stddev(aHeapArr)),
      bStd: formatBytes(stddev(bHeapArr)),
      diff: pctDiff(aHeap, bHeap),
      winner: winner(aHeap, bHeap, true, stddev(aHeapArr), stddev(bHeapArr)),
      unit: "bytes",
      lowerIsBetter: true,
    },
    {
      name: "Memory: Heap Total at startup",
      a: aHeapTotal,
      b: bHeapTotal,
      aFmt: formatBytes(aHeapTotal),
      bFmt: formatBytes(bHeapTotal),
      aStd: formatBytes(stddev(aHeapTotalArr)),
      bStd: formatBytes(stddev(bHeapTotalArr)),
      diff: pctDiff(aHeapTotal, bHeapTotal),
      winner: winner(
        aHeapTotal,
        bHeapTotal,
        true,
        stddev(aHeapTotalArr),
        stddev(bHeapTotalArr),
      ),
      unit: "bytes",
      lowerIsBetter: true,
    },
    {
      name: "Memory: External at startup",
      a: aExternal,
      b: bExternal,
      aFmt: formatBytes(aExternal),
      bFmt: formatBytes(bExternal),
      aStd: formatBytes(stddev(aExternalArr)),
      bStd: formatBytes(stddev(bExternalArr)),
      diff: pctDiff(aExternal, bExternal),
      winner: winner(
        aExternal,
        bExternal,
        true,
        stddev(aExternalArr),
        stddev(bExternalArr),
      ),
      unit: "bytes",
      lowerIsBetter: true,
    },
  ];
}

function benchBufferOps() {
  const code = `
    const { performance } = require('perf_hooks');
    const start = performance.now();
    for (let i = 0; i < 50000; i++) {
      const buf = Buffer.alloc(1024);
      buf.fill(0xAB);
      const copy = Buffer.from(buf);
      copy.toString('hex');
    }
    console.log(performance.now() - start);
  `;
  const times = { a: [], b: [] };

  for (let i = 0; i < WARMUP; i++) runBothTimed(["-e", code]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { a: aR, b: bR } = runBothTimed(["-e", code]);
    const aT = parseFloat(aR.stdout.trim());
    const bT = parseFloat(bR.stdout.trim());
    if (!isNaN(aT)) times.a.push(aT);
    if (!isNaN(bT)) times.b.push(bT);
  }

  const medA = median(times.a);
  const medB = median(times.b);
  return {
    name: "Buffer ops (50k alloc+fill+hex)",
    a: medA,
    b: medB,
    aFmt: formatMs(medA),
    bFmt: formatMs(medB),
    aStd: formatMs(stddev(times.a)),
    bStd: formatMs(stddev(times.b)),
    diff: pctDiff(medA, medB),
    winner: winner(medA, medB, true, stddev(times.a), stddev(times.b)),
    unit: "ms",
    lowerIsBetter: true,
  };
}

function benchJSON() {
  const code = `
    const { performance } = require('perf_hooks');
    const obj = {};
    for (let i = 0; i < 200; i++) obj['key' + i] = { val: i, arr: [i, i*2, 'str'.repeat(10)] };
    const str = JSON.stringify(obj);
    const start = performance.now();
    for (let i = 0; i < 20000; i++) {
      JSON.parse(str);
      JSON.stringify(obj);
    }
    console.log(performance.now() - start);
  `;
  const times = { a: [], b: [] };

  for (let i = 0; i < WARMUP; i++) runBothTimed(["-e", code]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { a: aR, b: bR } = runBothTimed(["-e", code]);
    const aT = parseFloat(aR.stdout.trim());
    const bT = parseFloat(bR.stdout.trim());
    if (!isNaN(aT)) times.a.push(aT);
    if (!isNaN(bT)) times.b.push(bT);
  }

  const medA = median(times.a);
  const medB = median(times.b);
  return {
    name: "JSON parse+stringify (20k iters)",
    a: medA,
    b: medB,
    aFmt: formatMs(medA),
    bFmt: formatMs(medB),
    aStd: formatMs(stddev(times.a)),
    bStd: formatMs(stddev(times.b)),
    diff: pctDiff(medA, medB),
    winner: winner(medA, medB, true, stddev(times.a), stddev(times.b)),
    unit: "ms",
    lowerIsBetter: true,
  };
}

function benchFSRead() {
  // Create a temp file, then read it many times
  const tmpFile = path.join(os.tmpdir(), "node_bench_test.txt");
  fs.writeFileSync(tmpFile, "x".repeat(64 * 1024)); // 64KB file

  const code = `
    const { performance } = require('perf_hooks');
    const fs = require('fs');
    const start = performance.now();
    for (let i = 0; i < 5000; i++) {
      fs.readFileSync(${JSON.stringify(tmpFile.replace(/\\/g, "/"))});
    }
    console.log(performance.now() - start);
  `;
  const times = { a: [], b: [] };

  for (let i = 0; i < WARMUP; i++) runBothTimed(["-e", code]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { a: aR, b: bR } = runBothTimed(["-e", code]);
    const aT = parseFloat(aR.stdout.trim());
    const bT = parseFloat(bR.stdout.trim());
    if (!isNaN(aT)) times.a.push(aT);
    if (!isNaN(bT)) times.b.push(bT);
  }

  try {
    fs.unlinkSync(tmpFile);
  } catch {}

  const medA = median(times.a);
  const medB = median(times.b);
  return {
    name: "FS: readFileSync 64KB (5000x)",
    a: medA,
    b: medB,
    aFmt: formatMs(medA),
    bFmt: formatMs(medB),
    aStd: formatMs(stddev(times.a)),
    bStd: formatMs(stddev(times.b)),
    diff: pctDiff(medA, medB),
    winner: winner(medA, medB, true, stddev(times.a), stddev(times.b)),
    unit: "ms",
    lowerIsBetter: true,
  };
}

function benchURLParsing() {
  // Ada URL parser is pure compiled C++ — no JIT involvement
  const code = `
    const { performance } = require('perf_hooks');
    const urls = [
      'https://user:pass@example.com:8080/path/to/resource?query=value&foo=bar#fragment',
      'http://www.example.org/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p',
      'https://subdomain.deep.example.co.uk/path?q=1&w=2&e=3&r=4&t=5',
      'ftp://files.example.com/pub/docs/readme.txt',
      'https://example.com/' + 'a/'.repeat(50),
    ];
    const start = performance.now();
    for (let i = 0; i < 50000; i++) {
      new URL(urls[i % urls.length]);
    }
    console.log(performance.now() - start);
  `;
  const times = { a: [], b: [] };

  for (let i = 0; i < WARMUP; i++) runBothTimed(["-e", code]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { a: aR, b: bR } = runBothTimed(["-e", code]);
    const aT = parseFloat(aR.stdout.trim());
    const bT = parseFloat(bR.stdout.trim());
    if (!isNaN(aT)) times.a.push(aT);
    if (!isNaN(bT)) times.b.push(bT);
  }

  const medA = median(times.a);
  const medB = median(times.b);
  return {
    name: "URL parsing (50k, Ada C++)",
    a: medA,
    b: medB,
    aFmt: formatMs(medA),
    bFmt: formatMs(medB),
    aStd: formatMs(stddev(times.a)),
    bStd: formatMs(stddev(times.b)),
    diff: pctDiff(medA, medB),
    winner: winner(medA, medB, true, stddev(times.a), stddev(times.b)),
    unit: "ms",
    lowerIsBetter: true,
  };
}

function benchZlib() {
  // zlib is a compiled C library; Node wraps it with C++ bindings
  const code = `
    const { performance } = require('perf_hooks');
    const zlib = require('zlib');
    const data = Buffer.alloc(64 * 1024, 'abcdefghij0123456789');
    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      const compressed = zlib.deflateSync(data);
      zlib.inflateSync(compressed);
    }
    console.log(performance.now() - start);
  `;
  const times = { a: [], b: [] };

  for (let i = 0; i < WARMUP; i++) runBothTimed(["-e", code]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { a: aR, b: bR } = runBothTimed(["-e", code]);
    const aT = parseFloat(aR.stdout.trim());
    const bT = parseFloat(bR.stdout.trim());
    if (!isNaN(aT)) times.a.push(aT);
    if (!isNaN(bT)) times.b.push(bT);
  }

  const medA = median(times.a);
  const medB = median(times.b);
  return {
    name: "Zlib deflate+inflate 64KB (500x)",
    a: medA,
    b: medB,
    aFmt: formatMs(medA),
    bFmt: formatMs(medB),
    aStd: formatMs(stddev(times.a)),
    bStd: formatMs(stddev(times.b)),
    diff: pctDiff(medA, medB),
    winner: winner(medA, medB, true, stddev(times.a), stddev(times.b)),
    unit: "ms",
    lowerIsBetter: true,
  };
}

function benchTextCodec() {
  // TextEncoder/TextDecoder exercise compiled ICU + C++ string conversion
  const code = `
    const { performance } = require('perf_hooks');
    const enc = new TextEncoder();
    const dec = new TextDecoder('utf-8');
    const str = 'Hello \u{1F600} world! '.repeat(500);
    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      const encoded = enc.encode(str);
      dec.decode(encoded);
    }
    console.log(performance.now() - start);
  `;
  const times = { a: [], b: [] };

  for (let i = 0; i < WARMUP; i++) runBothTimed(["-e", code]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { a: aR, b: bR } = runBothTimed(["-e", code]);
    const aT = parseFloat(aR.stdout.trim());
    const bT = parseFloat(bR.stdout.trim());
    if (!isNaN(aT)) times.a.push(aT);
    if (!isNaN(bT)) times.b.push(bT);
  }

  const medA = median(times.a);
  const medB = median(times.b);
  return {
    name: "TextEncoder/Decoder (10k iters)",
    a: medA,
    b: medB,
    aFmt: formatMs(medA),
    bFmt: formatMs(medB),
    aStd: formatMs(stddev(times.a)),
    bStd: formatMs(stddev(times.b)),
    diff: pctDiff(medA, medB),
    winner: winner(medA, medB, true, stddev(times.a), stddev(times.b)),
    unit: "ms",
    lowerIsBetter: true,
  };
}

function benchStreamPipe() {
  // PassThrough pipe chain exercises Node's C++ stream internals
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
        if (++done === total) {
          console.log(performance.now() - start);
        }
      });
      for (let i = 0; i < 100; i++) src.write(chunk);
      src.end();
    }
  `;
  const times = { a: [], b: [] };

  for (let i = 0; i < WARMUP; i++) runBothTimed(["-e", code]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { a: aR, b: bR } = runBothTimed(["-e", code]);
    const aT = parseFloat(aR.stdout.trim());
    const bT = parseFloat(bR.stdout.trim());
    if (!isNaN(aT)) times.a.push(aT);
    if (!isNaN(bT)) times.b.push(bT);
  }

  const medA = median(times.a);
  const medB = median(times.b);
  return {
    name: "Stream pipe 3-chain (200x100 16KB)",
    a: medA,
    b: medB,
    aFmt: formatMs(medA),
    bFmt: formatMs(medB),
    aStd: formatMs(stddev(times.a)),
    bStd: formatMs(stddev(times.b)),
    diff: pctDiff(medA, medB),
    winner: winner(medA, medB, true, stddev(times.a), stddev(times.b)),
    unit: "ms",
    lowerIsBetter: true,
  };
}

function benchMemoryHeavy() {
  const code = `
    const arr = [];
    for (let i = 0; i < 500000; i++) arr.push({ idx: i, data: 'x'.repeat(20) });
    const m = process.memoryUsage();
    console.log(JSON.stringify(m));
  `;

  const memA = [];
  const memB = [];

  for (let i = 0; i < WARMUP; i++) runBothTimed(["-e", code]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { a: aR, b: bR } = runBothTimed(["-e", code]);
    try {
      memA.push(JSON.parse(aR.stdout.trim()));
    } catch {}
    try {
      memB.push(JSON.parse(bR.stdout.trim()));
    } catch {}
  }

  const aRSS = median(memA.map((m) => m.rss));
  const bRSS = median(memB.map((m) => m.rss));
  const aHeap = median(memA.map((m) => m.heapUsed));
  const bHeap = median(memB.map((m) => m.heapUsed));

  const aRSSArr = memA.map((m) => m.rss);
  const bRSSArr = memB.map((m) => m.rss);
  const aHeapArr = memA.map((m) => m.heapUsed);
  const bHeapArr = memB.map((m) => m.heapUsed);

  return [
    {
      name: "Memory: RSS under 500k objects",
      a: aRSS,
      b: bRSS,
      aFmt: formatBytes(aRSS),
      bFmt: formatBytes(bRSS),
      aStd: formatBytes(stddev(aRSSArr)),
      bStd: formatBytes(stddev(bRSSArr)),
      diff: pctDiff(aRSS, bRSS),
      winner: winner(aRSS, bRSS, true, stddev(aRSSArr), stddev(bRSSArr)),
      unit: "bytes",
      lowerIsBetter: true,
    },
    {
      name: "Memory: Heap Used under 500k objects",
      a: aHeap,
      b: bHeap,
      aFmt: formatBytes(aHeap),
      bFmt: formatBytes(bHeap),
      aStd: formatBytes(stddev(aHeapArr)),
      bStd: formatBytes(stddev(bHeapArr)),
      diff: pctDiff(aHeap, bHeap),
      winner: winner(aHeap, bHeap, true, stddev(aHeapArr), stddev(bHeapArr)),
      unit: "bytes",
      lowerIsBetter: true,
    },
  ];
}

function benchVersionInfo() {
  const versionA = execFileSync(BIN_A, ["--version"], {
    encoding: "utf8",
  }).trim();
  const versionB = execFileSync(BIN_B, ["--version"], {
    encoding: "utf8",
  }).trim();
  const v8A = execFileSync(BIN_A, ["-e", "console.log(process.versions.v8)"], {
    encoding: "utf8",
  }).trim();
  const v8B = execFileSync(BIN_B, ["-e", "console.log(process.versions.v8)"], {
    encoding: "utf8",
  }).trim();
  return { versionA, versionB, v8A, v8B };
}

// ─── Runner ────────────────────────────────────────────────────────────────────

function printTable(results) {
  const nameColW = 40;
  const valueColW = 18;
  const diffColW = 12;
  const winnerColW = Math.max(10, NAME_A.length + 2, NAME_B.length + 2);
  const sep = "-".repeat(nameColW + valueColW * 2 + diffColW + winnerColW + 12);

  console.log(sep);
  console.log(
    "| " +
      "Benchmark".padEnd(nameColW) +
      "| " +
      NAME_A.padEnd(valueColW) +
      "| " +
      NAME_B.padEnd(valueColW) +
      "| " +
      "Diff".padEnd(diffColW) +
      "| " +
      "Winner".padEnd(winnerColW) +
      "|",
  );
  console.log(sep);

  for (const r of results) {
    const aStr = r.aStd ? `${r.aFmt} ±${r.aStd}` : r.aFmt;
    const bStr = r.bStd ? `${r.bFmt} ±${r.bStd}` : r.bFmt;
    console.log(
      "| " +
        r.name.padEnd(nameColW) +
        "| " +
        aStr.padEnd(valueColW) +
        "| " +
        bStr.padEnd(valueColW) +
        "| " +
        r.diff.padEnd(diffColW) +
        "| " +
        r.winner.padEnd(winnerColW) +
        "|",
    );
  }
  console.log(sep);
}

async function main() {
  console.log(`=== Node.js Binary Benchmark: ${NAME_A} vs ${NAME_B} ===\n`);
  console.log(`Platform: ${os.platform()} ${os.arch()}`);
  console.log(`CPUs: ${os.cpus()[0].model} (${os.cpus().length} cores)`);
  console.log(`RAM: ${formatBytes(os.totalmem())}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Iterations per benchmark: ${ITERATIONS} (warmup: ${WARMUP})\n`);

  // Version info
  const vinfo = benchVersionInfo();
  console.log(`${NAME_A} binary: ${BIN_A}`);
  console.log(`  Node version: ${vinfo.versionA}, V8: ${vinfo.v8A}`);
  console.log(`${NAME_B} binary: ${BIN_B}`);
  console.log(`  Node version: ${vinfo.versionB}, V8: ${vinfo.v8B}\n`);

  const allResults = [];
  const benchmarks = [
    { name: "Binary Size", fn: benchBinarySize },
    { name: "Startup Time", fn: benchStartupTime },
    { name: 'require("fs")', fn: benchRequireFS },
    { name: "Require 10 modules", fn: benchRequireHeavy },
    { name: "Memory at Startup", fn: benchMemoryStartup },
    { name: "Buffer Operations", fn: benchBufferOps },
    { name: "JSON parse/stringify", fn: benchJSON },
    { name: "URL parsing (Ada)", fn: benchURLParsing },
    { name: "Zlib compress/decomp", fn: benchZlib },
    { name: "TextEncoder/Decoder", fn: benchTextCodec },
    { name: "Stream pipe throughput", fn: benchStreamPipe },
    { name: "FS readFileSync", fn: benchFSRead },
    { name: "Memory under load", fn: benchMemoryHeavy },
  ];

  for (const bench of benchmarks) {
    process.stdout.write(`Running: ${bench.name}...`);
    const result = bench.fn();
    if (Array.isArray(result)) {
      allResults.push(...result);
    } else {
      allResults.push(result);
    }
    console.log(" done");
  }

  console.log("\n");
  printTable(allResults);

  // Summary — wins are weighted by the magnitude of the percentage difference
  // so a 10% gap counts 10x more than a 1% gap.
  let winsA = 0,
    winsB = 0,
    ties = 0;
  let advA = 0,
    advB = 0;
  for (const r of allResults) {
    const pct = r.a > 0 ? Math.abs(((r.b - r.a) / r.a) * 100) : 0;
    if (r.winner === NAME_A) {
      winsA++;
      advA += pct;
    } else if (r.winner === NAME_B) {
      winsB++;
      advB += pct;
    } else ties++;
  }
  const totalAdv = advA + advB;
  const shareA = totalAdv > 0 ? ((advA / totalAdv) * 100).toFixed(1) : "50.0";
  const shareB = totalAdv > 0 ? ((advB / totalAdv) * 100).toFixed(1) : "50.0";
  const overallWinner = advA > advB ? NAME_A : advB > advA ? NAME_B : "Tie";
  console.log(
    `\nWin count  : ${NAME_A} ${winsA}, ${NAME_B} ${winsB}, Ties ${ties} (out of ${allResults.length} benchmarks)`,
  );
  console.log(
    `Pct advantage: ${NAME_A} ${advA.toFixed(2)}% (${shareA}%), ${NAME_B} ${advB.toFixed(2)}% (${shareB}%)`,
  );
  console.log(`Overall winner by weighted advantage: ${overallWinner}\n`);
}

main().catch(console.error);
