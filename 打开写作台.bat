@echo off
chcp 65001 >nul
cd /d "D:\WritingWorkbench"
start "WritingWorkbench Server" "C:\Users\lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "D:\WritingWorkbench\server.js"
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:4173/index.html"
exit
