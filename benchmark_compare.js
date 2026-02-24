// Benchmark comparison: MSVC vs ClangCL compiled Node.js binaries
// Run with: node benchmark_compare.js <msvc-binary> <clang-binary>

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('Usage: node benchmark_compare.js <path-to-msvc-binary> <path-to-clang-binary>');
  process.exit(1);
}
const MSVC_BIN = path.resolve(args[0]);
const CLANG_BIN = path.resolve(args[1]);
if (!fs.existsSync(MSVC_BIN)) { console.error(`MSVC binary not found: ${MSVC_BIN}`); process.exit(1); }
if (!fs.existsSync(CLANG_BIN)) { console.error(`ClangCL binary not found: ${CLANG_BIN}`); process.exit(1); }

const ITERATIONS = 30; // per benchmark
const WARMUP = 10;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1));
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return bytes + ' B';
}

function formatMs(ms) {
  return ms.toFixed(2) + ' ms';
}

function pctDiff(msvc, clang) {
  const diff = ((clang - msvc) / msvc) * 100;
  const sign = diff > 0 ? '+' : '';
  return sign + diff.toFixed(2) + '%';
}

function winner(msvcVal, clangVal, lowerIsBetter = true, msvcStd = 0, clangStd = 0) {
  if (msvcStd > 0 || clangStd > 0) {
    if (Math.abs(msvcVal - clangVal) < Math.max(msvcStd, clangStd)) return '~Tie';
  }
  if (lowerIsBetter) return msvcVal < clangVal ? 'MSVC' : msvcVal > clangVal ? 'ClangCL' : 'Tie';
  return msvcVal > clangVal ? 'MSVC' : msvcVal < clangVal ? 'ClangCL' : 'Tie';
}

function runTimed(bin, args, options = {}) {
  const start = process.hrtime.bigint();
  const result = spawnSync(bin, args, { 
    encoding: 'utf8', 
    timeout: 60000,
    windowsHide: true,
    ...options 
  });
  const end = process.hrtime.bigint();
  return { 
    durationMs: Number(end - start) / 1e6, 
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status 
  };
}

function runBothTimed(args, options = {}) {
  if (Math.random() < 0.5) {
    const msvc = runTimed(MSVC_BIN, args, options);
    const clang = runTimed(CLANG_BIN, args, options);
    return { msvc, clang };
  } else {
    const clang = runTimed(CLANG_BIN, args, options);
    const msvc = runTimed(MSVC_BIN, args, options);
    return { msvc, clang };
  }
}

// ─── Benchmarks ────────────────────────────────────────────────────────────────

function benchBinarySize() {
  const msvcSize = fs.statSync(MSVC_BIN).size;
  const clangSize = fs.statSync(CLANG_BIN).size;
  return {
    name: 'Binary Size',
    msvc: msvcSize,
    clang: clangSize,
    msvcFmt: formatBytes(msvcSize),
    clangFmt: formatBytes(clangSize),
    diff: pctDiff(msvcSize, clangSize),
    winner: winner(msvcSize, clangSize),
    unit: 'bytes',
    lowerIsBetter: true,
  };
}

function benchStartupTime() {
  const times = { msvc: [], clang: [] };
  
  // Warmup
  for (let i = 0; i < WARMUP; i++) runBothTimed(['-e', '0']);

  for (let i = 0; i < ITERATIONS; i++) {
    const { msvc, clang } = runBothTimed(['-e', '0']);
    times.msvc.push(msvc.durationMs);
    times.clang.push(clang.durationMs);
  }

  const msvcMed = median(times.msvc);
  const clangMed = median(times.clang);
  return {
    name: 'Startup Time (node -e "0")',
    msvc: msvcMed,
    clang: clangMed,
    msvcFmt: formatMs(msvcMed),
    clangFmt: formatMs(clangMed),
    msvcStd: formatMs(stddev(times.msvc)),
    clangStd: formatMs(stddev(times.clang)),
    diff: pctDiff(msvcMed, clangMed),
    winner: winner(msvcMed, clangMed, true, stddev(times.msvc), stddev(times.clang)),
    unit: 'ms',
    lowerIsBetter: true,
  };
}

function benchRequireFS() {
  const code = `const fs = require('fs'); process.exit(0);`;
  const times = { msvc: [], clang: [] };

  for (let i = 0; i < WARMUP; i++) runBothTimed(['-e', code]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { msvc, clang } = runBothTimed(['-e', code]);
    times.msvc.push(msvc.durationMs);
    times.clang.push(clang.durationMs);
  }

  const msvcMed = median(times.msvc);
  const clangMed = median(times.clang);
  return {
    name: 'require("fs") + exit',
    msvc: msvcMed,
    clang: clangMed,
    msvcFmt: formatMs(msvcMed),
    clangFmt: formatMs(clangMed),
    msvcStd: formatMs(stddev(times.msvc)),
    clangStd: formatMs(stddev(times.clang)),
    diff: pctDiff(msvcMed, clangMed),
    winner: winner(msvcMed, clangMed, true, stddev(times.msvc), stddev(times.clang)),
    unit: 'ms',
    lowerIsBetter: true,
  };
}

function benchRequireHeavy() {
  const code = `
    require('http');
    require('https');
    require('crypto');
    require('fs');
    require('path');
    require('os');
    require('url');
    require('stream');
    require('zlib');
    require('events');
    process.exit(0);
  `;
  const times = { msvc: [], clang: [] };

  for (let i = 0; i < WARMUP; i++) runBothTimed(['-e', code]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { msvc, clang } = runBothTimed(['-e', code]);
    times.msvc.push(msvc.durationMs);
    times.clang.push(clang.durationMs);
  }

  const msvcMed = median(times.msvc);
  const clangMed = median(times.clang);
  return {
    name: 'Require 10 core modules',
    msvc: msvcMed,
    clang: clangMed,
    msvcFmt: formatMs(msvcMed),
    clangFmt: formatMs(clangMed),
    msvcStd: formatMs(stddev(times.msvc)),
    clangStd: formatMs(stddev(times.clang)),
    diff: pctDiff(msvcMed, clangMed),
    winner: winner(msvcMed, clangMed, true, stddev(times.msvc), stddev(times.clang)),
    unit: 'ms',
    lowerIsBetter: true,
  };
}

function benchMemoryStartup() {
  // Measure RSS after startup using a self-reporting script
  const code = `setTimeout(() => { const m = process.memoryUsage(); console.log(JSON.stringify(m)); }, 100);`;

  for (let i = 0; i < WARMUP; i++) runBothTimed(['-e', code]);

  const msvcMem = [];
  const clangMem = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const { msvc: msvcR, clang: clangR } = runBothTimed(['-e', code]);
    try { msvcMem.push(JSON.parse(msvcR.stdout.trim())); } catch {}
    try { clangMem.push(JSON.parse(clangR.stdout.trim())); } catch {}
  }

  const msvcRSS = median(msvcMem.map(m => m.rss));
  const clangRSS = median(clangMem.map(m => m.rss));
  const msvcHeap = median(msvcMem.map(m => m.heapUsed));
  const clangHeap = median(clangMem.map(m => m.heapUsed));
  const msvcHeapTotal = median(msvcMem.map(m => m.heapTotal));
  const clangHeapTotal = median(clangMem.map(m => m.heapTotal));
  const msvcExternal = median(msvcMem.map(m => m.external));
  const clangExternal = median(clangMem.map(m => m.external));

  const msvcRSSArr = msvcMem.map(m => m.rss);
  const clangRSSArr = clangMem.map(m => m.rss);
  const msvcHeapArr = msvcMem.map(m => m.heapUsed);
  const clangHeapArr = clangMem.map(m => m.heapUsed);
  const msvcHeapTotalArr = msvcMem.map(m => m.heapTotal);
  const clangHeapTotalArr = clangMem.map(m => m.heapTotal);
  const msvcExternalArr = msvcMem.map(m => m.external);
  const clangExternalArr = clangMem.map(m => m.external);

  return [
    {
      name: 'Memory: RSS at startup',
      msvc: msvcRSS, clang: clangRSS,
      msvcFmt: formatBytes(msvcRSS), clangFmt: formatBytes(clangRSS),
      msvcStd: formatBytes(stddev(msvcRSSArr)), clangStd: formatBytes(stddev(clangRSSArr)),
      diff: pctDiff(msvcRSS, clangRSS), winner: winner(msvcRSS, clangRSS, true, stddev(msvcRSSArr), stddev(clangRSSArr)),
      unit: 'bytes', lowerIsBetter: true,
    },
    {
      name: 'Memory: Heap Used at startup',
      msvc: msvcHeap, clang: clangHeap,
      msvcFmt: formatBytes(msvcHeap), clangFmt: formatBytes(clangHeap),
      msvcStd: formatBytes(stddev(msvcHeapArr)), clangStd: formatBytes(stddev(clangHeapArr)),
      diff: pctDiff(msvcHeap, clangHeap), winner: winner(msvcHeap, clangHeap, true, stddev(msvcHeapArr), stddev(clangHeapArr)),
      unit: 'bytes', lowerIsBetter: true,
    },
    {
      name: 'Memory: Heap Total at startup',
      msvc: msvcHeapTotal, clang: clangHeapTotal,
      msvcFmt: formatBytes(msvcHeapTotal), clangFmt: formatBytes(clangHeapTotal),
      msvcStd: formatBytes(stddev(msvcHeapTotalArr)), clangStd: formatBytes(stddev(clangHeapTotalArr)),
      diff: pctDiff(msvcHeapTotal, clangHeapTotal), winner: winner(msvcHeapTotal, clangHeapTotal, true, stddev(msvcHeapTotalArr), stddev(clangHeapTotalArr)),
      unit: 'bytes', lowerIsBetter: true,
    },
    {
      name: 'Memory: External at startup',
      msvc: msvcExternal, clang: clangExternal,
      msvcFmt: formatBytes(msvcExternal), clangFmt: formatBytes(clangExternal),
      msvcStd: formatBytes(stddev(msvcExternalArr)), clangStd: formatBytes(stddev(clangExternalArr)),
      diff: pctDiff(msvcExternal, clangExternal), winner: winner(msvcExternal, clangExternal, true, stddev(msvcExternalArr), stddev(clangExternalArr)),
      unit: 'bytes', lowerIsBetter: true,
    },
  ];
}

function benchBufferOps() {
  const code = `
    const { performance } = require('perf_hooks');
    const start = performance.now();
    for (let i = 0; i < 50000; i++) {
      const buf = Buffer.alloc(1024);
      buf.fill(0xAB);
      const copy = Buffer.from(buf);
      copy.toString('hex');
    }
    console.log(performance.now() - start);
  `;
  const times = { msvc: [], clang: [] };

  for (let i = 0; i < WARMUP; i++) runBothTimed(['-e', code]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { msvc: msvcR, clang: clangR } = runBothTimed(['-e', code]);
    const msvcT = parseFloat(msvcR.stdout.trim());
    const clangT = parseFloat(clangR.stdout.trim());
    if (!isNaN(msvcT)) times.msvc.push(msvcT);
    if (!isNaN(clangT)) times.clang.push(clangT);
  }

  const msvcMed = median(times.msvc);
  const clangMed = median(times.clang);
  return {
    name: 'Buffer ops (50k alloc+fill+hex)',
    msvc: msvcMed,
    clang: clangMed,
    msvcFmt: formatMs(msvcMed),
    clangFmt: formatMs(clangMed),
    msvcStd: formatMs(stddev(times.msvc)),
    clangStd: formatMs(stddev(times.clang)),
    diff: pctDiff(msvcMed, clangMed),
    winner: winner(msvcMed, clangMed, true, stddev(times.msvc), stddev(times.clang)),
    unit: 'ms',
    lowerIsBetter: true,
  };
}

function benchJSON() {
  const code = `
    const { performance } = require('perf_hooks');
    const obj = {};
    for (let i = 0; i < 200; i++) obj['key' + i] = { val: i, arr: [i, i*2, 'str'.repeat(10)] };
    const str = JSON.stringify(obj);
    const start = performance.now();
    for (let i = 0; i < 20000; i++) {
      JSON.parse(str);
      JSON.stringify(obj);
    }
    console.log(performance.now() - start);
  `;
  const times = { msvc: [], clang: [] };

  for (let i = 0; i < WARMUP; i++) runBothTimed(['-e', code]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { msvc: msvcR, clang: clangR } = runBothTimed(['-e', code]);
    const msvcT = parseFloat(msvcR.stdout.trim());
    const clangT = parseFloat(clangR.stdout.trim());
    if (!isNaN(msvcT)) times.msvc.push(msvcT);
    if (!isNaN(clangT)) times.clang.push(clangT);
  }

  const msvcMed = median(times.msvc);
  const clangMed = median(times.clang);
  return {
    name: 'JSON parse+stringify (20k iters)',
    msvc: msvcMed,
    clang: clangMed,
    msvcFmt: formatMs(msvcMed),
    clangFmt: formatMs(clangMed),
    msvcStd: formatMs(stddev(times.msvc)),
    clangStd: formatMs(stddev(times.clang)),
    diff: pctDiff(msvcMed, clangMed),
    winner: winner(msvcMed, clangMed, true, stddev(times.msvc), stddev(times.clang)),
    unit: 'ms',
    lowerIsBetter: true,
  };
}

function benchFSRead() {
  // Create a temp file, then read it many times
  const tmpFile = path.join(os.tmpdir(), 'node_bench_test.txt');
  fs.writeFileSync(tmpFile, 'x'.repeat(64 * 1024)); // 64KB file

  const code = `
    const { performance } = require('perf_hooks');
    const fs = require('fs');
    const start = performance.now();
    for (let i = 0; i < 5000; i++) {
      fs.readFileSync(${JSON.stringify(tmpFile.replace(/\\/g, '/'))});
    }
    console.log(performance.now() - start);
  `;
  const times = { msvc: [], clang: [] };

  for (let i = 0; i < WARMUP; i++) runBothTimed(['-e', code]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { msvc: msvcR, clang: clangR } = runBothTimed(['-e', code]);
    const msvcT = parseFloat(msvcR.stdout.trim());
    const clangT = parseFloat(clangR.stdout.trim());
    if (!isNaN(msvcT)) times.msvc.push(msvcT);
    if (!isNaN(clangT)) times.clang.push(clangT);
  }

  try { fs.unlinkSync(tmpFile); } catch {}

  const msvcMed = median(times.msvc);
  const clangMed = median(times.clang);
  return {
    name: 'FS: readFileSync 64KB (5000x)',
    msvc: msvcMed,
    clang: clangMed,
    msvcFmt: formatMs(msvcMed),
    clangFmt: formatMs(clangMed),
    msvcStd: formatMs(stddev(times.msvc)),
    clangStd: formatMs(stddev(times.clang)),
    diff: pctDiff(msvcMed, clangMed),
    winner: winner(msvcMed, clangMed, true, stddev(times.msvc), stddev(times.clang)),
    unit: 'ms',
    lowerIsBetter: true,
  };
}

function benchURLParsing() {
  // Ada URL parser is pure compiled C++ — no JIT involvement
  const code = `
    const { performance } = require('perf_hooks');
    const urls = [
      'https://user:pass@example.com:8080/path/to/resource?query=value&foo=bar#fragment',
      'http://www.example.org/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p',
      'https://subdomain.deep.example.co.uk/path?q=1&w=2&e=3&r=4&t=5',
      'ftp://files.example.com/pub/docs/readme.txt',
      'https://example.com/' + 'a/'.repeat(50),
    ];
    const start = performance.now();
    for (let i = 0; i < 50000; i++) {
      new URL(urls[i % urls.length]);
    }
    console.log(performance.now() - start);
  `;
  const times = { msvc: [], clang: [] };

  for (let i = 0; i < WARMUP; i++) runBothTimed(['-e', code]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { msvc: msvcR, clang: clangR } = runBothTimed(['-e', code]);
    const msvcT = parseFloat(msvcR.stdout.trim());
    const clangT = parseFloat(clangR.stdout.trim());
    if (!isNaN(msvcT)) times.msvc.push(msvcT);
    if (!isNaN(clangT)) times.clang.push(clangT);
  }

  const msvcMed = median(times.msvc);
  const clangMed = median(times.clang);
  return {
    name: 'URL parsing (50k, Ada C++)',
    msvc: msvcMed,
    clang: clangMed,
    msvcFmt: formatMs(msvcMed),
    clangFmt: formatMs(clangMed),
    msvcStd: formatMs(stddev(times.msvc)),
    clangStd: formatMs(stddev(times.clang)),
    diff: pctDiff(msvcMed, clangMed),
    winner: winner(msvcMed, clangMed, true, stddev(times.msvc), stddev(times.clang)),
    unit: 'ms',
    lowerIsBetter: true,
  };
}

function benchZlib() {
  // zlib is a compiled C library; Node wraps it with C++ bindings
  const code = `
    const { performance } = require('perf_hooks');
    const zlib = require('zlib');
    const data = Buffer.alloc(64 * 1024, 'abcdefghij0123456789');
    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      const compressed = zlib.deflateSync(data);
      zlib.inflateSync(compressed);
    }
    console.log(performance.now() - start);
  `;
  const times = { msvc: [], clang: [] };

  for (let i = 0; i < WARMUP; i++) runBothTimed(['-e', code]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { msvc: msvcR, clang: clangR } = runBothTimed(['-e', code]);
    const msvcT = parseFloat(msvcR.stdout.trim());
    const clangT = parseFloat(clangR.stdout.trim());
    if (!isNaN(msvcT)) times.msvc.push(msvcT);
    if (!isNaN(clangT)) times.clang.push(clangT);
  }

  const msvcMed = median(times.msvc);
  const clangMed = median(times.clang);
  return {
    name: 'Zlib deflate+inflate 64KB (500x)',
    msvc: msvcMed,
    clang: clangMed,
    msvcFmt: formatMs(msvcMed),
    clangFmt: formatMs(clangMed),
    msvcStd: formatMs(stddev(times.msvc)),
    clangStd: formatMs(stddev(times.clang)),
    diff: pctDiff(msvcMed, clangMed),
    winner: winner(msvcMed, clangMed, true, stddev(times.msvc), stddev(times.clang)),
    unit: 'ms',
    lowerIsBetter: true,
  };
}

function benchTextCodec() {
  // TextEncoder/TextDecoder exercise compiled ICU + C++ string conversion
  const code = `
    const { performance } = require('perf_hooks');
    const enc = new TextEncoder();
    const dec = new TextDecoder('utf-8');
    const str = 'Hello \u{1F600} world! '.repeat(500);
    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      const encoded = enc.encode(str);
      dec.decode(encoded);
    }
    console.log(performance.now() - start);
  `;
  const times = { msvc: [], clang: [] };

  for (let i = 0; i < WARMUP; i++) runBothTimed(['-e', code]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { msvc: msvcR, clang: clangR } = runBothTimed(['-e', code]);
    const msvcT = parseFloat(msvcR.stdout.trim());
    const clangT = parseFloat(clangR.stdout.trim());
    if (!isNaN(msvcT)) times.msvc.push(msvcT);
    if (!isNaN(clangT)) times.clang.push(clangT);
  }

  const msvcMed = median(times.msvc);
  const clangMed = median(times.clang);
  return {
    name: 'TextEncoder/Decoder (10k iters)',
    msvc: msvcMed,
    clang: clangMed,
    msvcFmt: formatMs(msvcMed),
    clangFmt: formatMs(clangMed),
    msvcStd: formatMs(stddev(times.msvc)),
    clangStd: formatMs(stddev(times.clang)),
    diff: pctDiff(msvcMed, clangMed),
    winner: winner(msvcMed, clangMed, true, stddev(times.msvc), stddev(times.clang)),
    unit: 'ms',
    lowerIsBetter: true,
  };
}

function benchStreamPipe() {
  // PassThrough pipe chain exercises Node's C++ stream internals
  const code = `
    const { performance } = require('perf_hooks');
    const { PassThrough } = require('stream');
    let done = 0;
    const total = 200;
    const chunk = Buffer.alloc(16 * 1024, 0x42);
    const start = performance.now();

    for (let r = 0; r < total; r++) {
      const src = new PassThrough();
      const mid = new PassThrough();
      const dst = new PassThrough();
      src.pipe(mid).pipe(dst);
      let bytes = 0;
      dst.on('data', (d) => { bytes += d.length; });
      dst.on('end', () => {
        if (++done === total) {
          console.log(performance.now() - start);
        }
      });
      for (let i = 0; i < 100; i++) src.write(chunk);
      src.end();
    }
  `;
  const times = { msvc: [], clang: [] };

  for (let i = 0; i < WARMUP; i++) runBothTimed(['-e', code]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { msvc: msvcR, clang: clangR } = runBothTimed(['-e', code]);
    const msvcT = parseFloat(msvcR.stdout.trim());
    const clangT = parseFloat(clangR.stdout.trim());
    if (!isNaN(msvcT)) times.msvc.push(msvcT);
    if (!isNaN(clangT)) times.clang.push(clangT);
  }

  const msvcMed = median(times.msvc);
  const clangMed = median(times.clang);
  return {
    name: 'Stream pipe 3-chain (200x100 16KB)',
    msvc: msvcMed,
    clang: clangMed,
    msvcFmt: formatMs(msvcMed),
    clangFmt: formatMs(clangMed),
    msvcStd: formatMs(stddev(times.msvc)),
    clangStd: formatMs(stddev(times.clang)),
    diff: pctDiff(msvcMed, clangMed),
    winner: winner(msvcMed, clangMed, true, stddev(times.msvc), stddev(times.clang)),
    unit: 'ms',
    lowerIsBetter: true,
  };
}

function benchMemoryHeavy() {
  const code = `
    const arr = [];
    for (let i = 0; i < 500000; i++) arr.push({ idx: i, data: 'x'.repeat(20) });
    const m = process.memoryUsage();
    console.log(JSON.stringify(m));
  `;

  const msvcMem = [];
  const clangMem = [];

  for (let i = 0; i < WARMUP; i++) runBothTimed(['-e', code]);

  for (let i = 0; i < ITERATIONS; i++) {
    const { msvc: msvcR, clang: clangR } = runBothTimed(['-e', code]);
    try { msvcMem.push(JSON.parse(msvcR.stdout.trim())); } catch {}
    try { clangMem.push(JSON.parse(clangR.stdout.trim())); } catch {}
  }

  const msvcRSS = median(msvcMem.map(m => m.rss));
  const clangRSS = median(clangMem.map(m => m.rss));
  const msvcHeap = median(msvcMem.map(m => m.heapUsed));
  const clangHeap = median(clangMem.map(m => m.heapUsed));

  const msvcRSSArr = msvcMem.map(m => m.rss);
  const clangRSSArr = clangMem.map(m => m.rss);
  const msvcHeapArr = msvcMem.map(m => m.heapUsed);
  const clangHeapArr = clangMem.map(m => m.heapUsed);

  return [
    {
      name: 'Memory: RSS under 500k objects',
      msvc: msvcRSS, clang: clangRSS,
      msvcFmt: formatBytes(msvcRSS), clangFmt: formatBytes(clangRSS),
      msvcStd: formatBytes(stddev(msvcRSSArr)), clangStd: formatBytes(stddev(clangRSSArr)),
      diff: pctDiff(msvcRSS, clangRSS), winner: winner(msvcRSS, clangRSS, true, stddev(msvcRSSArr), stddev(clangRSSArr)),
      unit: 'bytes', lowerIsBetter: true,
    },
    {
      name: 'Memory: Heap Used under 500k objects',
      msvc: msvcHeap, clang: clangHeap,
      msvcFmt: formatBytes(msvcHeap), clangFmt: formatBytes(clangHeap),
      msvcStd: formatBytes(stddev(msvcHeapArr)), clangStd: formatBytes(stddev(clangHeapArr)),
      diff: pctDiff(msvcHeap, clangHeap), winner: winner(msvcHeap, clangHeap, true, stddev(msvcHeapArr), stddev(clangHeapArr)),
      unit: 'bytes', lowerIsBetter: true,
    },
  ];
}

function benchVersionInfo() {
  const msvcVersion = execFileSync(MSVC_BIN, ['--version'], { encoding: 'utf8' }).trim();
  const clangVersion = execFileSync(CLANG_BIN, ['--version'], { encoding: 'utf8' }).trim();
  const msvcV8 = execFileSync(MSVC_BIN, ['-e', 'console.log(process.versions.v8)'], { encoding: 'utf8' }).trim();
  const clangV8 = execFileSync(CLANG_BIN, ['-e', 'console.log(process.versions.v8)'], { encoding: 'utf8' }).trim();
  return { msvcVersion, clangVersion, msvcV8, clangV8 };
}

// ─── Runner ────────────────────────────────────────────────────────────────────

function printTable(results) {
  const colWidths = { name: 40, msvc: 18, clang: 18, diff: 12, winner: 10 };
  const sep = '-'.repeat(colWidths.name + colWidths.msvc + colWidths.clang + colWidths.diff + colWidths.winner + 12);

  console.log(sep);
  console.log(
    '| ' + 'Benchmark'.padEnd(colWidths.name) +
    '| ' + 'MSVC'.padEnd(colWidths.msvc) +
    '| ' + 'ClangCL'.padEnd(colWidths.clang) +
    '| ' + 'Diff'.padEnd(colWidths.diff) +
    '| ' + 'Winner'.padEnd(colWidths.winner) + '|'
  );
  console.log(sep);

  for (const r of results) {
    const msvcStr = r.msvcStd ? `${r.msvcFmt} ±${r.msvcStd}` : r.msvcFmt;
    const clangStr = r.clangStd ? `${r.clangFmt} ±${r.clangStd}` : r.clangFmt;
    console.log(
      '| ' + r.name.padEnd(colWidths.name) +
      '| ' + msvcStr.padEnd(colWidths.msvc) +
      '| ' + clangStr.padEnd(colWidths.clang) +
      '| ' + r.diff.padEnd(colWidths.diff) +
      '| ' + r.winner.padEnd(colWidths.winner) + '|'
    );
  }
  console.log(sep);
}

async function main() {
  console.log('=== Node.js Binary Benchmark: MSVC vs ClangCL ===\n');
  console.log(`Platform: ${os.platform()} ${os.arch()}`);
  console.log(`CPUs: ${os.cpus()[0].model} (${os.cpus().length} cores)`);
  console.log(`RAM: ${formatBytes(os.totalmem())}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Iterations per benchmark: ${ITERATIONS} (warmup: ${WARMUP})\n`);

  // Version info
  const vinfo = benchVersionInfo();
  console.log(`MSVC binary  : ${MSVC_BIN}`);
  console.log(`  Node version: ${vinfo.msvcVersion}, V8: ${vinfo.msvcV8}`);
  console.log(`ClangCL binary: ${CLANG_BIN}`);
  console.log(`  Node version: ${vinfo.clangVersion}, V8: ${vinfo.clangV8}\n`);

  const allResults = [];
  const benchmarks = [
    { name: 'Binary Size',           fn: benchBinarySize },
    { name: 'Startup Time',          fn: benchStartupTime },
    { name: 'require("fs")',         fn: benchRequireFS },
    { name: 'Require 10 modules',    fn: benchRequireHeavy },
    { name: 'Memory at Startup',     fn: benchMemoryStartup },
    { name: 'Buffer Operations',     fn: benchBufferOps },
    { name: 'JSON parse/stringify',  fn: benchJSON },
    { name: 'URL parsing (Ada)',     fn: benchURLParsing },
    { name: 'Zlib compress/decomp',  fn: benchZlib },
    { name: 'TextEncoder/Decoder',   fn: benchTextCodec },
    { name: 'Stream pipe throughput', fn: benchStreamPipe },
    { name: 'FS readFileSync',       fn: benchFSRead },
    { name: 'Memory under load',     fn: benchMemoryHeavy },
  ];

  for (const bench of benchmarks) {
    process.stdout.write(`Running: ${bench.name}...`);
    const result = bench.fn();
    if (Array.isArray(result)) {
      allResults.push(...result);
    } else {
      allResults.push(result);
    }
    console.log(' done');
  }

  console.log('\n');
  printTable(allResults);

  // Summary — wins are weighted by the magnitude of the percentage difference
  // so a 10% gap counts 10x more than a 1% gap.
  let msvcWins = 0, clangWins = 0, ties = 0;
  let msvcAdvantage = 0, clangAdvantage = 0;
  for (const r of allResults) {
    const pct = r.msvc > 0 ? Math.abs(((r.clang - r.msvc) / r.msvc) * 100) : 0;
    if (r.winner === 'MSVC')        { msvcWins++;  msvcAdvantage  += pct; }
    else if (r.winner === 'ClangCL') { clangWins++; clangAdvantage += pct; }
    else ties++;
  }
  const totalAdv = msvcAdvantage + clangAdvantage;
  const msvcShare  = totalAdv > 0 ? (msvcAdvantage  / totalAdv * 100).toFixed(1) : '50.0';
  const clangShare = totalAdv > 0 ? (clangAdvantage / totalAdv * 100).toFixed(1) : '50.0';
  const overallWinner = msvcAdvantage > clangAdvantage ? 'MSVC' : clangAdvantage > msvcAdvantage ? 'ClangCL' : 'Tie';
  console.log(`\nWin count  : MSVC ${msvcWins}, ClangCL ${clangWins}, Ties ${ties} (out of ${allResults.length} benchmarks)`);
  console.log(`Pct advantage: MSVC ${msvcAdvantage.toFixed(2)}% (${msvcShare}%), ClangCL ${clangAdvantage.toFixed(2)}% (${clangShare}%)`);
  console.log(`Overall winner by weighted advantage: ${overallWinner}\n`);
}

main().catch(console.error);
