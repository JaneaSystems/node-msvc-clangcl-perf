#!/usr/bin/env bash
cd "$(dirname "$0")"
./node_clean ../../index.js ./node_clean ./node_pgo
