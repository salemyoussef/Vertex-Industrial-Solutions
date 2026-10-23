@echo off
cd /d "%~dp0"
echo Starting SmartFactory Web Server and Integrated MQTT Broker...

start "SmartFactory System" cmd /k "node server.js"

echo All services launched! You can close this small window.
exit
