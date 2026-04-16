@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

if "%~1"=="" (
    echo Usage: %~nx0 ^<runner-binary^>
    echo Example: %~nx0 node_main_ltcg.exe
    exit /b 1
)

set RUNNER=%~1
set BINARY=%~1
set INDEX=..\..\..\index.js

rem Clean up previous trace files
if exist trace_*.etl (
    echo Removing previous trace files...
    del /q trace_*.etl
)

rem Benchmark names (skip "Binary Size" — not a real test).
rem Each benchmark is numbered to avoid batch quoting issues with special characters.
set "BENCH_1=Startup Time"
set "BENCH_2=require(""fs"")"
set "BENCH_3=Require 10 modules"
set "BENCH_4=Memory at Startup"
set "BENCH_5=Buffer Operations"
set "BENCH_6=JSON parse/stringify"
set "BENCH_7=URL parsing (Ada)"
set "BENCH_8=Zlib compress/decomp"
set "BENCH_9=TextEncoder/Decoder"
set "BENCH_10=Stream pipe throughput"
set "BENCH_11=FS readFileSync"
set "BENCH_12=Memory under load"

for /L %%I in (1,1,12) do (
    set "NAME=!BENCH_%%I!"
    set "FILENAME=!NAME: =_!"
    set "FILENAME=!FILENAME:(=!"
    set "FILENAME=!FILENAME:)=!"
    set "FILENAME=!FILENAME:"=!"
    set "FILENAME=!FILENAME:/=_!"
    echo.
    echo === Profiling: !NAME! ===
    wpr -start GeneralProfile
    %RUNNER% %INDEX% %BINARY% --benchmark "!NAME!"
    wpr -stop "trace_!FILENAME!.etl"
)

echo.
echo All profiles captured.

