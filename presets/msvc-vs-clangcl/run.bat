@echo off
cd /d "%~dp0"
node_msvc.exe ..\..\index.js node_msvc.exe node_clangcl.exe
