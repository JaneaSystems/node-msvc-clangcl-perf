# node-msvc-clangcl-perf

Compares the performance of two Node.js binaries — one compiled with MSVC and one with ClangCL — across startup time, memory usage, JSON, buffers, streams, zlib, URL parsing, and more. Results are printed as a side-by-side table with percentage differences and an overall weighted winner.

Place `node_msvc.exe` and `node_clangcl.exe` next to the scripts (already done), then run:

```bat
run_benchmark.bat
```
