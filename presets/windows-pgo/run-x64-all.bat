@echo off
cd /d "%~dp0"
node_main_ltcg.exe ..\..\index.js node_main_ltcg.exe node_ltcg_pgo_use.exe node_thin_lto_pgo_use.exe node_full_lto_pgo_use.exe
