// Benchmark comparison: two compiled Node.js binaries
// Run with: node benchmark_compare.js <binary-a> <binary-b>

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const args = process.argv.slice(2);

// Parse --benchmark flag
let benchmarkFilter = null;
let listBenchmarks = false;
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--benchmark" && i + 1 < args.length) {
    benchmarkFilter = args[++i];
  } else if (args[i] === "--list-benchmarks") {
    listBenchmarks = true;
  } else {
    positional.push(args[i]);
  }
}

if (listBenchmarks) {
  const { benchmarks: allBench } = require(".");
  for (const b of allBench) console.log(b.name);
  process.exit(0);
}

if (positional.length !== 1) {
  console.error(
    "Usage: node benchmark_single.js <path-to-binary> [--benchmark <name>] [--list-benchmarks]",
  );
  process.exit(1);
}

const BIN_A = path.resolve(positional[0]);
if (!fs.existsSync(BIN_A)) {
  console.error(`Binary not found: ${BIN_A}`);
  process.exit(1);
}

function getBinaryName(binPath) {
  // Strip directory and extension (handles .exe on Windows, any extension on Linux)
  return path.basename(binPath).replace(/\.[^.]+$/, "");
}
const NAME_A = getBinaryName(BIN_A);

const ITERATIONS = 30; // per benchmark
const WARMUP = 10;

const { formatBytes, pctDiff } = require("./helpers");
const { benchmarks, benchVersionInfo } = require(".");

// ─── Runner ───────────────────────────────────────────────────────────────────

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

// Randomized pairwise runner — returns [resultA, resultB] in binary index order.
function runAll(binArgs, options = {}) {
  const results = new Array(1);
  results[0] = runTimed(BIN_A, binArgs, options);
  return results;
}

const ctx = {
  runAll,
  BINS: [BIN_A],
  NAMES: [NAME_A],
  N: 1,
  WARMUP,
  ITERATIONS,
};

// ─── Runner ────────────────────────────────────────────────────────────────────

function printTable(results) {
  const nameColW = 42;
  const valueColW = 26;
  const diffColW = 12;
  const winnerColW = Math.max(10, NAME_A.length + 2);
  const sep = "-".repeat(nameColW + valueColW * 2 + diffColW + winnerColW + 12);

  console.log(sep);
  console.log(
    "| " +
    "Benchmark".padEnd(nameColW) +
    "| " +
    NAME_A.padEnd(valueColW) +
    "| ",
  );
  console.log(sep);

  for (const r of results) {
    const aStr = r.stds ? `${r.fmts[0]} ±${r.stds[0]}` : r.fmts[0];
    console.log(
      "| " +
      r.name.padEnd(nameColW) +
      "| " +
      aStr.padEnd(valueColW) +
      "| ",
    );
  }
  console.log(sep);
}

async function main() {
  console.log(`=== Node.js Binary Benchmark BASELINE: ${NAME_A} ===\n`);
  console.log(`Platform: ${os.platform()} ${os.arch()}`);
  console.log(`CPUs: ${os.cpus()[0].model} (${os.cpus().length} cores)`);
  console.log(`RAM: ${formatBytes(os.totalmem())}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Iterations per benchmark: ${ITERATIONS} (warmup: ${WARMUP})\n`);

  // Version info
  const vinfo = benchVersionInfo(ctx);
  console.log(`${NAME_A} binary: ${BIN_A}`);
  console.log(`  Node version: ${vinfo[0].version}, V8: ${vinfo[0].v8}`);

  const allResults = [];

  const toRun = benchmarkFilter
    ? benchmarks.filter((b) => b.name === benchmarkFilter)
    : benchmarks;

  if (benchmarkFilter && toRun.length === 0) {
    console.error(`Unknown benchmark: "${benchmarkFilter}"`);
    console.error("Available benchmarks:");
    for (const b of benchmarks) console.error(`  ${b.name}`);
    process.exit(1);
  }

  for (const bench of toRun) {
    process.stdout.write(`Running: ${bench.name}...`);
    const result = bench.fn(ctx);
    if (Array.isArray(result)) {
      allResults.push(...result);
    } else {
      allResults.push(result);
    }
    console.log(" done");
  }

  console.log("\n");
  printTable(allResults);
}

main().catch(console.error);
