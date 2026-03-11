// Benchmark comparison: two compiled Node.js binaries
// Run with: node benchmark_compare.js <binary-a> <binary-b>

const { spawnSync } = require("child_process");
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

const { formatBytes, pctDiff } = require("./benchmarks/helpers");
const { benchmarks, benchVersionInfo } = require("./benchmarks");

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
  const results = new Array(2);
  if (Math.random() < 0.5) {
    results[0] = runTimed(BIN_A, binArgs, options);
    results[1] = runTimed(BIN_B, binArgs, options);
  } else {
    results[1] = runTimed(BIN_B, binArgs, options);
    results[0] = runTimed(BIN_A, binArgs, options);
  }
  return results;
}

const ctx = {
  runAll,
  BINS: [BIN_A, BIN_B],
  NAMES: [NAME_A, NAME_B],
  N: 2,
  WARMUP,
  ITERATIONS,
};

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
    const aStr = r.stds ? `${r.fmts[0]} ±${r.stds[0]}` : r.fmts[0];
    const bStr = r.stds ? `${r.fmts[1]} ±${r.stds[1]}` : r.fmts[1];
    const diff = pctDiff(r.values[0], r.values[1]);
    console.log(
      "| " +
        r.name.padEnd(nameColW) +
        "| " +
        aStr.padEnd(valueColW) +
        "| " +
        bStr.padEnd(valueColW) +
        "| " +
        diff.padEnd(diffColW) +
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
  const vinfo = benchVersionInfo(ctx);
  console.log(`${NAME_A} binary: ${BIN_A}`);
  console.log(`  Node version: ${vinfo[0].version}, V8: ${vinfo[0].v8}`);
  console.log(`${NAME_B} binary: ${BIN_B}`);
  console.log(`  Node version: ${vinfo[1].version}, V8: ${vinfo[1].v8}\n`);

  const allResults = [];

  for (const bench of benchmarks) {
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

  // Summary — wins are weighted by the magnitude of the percentage difference
  // so a 10% gap counts 10x more than a 1% gap.
  let winsA = 0,
    winsB = 0,
    ties = 0;
  let advA = 0,
    advB = 0;
  for (const r of allResults) {
    const base = r.values[0];
    const pct = base > 0 ? Math.abs(((r.values[1] - base) / base) * 100) : 0;
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
