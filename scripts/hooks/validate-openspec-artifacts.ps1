$ErrorActionPreference = 'Stop'
$script:HookInputLines = @($input)

function Read-HookInput {
    $raw = ''
    try {
        if ($script:HookInputLines.Count -gt 0) {
            $raw = $script:HookInputLines -join "`n"
        }
        elseif ([Console]::IsInputRedirected) {
            $raw = [Console]::In.ReadToEnd()
        }
    }
    catch {
        $raw = ''
    }

    $json = $null
    if (-not [string]::IsNullOrWhiteSpace($raw)) {
        try {
            $json = $raw | ConvertFrom-Json -ErrorAction Stop
        }
        catch {
            [Console]::Error.WriteLine('validate-openspec-artifacts: input was not JSON; skipping artifact validation.')
        }
    }

    [pscustomobject]@{
        Raw = $raw
        Json = $json
    }
}

function Get-RepoRoot {
    try {
        return (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
    }
    catch {
        return (Get-Location).Path
    }
}

function Get-StringLeaves {
    param(
        [Parameter(ValueFromPipeline = $true)]
        $Value,
        [string]$Name = ''
    )

    process {
        if ($null -eq $Value) {
            return
        }

        if ($Value -is [string]) {
            [pscustomobject]@{ Name = $Name; Value = $Value }
            return
        }

        if ($Value -is [System.Collections.IDictionary]) {
            foreach ($key in $Value.Keys) {
                Get-StringLeaves -Value $Value[$key] -Name ([string]$key)
            }
            return
        }

        if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
            foreach ($item in $Value) {
                Get-StringLeaves -Value $item -Name $Name
            }
            return
        }

        $properties = $Value.PSObject.Properties
        if ($properties) {
            foreach ($property in $properties) {
                Get-StringLeaves -Value $property.Value -Name $property.Name
            }
        }
    }
}

function Normalize-FilePath {
    param(
        [string]$Candidate,
        [string]$RepoRoot
    )

    if ([string]::IsNullOrWhiteSpace($Candidate)) {
        return $null
    }

    $value = $Candidate.Trim().Trim('"').Trim("'")
    if ($value -match '^file://') {
        try {
            $value = ([System.Uri]$value).LocalPath
        }
        catch {
            return $null
        }
    }

    if ($value -notmatch '[\\/]') {
        return $null
    }

    try {
        if ([System.IO.Path]::IsPathRooted($value)) {
            return [System.IO.Path]::GetFullPath($value)
        }

        return [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $value))
    }
    catch {
        return $null
    }
}

function Get-DetectedPaths {
    param(
        $InputData,
        [string]$RepoRoot
    )

    $paths = New-Object System.Collections.Generic.List[string]

    if ($null -ne $InputData.Json) {
        foreach ($leaf in @(Get-StringLeaves -Value $InputData.Json)) {
            if ($leaf.Name -match '(?i)(path|file|uri|target|destination|artifact)') {
                $path = Normalize-FilePath -Candidate $leaf.Value -RepoRoot $RepoRoot
                if ($path) {
                    $paths.Add($path)
                }
            }
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($InputData.Raw)) {
        $matches = [regex]::Matches($InputData.Raw, '(?im)(openspec[\\/].*?[\\/]state\.yaml)')
        foreach ($match in $matches) {
            $path = Normalize-FilePath -Candidate $match.Groups[1].Value -RepoRoot $RepoRoot
            if ($path) {
                $paths.Add($path)
            }
        }
    }

    $paths | Select-Object -Unique
}

function Get-RelativePath {
    param(
        [string]$Path,
        [string]$RepoRoot
    )

    try {
        $root = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
        $full = [System.IO.Path]::GetFullPath($Path)
        if ($full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $full.Substring($root.Length).Replace('\', '/')
        }
    }
    catch {
        return $null
    }

    return $null
}

try {
    $inputData = Read-HookInput
    $repoRoot = Get-RepoRoot
    $paths = @(Get-DetectedPaths -InputData $inputData -RepoRoot $repoRoot)
    $stateFiles = @()

    foreach ($path in $paths) {
        $relative = Get-RelativePath -Path $path -RepoRoot $repoRoot
        if ($relative -and $relative -match '(^|/)openspec/.*/state\.yaml$') {
            $stateFiles += [pscustomobject]@{ FullPath = $path; RelativePath = $relative }
        }
    }

    if ($stateFiles.Count -eq 0) {
        [Console]::Error.WriteLine('validate-openspec-artifacts: no openspec state.yaml touched; skipping.')
        exit 0
    }

    foreach ($stateFile in $stateFiles) {
        if (-not (Test-Path -LiteralPath $stateFile.FullPath -PathType Leaf)) {
            [Console]::Error.WriteLine("validate-openspec-artifacts: state file missing after tool use: $($stateFile.RelativePath)")
            continue
        }

        $item = Get-Item -LiteralPath $stateFile.FullPath
        if ($item.Length -le 0) {
            [Console]::Error.WriteLine("validate-openspec-artifacts: state file is empty after tool use: $($stateFile.RelativePath)")
            continue
        }

        [Console]::Error.WriteLine("validate-openspec-artifacts: lightweight state file check passed: $($stateFile.RelativePath)")
    }

    exit 0
}
catch {
    [Console]::Error.WriteLine("validate-openspec-artifacts: fail-safe no-op: $($_.Exception.Message)")
    exit 0
}
