# Деплой на GitHub Pages (після: gh auth login)
$ErrorActionPreference = "Stop"
$RepoName = if ($env:GH_REPO_NAME) { $env:GH_REPO_NAME } else { "ttn-novaposhta" }

$root = Resolve-Path (Join-Path $PSScriptRoot "..")

Set-Location $root

$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) {
  throw "Встановіть GitHub CLI: winget install GitHub.cli"
}

gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Спочатку увійдіть: gh auth login"
}

$user = gh api user -q .login
Write-Host "GitHub: $user"

$remote = git remote get-url origin 2>$null
if (-not $remote) {
  gh repo create $RepoName --public --source=. --remote=origin --push
} else {
  git push -u origin main
}

$apiKey = $env:NP_API_KEY
if (-not $apiKey -and (Test-Path ".env")) {
  Get-Content ".env" | ForEach-Object {
    if ($_ -match '^NP_API_KEY=(.+)$') { $apiKey = $Matches[1].Trim() }
  }
}
if ($apiKey) {
  gh secret set NP_API_KEY --body $apiKey --repo "$user/$RepoName"
  Write-Host "Secret NP_API_KEY встановлено"
}

gh api "repos/$user/$RepoName/pages" -X PUT -f build_type=workflow 2>$null
if ($LASTEXITCODE -ne 0) {
  gh api "repos/$user/$RepoName/pages" -X POST -f build_type=workflow 2>$null
}

Write-Host "Запуск синхронізації ТТН..."
gh workflow run "Sync Nova Poshta TTN" --repo "$user/$RepoName"

$pagesUrl = "https://$user.github.io/$RepoName/"
Write-Host ""
Write-Host "Готово! Сайт (через 1–3 хв): $pagesUrl"
Write-Host "Перевірте Actions: https://github.com/$user/$RepoName/actions"
