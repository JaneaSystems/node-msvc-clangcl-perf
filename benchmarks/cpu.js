// cpu.js — CPU-intensive benchmarks exercising compiled C++ internals.
// Each exported function accepts a ctx object:
//   { runAll, BINS, NAMES, N, WARMUP, ITERATIONS }

"use strict";

const { makeDurationResult } = require("./helpers");

function benchBufferOps(ctx) {
  const { runAll, NAMES, N, WARMUP, ITERATIONS } = ctx;
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
  const times = Array.from({ length: N }, () => []);
  for (let i = 0; i < WARMUP; i++) runAll(["-e", code]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAll(["-e", code]).forEach((r, idx) => {
      const t = parseFloat(r.stdout.trim());
      if (!isNaN(t)) times[idx].push(t);
    });
  }
  return makeDurationResult("Buffer ops (50k alloc+fill+hex)", NAMES, times);
}

function benchJSON(ctx) {
  const { runAll, NAMES, N, WARMUP, ITERATIONS } = ctx;
  const code = `
    const { performance } = require('perf_hooks');
    const obj = {};
    for (let i = 0; i < 200; i++) obj['key' + i] = { val: i, arr: [i, i*2, 'str'.repeat(10)] };
    const str = JSON.stringify(obj);
    const start = performance.now();
    for (let i = 0; i < 20000; i++) { JSON.parse(str); JSON.stringify(obj); }
    console.log(performance.now() - start);
  `;
  const times = Array.from({ length: N }, () => []);
  for (let i = 0; i < WARMUP; i++) runAll(["-e", code]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAll(["-e", code]).forEach((r, idx) => {
      const t = parseFloat(r.stdout.trim());
      if (!isNaN(t)) times[idx].push(t);
    });
  }
  return makeDurationResult("JSON parse+stringify (20k iters)", NAMES, times);
}

function benchURLParsing(ctx) {
  // Ada URL parser — pure compiled C++, no JIT involvement
  const { runAll, NAMES, N, WARMUP, ITERATIONS } = ctx;
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
    for (let i = 0; i < 50000; i++) new URL(urls[i % urls.length]);
    console.log(performance.now() - start);
  `;
  const times = Array.from({ length: N }, () => []);
  for (let i = 0; i < WARMUP; i++) runAll(["-e", code]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAll(["-e", code]).forEach((r, idx) => {
      const t = parseFloat(r.stdout.trim());
      if (!isNaN(t)) times[idx].push(t);
    });
  }
  return makeDurationResult("URL parsing (50k, Ada C++)", NAMES, times);
}

function benchZlib(ctx) {
  // zlib is a compiled C library wrapped in C++ bindings
  const { runAll, NAMES, N, WARMUP, ITERATIONS } = ctx;
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
  const times = Array.from({ length: N }, () => []);
  for (let i = 0; i < WARMUP; i++) runAll(["-e", code]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAll(["-e", code]).forEach((r, idx) => {
      const t = parseFloat(r.stdout.trim());
      if (!isNaN(t)) times[idx].push(t);
    });
  }
  return makeDurationResult("Zlib deflate+inflate 64KB (500x)", NAMES, times);
}

function benchTextCodec(ctx) {
  // TextEncoder/TextDecoder exercise compiled ICU + C++ string conversion
  const { runAll, NAMES, N, WARMUP, ITERATIONS } = ctx;
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
  const times = Array.from({ length: N }, () => []);
  for (let i = 0; i < WARMUP; i++) runAll(["-e", code]);
  for (let i = 0; i < ITERATIONS; i++) {
    runAll(["-e", code]).forEach((r, idx) => {
      const t = parseFloat(r.stdout.trim());
      if (!isNaN(t)) times[idx].push(t);
    });
  }
  return makeDurationResult("TextEncoder/Decoder (10k iters)", NAMES, times);
}

module.exports = {
  benchBufferOps,
  benchJSON,
  benchURLParsing,
  benchZlib,
  benchTextCodec,
};
