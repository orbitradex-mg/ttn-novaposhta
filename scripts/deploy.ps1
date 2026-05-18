# Deploy to GitHub Pages (run after: gh auth login)
$ErrorActionPreference = "Stop"
$RepoName = if ($env:GH_REPO_NAME) { $env:GH_REPO_NAME } else { "ttn-novaposhta" }

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "Install GitHub CLI: winget install GitHub.cli"
}

gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Run first: gh auth login"
}

$user = gh api user -q .login
Write-Host "GitHub user: $user"

$hasOrigin = [bool](git remote 2>$null | Where-Object { $_ -eq 'origin' })
if (-not $hasOrigin) {
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
  Write-Host "Secret NP_API_KEY set"
}

$ErrorActionPreference = 'Continue'
gh api "repos/$user/$RepoName/pages" -X PUT -f build_type=workflow 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  gh api "repos/$user/$RepoName/pages" -X POST -f build_type=workflow 2>$null | Out-Null
}
$ErrorActionPreference = 'Stop'

Write-Host "Starting TTN sync workflow..."
gh workflow run "Sync Nova Poshta TTN" --repo "$user/$RepoName"

$pagesUrl = "https://$user.github.io/$RepoName/"
Write-Host ""
Write-Host "Done. Site URL (wait 1-3 min): $pagesUrl"
Write-Host "Actions: https://github.com/$user/$RepoName/actions"
