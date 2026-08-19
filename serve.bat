@echo off
cd /d "%~dp0"
set PATH=C:\Ruby33-x64\bin;%PATH%
echo Syncing catalog from GitHub...
git fetch origin main 2>nul
git checkout origin/main -- _data/catalog.json 2>nul
bundle exec jekyll serve --config _config.yml,_config.local.yml
