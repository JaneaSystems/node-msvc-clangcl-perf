# node-msvc-clangcl-perf

Compares the performance of two Node.js binaries across startup time, memory usage, JSON, buffers, streams, zlib, URL parsing, and more. Results are printed as a side-by-side table with percentage differences and an overall weighted winner. Binary names are derived from their filenames and used as labels throughout the output — no hardcoded assumptions about what you're comparing.

Place `node_msvc.exe` and `node_clangcl.exe` next to the scripts (already done), then run:

```bat
run_benchmark.bat
```

To compare any two node binaries just run

```bat
node.exe benchmark_compare.js path/to/node1.exe path/to/node2.exe
```
