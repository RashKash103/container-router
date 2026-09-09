[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version
)

$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw 'PowerShell 7 or newer is required.'
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory)]
        [string]$Command,

        [Parameter(ValueFromRemainingArguments)]
        [string[]]$Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
    }
}

function Get-CheckedOutput {
    param(
        [Parameter(Mandatory)]
        [string]$Command,

        [Parameter(ValueFromRemainingArguments)]
        [string[]]$Arguments
    )

    $output = & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
    }

    return ($output | Out-String).Trim()
}

function Set-JsonVersion {
    param(
        [Parameter(Mandatory)]
        [string]$Path,

        [Parameter(Mandatory)]
        [string]$NewVersion
    )

    $content = [IO.File]::ReadAllText($Path)
    $versionPattern = [regex]::new('("version"\s*:\s*")\d+\.\d+\.\d+(")')
    if (-not $versionPattern.IsMatch($content)) {
        throw "Could not find a version field in $Path."
    }

    $updated = $versionPattern.Replace($content, "`${1}${NewVersion}`${2}", 1)
    [IO.File]::WriteAllText($Path, $updated, [Text.UTF8Encoding]::new($false))
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tag = "v$Version"
$releaseNotesPath = $null

Push-Location $repositoryRoot
try {
    foreach ($command in @('git', 'gh', 'mise')) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
            throw "Required command is not available: $command"
        }
    }

    Invoke-Checked gh auth status --hostname github.com

    $branch = Get-CheckedOutput git branch --show-current
    if ($branch -ne 'main') {
        throw "Releases must be created from main; current branch is '$branch'."
    }

    if (Get-CheckedOutput git status --porcelain) {
        throw 'The working tree must be clean before creating a release.'
    }

    Invoke-Checked git fetch origin main
    $syncCounts = (Get-CheckedOutput git rev-list --left-right --count 'HEAD...origin/main') -split '\s+'
    if ($syncCounts.Count -ne 2 -or $syncCounts[0] -ne '0' -or $syncCounts[1] -ne '0') {
        throw 'main must be synchronized with origin/main before creating a release.'
    }

    $currentVersion = [version](Get-Content package.json -Raw | ConvertFrom-Json).version
    if ([version]$Version -le $currentVersion) {
        throw "Release version $Version must be newer than the current version $currentVersion."
    }

    & git rev-parse --verify --quiet "refs/tags/$tag" *> $null
    if ($LASTEXITCODE -eq 0) {
        throw "Tag $tag already exists."
    }

    & gh release view $tag --repo RashKash103/container-router *> $null
    if ($LASTEXITCODE -eq 0) {
        throw "GitHub Release $tag already exists."
    }

    $changelogPath = Join-Path $repositoryRoot 'changelog.md'
    $changelog = [IO.File]::ReadAllText($changelogPath)
    $newline = if ($changelog.Contains("`r`n")) { "`r`n" } else { "`n" }
    $unreleasedPattern = [regex]::new(
        '^## \[Unreleased\]\r?\n(?<notes>.*?)(?=^## \[)',
        [Text.RegularExpressions.RegexOptions]::Multiline -bor
        [Text.RegularExpressions.RegexOptions]::Singleline
    )
    $unreleasedMatch = $unreleasedPattern.Match($changelog)
    if (-not $unreleasedMatch.Success) {
        throw 'Could not find the Unreleased changelog section.'
    }

    $releaseNotes = $unreleasedMatch.Groups['notes'].Value.Trim()
    if (-not $releaseNotes) {
        throw 'The Unreleased changelog section must contain release notes.'
    }

    $promotedSection = "## [Unreleased]${newline}${newline}## [$tag]${newline}${newline}${releaseNotes}${newline}${newline}"
    $updatedChangelog = $unreleasedPattern.Replace($changelog, $promotedSection, 1)
    [IO.File]::WriteAllText($changelogPath, $updatedChangelog, [Text.UTF8Encoding]::new($false))

    Set-JsonVersion -Path (Join-Path $repositoryRoot 'package.json') -NewVersion $Version
    Set-JsonVersion -Path (Join-Path $repositoryRoot 'src/extension/manifest.json') -NewVersion $Version

    Invoke-Checked mise exec '--' yarn install --immutable
    Invoke-Checked mise exec '--' yarn test
    Invoke-Checked mise exec '--' yarn lint
    Invoke-Checked mise exec '--' yarn gulp build
    Invoke-Checked git diff --check

    Invoke-Checked git add package.json src/extension/manifest.json changelog.md
    Invoke-Checked git commit -m "chore(release): prepare $tag"
    Invoke-Checked git push origin main

    $commit = Get-CheckedOutput git rev-parse HEAD
    $runId = ''
    for ($attempt = 0; $attempt -lt 30 -and -not $runId; $attempt++) {
        $runId = Get-CheckedOutput gh run list `
            --repo RashKash103/container-router `
            --workflow .github/workflows/build.yaml `
            --branch main `
            --commit $commit `
            --limit 1 `
            --json databaseId `
            --jq '.[0].databaseId'
        if (-not $runId) {
            Start-Sleep -Seconds 3
        }
    }
    if (-not $runId) {
        throw "Timed out waiting for the GitHub Actions run for commit $commit."
    }
    Invoke-Checked gh run watch $runId --repo RashKash103/container-router --exit-status

    Invoke-Checked git tag $tag
    Invoke-Checked git push origin $tag

    Invoke-Checked mise exec '--' yarn gulp clean
    Invoke-Checked mise exec '--' yarn gulp dist

    $distPath = Join-Path $repositoryRoot 'dist'
    $xpiName = "container_router-$Version.xpi"
    $sourceName = "container_router-$Version-source.zip"
    $xpiPath = Join-Path $distPath $xpiName
    $sourcePath = Join-Path $distPath $sourceName
    Copy-Item (Join-Path $distPath 'src.zip') $sourcePath

    $checksumLines = @($xpiPath, $sourcePath) | ForEach-Object {
        $hash = (Get-FileHash -Algorithm SHA256 $_).Hash.ToLowerInvariant()
        "$hash  $(Split-Path $_ -Leaf)"
    }
    $checksumsPath = Join-Path $distPath 'SHA256SUMS'
    [IO.File]::WriteAllLines($checksumsPath, $checksumLines, [Text.UTF8Encoding]::new($false))

    $releaseBody = @"
## What's new

$releaseNotes

## Downloads

- ``$xpiName``: Firefox extension package
- ``$sourceName``: source archive for this release
- ``SHA256SUMS``: SHA-256 checksums for both artifacts
"@
    $releaseNotesPath = Join-Path ([IO.Path]::GetTempPath()) "container-router-$tag-release-notes.md"
    [IO.File]::WriteAllText($releaseNotesPath, $releaseBody, [Text.UTF8Encoding]::new($false))

    Invoke-Checked gh release create $tag `
        --repo RashKash103/container-router `
        --verify-tag `
        --title "Container Router $tag" `
        --notes-file $releaseNotesPath `
        $xpiPath `
        $sourcePath `
        $checksumsPath

    Invoke-Checked gh release view $tag --repo RashKash103/container-router --json url --jq .url
}
finally {
    if ($releaseNotesPath -and (Test-Path $releaseNotesPath)) {
        Remove-Item $releaseNotesPath
    }
    Pop-Location
}
