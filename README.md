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

### Three or more binaries

```sh
node benchmark_compare_multiple.js <bin1> <bin2> <bin3> [...]
```

## Presets

Presets are self-contained benchmark configurations inside `presets/<name>/`. Each subfolder contains:

- The binary `.exe` files to compare.
- A `run.bat` (Windows) or `run.sh` (Linux) script that executes the benchmark.

### Available presets

| Preset | Description |
|---|---|
| `msvc-vs-clangcl` | Compares MSVC-compiled vs ClangCL-compiled Node.js binaries (Windows). |
| `linux` | Compares clean, LTO, PGO, and LTO+PGO Node.js builds (Linux). |

### Running a preset

```bat
cd presets\msvc-vs-clangcl
run.bat
```

### Creating a new preset

1. Create a subfolder under `presets/` (e.g. `presets/my-test/`).
2. Place the binaries inside it.
3. Add a `run.bat` / `run.sh` that `cd`s to its own directory and invokes the benchmark script with the binary names.

## How it works

- Iterations: 30 per benchmark, 10 warmup rounds.
- Run order is randomized (Fisher-Yates shuffle) each iteration to minimize cache/scheduling bias.
- Winner is determined by median; ties are detected statistically using stddev.
- Summary shows win counts and a weighted percentage advantage per binary.
