@echo off
cd /d "%~dp0"
node_msvc.exe ..\..\benchmark_compare.js node_msvc.exe node_clangcl.exe
