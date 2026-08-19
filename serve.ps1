$env:Path = "C:\Ruby33-x64\bin;" + $env:Path
Set-Location $PSScriptRoot
bundle exec jekyll serve --config _config.yml,_config.local.yml
