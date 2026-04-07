// Entry point — delegates to the benchmark comparison runner.
// Usage: node index.js <binary1> <binary2> [<binary3> ...]

const { spawnSync } = require("child_process");
const path = require("path");

// Count positional args (skip --benchmark <name> and --list-benchmarks flags)
const rawArgs = process.argv.slice(2);
const positionalArgs = [];
for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === "--benchmark") {
    i++; // skip the value too
  } else if (rawArgs[i] === "--list-benchmarks") {
    // skip
  } else {
    positionalArgs.push(rawArgs[i]);
  }
}

if (positionalArgs.length < 2) 
{
    const result = spawnSync(
        process.execPath,
        [path.join(__dirname, "benchmarks", "benchmark_single.js"), ...rawArgs],
        { stdio: "inherit" },
    );
    process.exit(result.status ?? 1);
}
else
{
    const result = spawnSync(
        process.execPath,
        [path.join(__dirname, "benchmarks", "benchmark_compare_multiple.js"), ...rawArgs],
        { stdio: "inherit" },
    );
    process.exit(result.status ?? 1);
}
