#!/usr/bin/env bash
cd "$(dirname "$0")"
./node_clean ../../benchmark_compare.js ./node_clean ./node_pgo
