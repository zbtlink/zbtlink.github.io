@echo off
cd /d "%~dp0"
set PATH=C:\Ruby33-x64\bin;%PATH%
bundle exec jekyll serve --config _config.yml,_config.local.yml
