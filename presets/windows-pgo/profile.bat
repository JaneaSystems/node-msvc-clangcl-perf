cd /d "%~dp0"
wpr -start GeneralProfile
node_main_ltcg.exe ..\..\index.js node_ltcg_pgo_use.exe
wpr -stop trace1.etl

