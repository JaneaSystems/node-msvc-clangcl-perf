@echo off
cd /d "%~dp0"
node_main_ltcg_arm64.exe ..\..\index.js node_main_ltcg_arm64.exe node_ltcg_pgo_arm64_use.exe
