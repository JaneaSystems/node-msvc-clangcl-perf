# node-msvc-clangcl-perf

Benchmarks two or more Node.js binaries against each other across startup time, memory usage, JSON, buffers, streams, zlib, URL parsing, and more. Binary names are derived from their filenames and used as labels throughout all output — no hardcoded assumptions about what you're comparing. Works on Windows and Linux.

## Scripts

| Script | Purpose |
|---|---|
| `benchmark_compare.js` | Pairwise benchmark — exactly 2 binaries. Includes a Diff % column. |
| `benchmark_compare_multiple.js` | 2+ binaries. For 2 binaries, delegates to `benchmark_compare.js`. For 3+, runs a multi-column table. |

## Usage

### Two binaries

```sh
node benchmark_compare.js <path/to/binary-a> <path/to/binary-b>
```

Or use the included batch script (compares the two pre-built binaries in this repo):

```bat
run_benchmark.bat
```

### Three or more binaries

```sh
node benchmark_compare_multiple.js <bin1> <bin2> <bin3> [...]
```

## How it works

- Iterations: 30 per benchmark, 10 warmup rounds.
- Run order is randomized (Fisher-Yates shuffle) each iteration to minimize cache/scheduling bias.
- Winner is determined by median; ties are detected statistically using stddev.
- Summary shows win counts and a weighted percentage advantage per binary.
