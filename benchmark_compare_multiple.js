// Benchmark comparison: 2 or more compiled Node.js binaries.
// Run with: node benchmark_compare_multiple.js <bin1> <bin2> [<bin3> ...]
//
// For exactly 2 binaries, delegates to benchmark_compare.js.
// For 3+ binaries, runs all benchmarks with a shuffled run order per iteration.

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { formatBytes } = require("./benchmarks/helpers");
const { benchmarks, benchVersionInfo } = require("./benchmarks");

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

// ─── Runner ────────────────────────────────────────────────────────────────────

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

const ctx = { runAll: runAllRandomized, BINS, NAMES, N, WARMUP, ITERATIONS };

// ─── Output ────────────────────────────────────────────────────────────────────

// Column widths — value column fits "XXXX.XX ms ±XX.XX ms (+XX.XX%)"
const BENCH_COL_W = 42;
const VALUE_COL_W = 34;

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
    // Find the best value for this row
    let bestIdx = 0;
    for (let i = 1; i < N; i++) {
      if (
        r.lowerIsBetter
          ? r.values[i] < r.values[bestIdx]
          : r.values[i] > r.values[bestIdx]
      )
        bestIdx = i;
    }

    let row = "| " + r.name.padEnd(BENCH_COL_W);
    for (let i = 0; i < N; i++) {
      const base = r.stds ? `${r.fmts[i]} ±${r.stds[i]}` : r.fmts[i];
      let cell;
      if (i === bestIdx || r.values[i] === r.values[bestIdx]) {
        cell = base;
      } else {
        const best = r.values[bestIdx];
        const pct =
          best > 0 ? (((r.values[i] - best) / best) * 100).toFixed(2) : "0.00";
        cell = `${base} (+${pct}%)`;
      }
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

  const vinfo = benchVersionInfo(ctx);
  for (const { name, bin, version, v8 } of vinfo) {
    console.log(`${name} : ${bin}`);
    console.log(`  Node: ${version}, V8: ${v8}`);
  }
  console.log("");

  const allResults = [];

  for (const bench of benchmarks) {
    process.stdout.write(`Running: ${bench.name}...`);
    const result = bench.fn(ctx);
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
