$env:Path = "C:\Ruby33-x64\bin;" + $env:Path
Set-Location $PSScriptRoot
Write-Host "Syncing catalog from GitHub..."
git fetch origin main 2>$null
git checkout origin/main -- _data/catalog.json 2>$null
bundle exec jekyll serve --config _config.yml,_config.local.yml
