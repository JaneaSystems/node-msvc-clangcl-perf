// Benchmark comparison: 2 or more compiled Node.js binaries.
// Run with: node benchmark_compare_multiple.js <bin1> <bin2> [<bin3> ...]
//
// For exactly 2 binaries, delegates to benchmark_compare.js.
// For 3+ binaries, runs all benchmarks with a shuffled run order per iteration.

const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const cliArgs = process.argv.slice(2);
if (cliArgs.length < 2) {
  console.error(
    "Usage: node benchmark_compare_multiple.js <binary1> <binary2> [<binary3> ...]",
  );
  process.exit(1);
}

// For exactly 2 binaries, use the focused pairwise script (includes Diff column).
if (cliArgs.length === 2) {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, "benchmark_compare.js"), ...cliArgs],
    { stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}

const BINS = cliArgs.map((p) => {
  const resolved = path.resolve(p);
  if (!fs.existsSync(resolved)) {
    console.error(`Binary not found: ${resolved}`);
    process.exit(1);
  }
  return resolved;
});

function getBinaryName(binPath) {
  return path.basename(binPath).replace(/\.[^.]+$/, "");
}
const NAMES = BINS.map(getBinaryName);
const N = BINS.length;

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

/**
 * Pick the winner among N values. Returns the binary name, '~Tie', or 'Tie'.
 * @param {number[]} values - one per binary, same index as BINS/NAMES
 * @param {boolean} lowerIsBetter
 * @param {number[]|null} rawStds - per-binary stddev for statistical tie detection
 */
function pickWinner(values, lowerIsBetter = true, rawStds = null) {
  let bestIdx = 0;
  for (let i = 1; i < values.length; i++) {
    if (
      lowerIsBetter ? values[i] < values[bestIdx] : values[i] > values[bestIdx]
    )
      bestIdx = i;
  }
  if (rawStds) {
    const best = values[bestIdx];
    for (let i = 0; i < values.length; i++) {
      if (i === bestIdx) continue;
      if (Math.abs(values[i] - best) < Math.max(rawStds[bestIdx], rawStds[i]))
        return "~Tie";
    }
  }
  // Check for exact tie
  const isTie = values.every((v) => v === values[bestIdx]);
  return isTie ? "Tie" : NAMES[bestIdx];
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

/**
 * Run all N binaries with the given args in a randomized (Fisher-Yates) order.
 * Returns an array of length N where index = binary index.
 */
function runAllRandomized(binArgs, options = {}) {
  const order = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const results = new Array(N);
  for (const idx of order) {
    results[idx] = runTimed(BINS[idx], binArgs, options);
  }
  return results;
}

// ─── Result builders ───────────────────────────────────────────────────────────

/**
 * Build a benchmark result from per-binary timing arrays.
 * @param {string} name
 * @param {number[][]} times - outer index = binary, inner = samples
 */
function makeDurationResult(name, times) {
  const values = times.map((t) => median(t));
  const rawStds = times.map((t) => stddev(t));
  return {
    name,
    values,
    fmts: values.map((v) => formatMs(v)),
    stds: rawStds.map((s) => formatMs(s)),
    rawStds,
    winner: pickWinner(values, true, rawStds),
    unit: "ms",
    lowerIsBetter: true,
  };
}

/**
 * Build a benchmark result from per-binary byte-value arrays.
 * @param {string} name
 * @param {number[][]} arrays - outer index = binary, inner = samples
 */
function makeBytesResult(name, arrays) {
  const values = arrays.map((a) => median(a));
  const rawStds = arrays.map((a) => stddev(a));
  return {
    name,
    values,
    fmts: values.map((v) => formatBytes(v)),
    stds: rawStds.map((s) => formatBytes(s)),
    rawStds,
    winner: pickWinner(values, true, rawStds),
    unit: "bytes",
    lowerIsBetter: true,
  };
}

// ─── Benchmarks ────────────────────────────────────────────────────────────────

function benchBinarySize() {
  const sizes = BINS.map((b) => fs.statSync(b).size);
  return {
    name: "Binary Size",
    values: sizes,
    fmts: sizes.map(formatBytes),
    stds: null,
    rawStds: null,
    winner: pickWinner(sizes),
    unit: "bytes",
    lowerIsBetter: true,
  };
}

function benchStartupTime() {
  const times = Array.from({ length: N }, () => []);
  for (let i = 0; i < WARMUP; i++) runAllRandomized(["-e", "0"]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAllRandomized(["-e", "0"]).forEach((r, idx) =>
      times[idx].push(r.durationMs),
    );
  }
  return makeDurationResult('Startup Time (node -e "0")', times);
}

function benchRequireFS() {
  const code = `const fs = require('fs'); process.exit(0);`;
  const times = Array.from({ length: N }, () => []);
  for (let i = 0; i < WARMUP; i++) runAllRandomized(["-e", code]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAllRandomized(["-e", code]).forEach((r, idx) =>
      times[idx].push(r.durationMs),
    );
  }
  return makeDurationResult('require("fs") + exit', times);
}

function benchRequireHeavy() {
  const code = `
    require('http'); require('https'); require('crypto'); require('fs');
    require('path'); require('os'); require('url'); require('stream');
    require('zlib'); require('events'); process.exit(0);
  `;
  const times = Array.from({ length: N }, () => []);
  for (let i = 0; i < WARMUP; i++) runAllRandomized(["-e", code]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAllRandomized(["-e", code]).forEach((r, idx) =>
      times[idx].push(r.durationMs),
    );
  }
  return makeDurationResult("Require 10 core modules", times);
}

function benchMemoryStartup() {
  const code = `setTimeout(() => { const m = process.memoryUsage(); console.log(JSON.stringify(m)); }, 100);`;
  for (let i = 0; i < WARMUP; i++) runAllRandomized(["-e", code]);
  const mems = Array.from({ length: N }, () => []);
  for (let i = 0; i < ITERATIONS; i++) {
    runAllRandomized(["-e", code]).forEach((r, idx) => {
      try {
        mems[idx].push(JSON.parse(r.stdout.trim()));
      } catch {}
    });
  }
  return [
    makeBytesResult(
      "Memory: RSS at startup",
      mems.map((m) => m.map((x) => x.rss)),
    ),
    makeBytesResult(
      "Memory: Heap Used at startup",
      mems.map((m) => m.map((x) => x.heapUsed)),
    ),
    makeBytesResult(
      "Memory: Heap Total at startup",
      mems.map((m) => m.map((x) => x.heapTotal)),
    ),
    makeBytesResult(
      "Memory: External at startup",
      mems.map((m) => m.map((x) => x.external)),
    ),
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
  const times = Array.from({ length: N }, () => []);
  for (let i = 0; i < WARMUP; i++) runAllRandomized(["-e", code]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAllRandomized(["-e", code]).forEach((r, idx) => {
      const t = parseFloat(r.stdout.trim());
      if (!isNaN(t)) times[idx].push(t);
    });
  }
  return makeDurationResult("Buffer ops (50k alloc+fill+hex)", times);
}

function benchJSON() {
  const code = `
    const { performance } = require('perf_hooks');
    const obj = {};
    for (let i = 0; i < 200; i++) obj['key' + i] = { val: i, arr: [i, i*2, 'str'.repeat(10)] };
    const str = JSON.stringify(obj);
    const start = performance.now();
    for (let i = 0; i < 20000; i++) { JSON.parse(str); JSON.stringify(obj); }
    console.log(performance.now() - start);
  `;
  const times = Array.from({ length: N }, () => []);
  for (let i = 0; i < WARMUP; i++) runAllRandomized(["-e", code]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAllRandomized(["-e", code]).forEach((r, idx) => {
      const t = parseFloat(r.stdout.trim());
      if (!isNaN(t)) times[idx].push(t);
    });
  }
  return makeDurationResult("JSON parse+stringify (20k iters)", times);
}

function benchFSRead() {
  const tmpFile = path.join(os.tmpdir(), "node_bench_multi_test.txt");
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
  for (let i = 0; i < WARMUP; i++) runAllRandomized(["-e", code]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAllRandomized(["-e", code]).forEach((r, idx) => {
      const t = parseFloat(r.stdout.trim());
      if (!isNaN(t)) times[idx].push(t);
    });
  }
  try {
    fs.unlinkSync(tmpFile);
  } catch {}
  return makeDurationResult("FS: readFileSync 64KB (5000x)", times);
}

function benchURLParsing() {
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
    for (let i = 0; i < 50000; i++) new URL(urls[i % urls.length]);
    console.log(performance.now() - start);
  `;
  const times = Array.from({ length: N }, () => []);
  for (let i = 0; i < WARMUP; i++) runAllRandomized(["-e", code]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAllRandomized(["-e", code]).forEach((r, idx) => {
      const t = parseFloat(r.stdout.trim());
      if (!isNaN(t)) times[idx].push(t);
    });
  }
  return makeDurationResult("URL parsing (50k, Ada C++)", times);
}

function benchZlib() {
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
  const times = Array.from({ length: N }, () => []);
  for (let i = 0; i < WARMUP; i++) runAllRandomized(["-e", code]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAllRandomized(["-e", code]).forEach((r, idx) => {
      const t = parseFloat(r.stdout.trim());
      if (!isNaN(t)) times[idx].push(t);
    });
  }
  return makeDurationResult("Zlib deflate+inflate 64KB (500x)", times);
}

function benchTextCodec() {
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
  const times = Array.from({ length: N }, () => []);
  for (let i = 0; i < WARMUP; i++) runAllRandomized(["-e", code]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAllRandomized(["-e", code]).forEach((r, idx) => {
      const t = parseFloat(r.stdout.trim());
      if (!isNaN(t)) times[idx].push(t);
    });
  }
  return makeDurationResult("TextEncoder/Decoder (10k iters)", times);
}

function benchStreamPipe() {
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
  for (let i = 0; i < WARMUP; i++) runAllRandomized(["-e", code]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAllRandomized(["-e", code]).forEach((r, idx) => {
      const t = parseFloat(r.stdout.trim());
      if (!isNaN(t)) times[idx].push(t);
    });
  }
  return makeDurationResult("Stream pipe 3-chain (200x100 16KB)", times);
}

function benchMemoryHeavy() {
  const code = `
    const arr = [];
    for (let i = 0; i < 500000; i++) arr.push({ idx: i, data: 'x'.repeat(20) });
    console.log(JSON.stringify(process.memoryUsage()));
  `;
  const mems = Array.from({ length: N }, () => []);
  for (let i = 0; i < WARMUP; i++) runAllRandomized(["-e", code]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAllRandomized(["-e", code]).forEach((r, idx) => {
      try {
        mems[idx].push(JSON.parse(r.stdout.trim()));
      } catch {}
    });
  }
  return [
    makeBytesResult(
      "Memory: RSS under 500k objects",
      mems.map((m) => m.map((x) => x.rss)),
    ),
    makeBytesResult(
      "Memory: Heap Used under 500k objects",
      mems.map((m) => m.map((x) => x.heapUsed)),
    ),
  ];
}

function benchVersionInfo() {
  return BINS.map((bin, i) => ({
    name: NAMES[i],
    bin,
    version: execFileSync(bin, ["--version"], { encoding: "utf8" }).trim(),
    v8: execFileSync(bin, ["-e", "console.log(process.versions.v8)"], {
      encoding: "utf8",
    }).trim(),
  }));
}

// ─── Output ────────────────────────────────────────────────────────────────────

// Column widths — per-binary value column is wide enough for "XX.XX ms ±XX.XX ms"
const BENCH_COL_W = 42;
const VALUE_COL_W = 22;

function printTable(results) {
  const maxNameLen = Math.max(8, ...NAMES.map((n) => n.length + 2));
  const winnerColW = Math.max(8, maxNameLen);
  const totalW = BENCH_COL_W + N * (VALUE_COL_W + 2) + winnerColW + 4;
  const sep = "-".repeat(totalW);

  console.log(sep);
  let header = "| " + "Benchmark".padEnd(BENCH_COL_W);
  for (const name of NAMES) header += "| " + name.padEnd(VALUE_COL_W);
  header += "| " + "Winner".padEnd(winnerColW) + "|";
  console.log(header);
  console.log(sep);

  for (const r of results) {
    let row = "| " + r.name.padEnd(BENCH_COL_W);
    for (let i = 0; i < N; i++) {
      const cell = r.stds ? `${r.fmts[i]} \u00b1${r.stds[i]}` : r.fmts[i];
      row += "| " + cell.padEnd(VALUE_COL_W);
    }
    row += "| " + r.winner.padEnd(winnerColW) + "|";
    console.log(row);
  }
  console.log(sep);
}

async function main() {
  console.log(`=== Node.js Binary Benchmark: ${NAMES.join(" vs ")} ===\n`);
  console.log(`Platform : ${os.platform()} ${os.arch()}`);
  console.log(`CPUs     : ${os.cpus()[0].model} (${os.cpus().length} cores)`);
  console.log(`RAM      : ${formatBytes(os.totalmem())}`);
  console.log(`Date     : ${new Date().toISOString()}`);
  console.log(`Binaries : ${N}`);
  console.log(`Iterations per benchmark: ${ITERATIONS} (warmup: ${WARMUP})\n`);

  const vinfo = benchVersionInfo();
  for (const { name, bin, version, v8 } of vinfo) {
    console.log(`${name} : ${bin}`);
    console.log(`  Node: ${version}, V8: ${v8}`);
  }
  console.log("");

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
    allResults.push(...(Array.isArray(result) ? result : [result]));
    console.log(" done");
  }

  console.log("\n");
  printTable(allResults);

  // Summary — weighted advantage: how far each winner beat every loser across benchmarks.
  const wins = Array(N).fill(0);
  const advPct = Array(N).fill(0);
  let ties = 0;
  for (const r of allResults) {
    const winnerIdx = NAMES.indexOf(r.winner);
    if (winnerIdx === -1) {
      ties++;
      continue;
    } // '~Tie' or 'Tie'
    wins[winnerIdx]++;
    const best = r.values[winnerIdx];
    if (best > 0) {
      for (let i = 0; i < N; i++) {
        if (i !== winnerIdx)
          advPct[winnerIdx] += Math.abs((r.values[i] - best) / best) * 100;
      }
    }
  }

  const totalAdv = advPct.reduce((a, b) => a + b, 0);
  console.log(
    `\nWin count (${allResults.length} benchmarks, ${ties} statistical ties):`,
  );
  for (let i = 0; i < N; i++) {
    const share =
      totalAdv > 0
        ? ((advPct[i] / totalAdv) * 100).toFixed(1)
        : (100 / N).toFixed(1);
    console.log(
      `  ${NAMES[i].padEnd(22)}: ${String(wins[i]).padStart(3)} wins,` +
        ` ${advPct[i].toFixed(2).padStart(8)}% weighted advantage (${share}% share)`,
    );
  }
  const overallIdx = advPct.indexOf(Math.max(...advPct));
  console.log(`\nOverall winner by weighted advantage: ${NAMES[overallIdx]}\n`);
}

main().catch(console.error);
