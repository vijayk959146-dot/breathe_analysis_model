@echo off
echo Starting Breathe Analysis Server...
echo Make sure your ESP32 is powered on and connected to Wi-Fi.
echo Press Ctrl+C to stop the server when done.
echo.
.venv\Scripts\python.exe backend\app.py
pause
