#!/usr/bin/env bash
cd "$(dirname "$0")"
./node_clean ../../benchmark_compare_multiple.js ./node_clean ./node_lto ./node_pgo ./node_lto_pgo