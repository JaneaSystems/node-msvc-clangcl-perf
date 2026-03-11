// benchmarks/index.js
// Central registry of all benchmarks. Both benchmark_compare.js and
// benchmark_compare_multiple.js import from here.
//
// Each benchmark function signature: (ctx) => BenchResult | BenchResult[]
//   ctx = { runAll, BINS, NAMES, N, WARMUP, ITERATIONS }
//   runAll(binArgs) => result[] — indexed by binary, each { durationMs, stdout, ... }

"use strict";

const { benchBinarySize, benchVersionInfo } = require("./system");
const {
  benchStartupTime,
  benchRequireFS,
  benchRequireHeavy,
} = require("./startup");
const { benchMemoryStartup, benchMemoryHeavy } = require("./memory");
const {
  benchBufferOps,
  benchJSON,
  benchURLParsing,
  benchZlib,
  benchTextCodec,
} = require("./cpu");
const { benchFSRead, benchStreamPipe } = require("./io");

/** Ordered list of timed benchmarks. Passed to both runner scripts. */
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

module.exports = { benchmarks, benchVersionInfo };
