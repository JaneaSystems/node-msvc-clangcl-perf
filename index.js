// Entry point — delegates to the benchmark comparison runner.
// Usage: node index.js <binary1> <binary2> [<binary3> ...]

const { spawnSync } = require("child_process");
const path = require("path");

const result = spawnSync(
    process.execPath,
    [path.join(__dirname, "benchmarks", "benchmark_compare_multiple.js"), ...process.argv.slice(2)],
    { stdio: "inherit" },
);
process.exit(result.status ?? 1);
