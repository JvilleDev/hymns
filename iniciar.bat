@echo off
cd frontend
start /B cmd /c "bun run preview"

cd ../backend
start /B cmd /c "bun run start"

pause