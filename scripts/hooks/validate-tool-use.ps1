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
            [Console]::Error.WriteLine('validate-tool-use: input was not JSON; allowing because schema is unknown.')
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
            if ($leaf.Name -match '(?i)(path|file|uri|target|destination|cwd)') {
                $path = Normalize-FilePath -Candidate $leaf.Value -RepoRoot $RepoRoot
                if ($path) {
                    $paths.Add($path)
                }
            }
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($InputData.Raw)) {
        $patchMatches = [regex]::Matches($InputData.Raw, '(?im)^\*\*\*\s+(?:Add|Update|Delete)\s+File:\s+(.+?)\s*$')
        foreach ($match in $patchMatches) {
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

function Test-IsWriteTool {
    param($InputData)

    $haystack = $InputData.Raw
    if ($null -ne $InputData.Json) {
        $haystack = ($haystack + "`n" + ((@(Get-StringLeaves -Value $InputData.Json) | ForEach-Object { $_.Value }) -join "`n"))
    }

    return $haystack -match '(?i)(apply_patch|create_file|edit_notebook_file|write|edit|delete|move|rename|set-content|out-file|new-item|remove-item)'
}

function Test-AgentMode {
    param(
        $InputData,
        [string]$ModeName
    )

    $haystack = $InputData.Raw
    if ($null -ne $InputData.Json) {
        $haystack = ($haystack + "`n" + ((@(Get-StringLeaves -Value $InputData.Json) | ForEach-Object { $_.Value }) -join "`n"))
    }

    return $haystack -match [regex]::Escape($ModeName)
}

function Deny {
    param([string]$Reason)

    [pscustomobject]@{
        decision = 'deny'
        reason = $Reason
    } | ConvertTo-Json -Compress
    exit 0
}

try {
    $inputData = Read-HookInput
    $repoRoot = Get-RepoRoot
    $repoFull = [System.IO.Path]::GetFullPath($repoRoot)
    $isWriteTool = Test-IsWriteTool -InputData $inputData
    $paths = @(Get-DetectedPaths -InputData $inputData -RepoRoot $repoRoot)

    if (-not $isWriteTool -or $paths.Count -eq 0) {
        [Console]::Error.WriteLine('validate-tool-use: no write intent or file path detected; allowing.')
        exit 0
    }

    foreach ($path in $paths) {
        $full = [System.IO.Path]::GetFullPath($path)
        $repoBase = $repoFull.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
        if (-not $full.StartsWith($repoBase + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -and
            -not $full.Equals($repoBase, [System.StringComparison]::OrdinalIgnoreCase)) {
            Deny "Refusing detectable write outside workspace: $full"
        }
    }

    $isApply = Test-AgentMode -InputData $inputData -ModeName 'sdd-apply'
    $isVerify = Test-AgentMode -InputData $inputData -ModeName 'sdd-verify'

    foreach ($path in $paths) {
        $relative = Get-RelativePath -Path $path -RepoRoot $repoRoot
        if (-not $relative) {
            continue
        }

        if ($isApply -and $relative -match '(^|/)openspec/.*/specs/.*/spec\.md$') {
            Deny "sdd-apply must not edit OpenSpec spec files: $relative"
        }

        if ($isVerify -and $relative -notmatch '(^|/)openspec/.*/(verify-report\.md|state\.yaml)$') {
            Deny "sdd-verify must not edit implementation or production files: $relative"
        }
    }

    [Console]::Error.WriteLine('validate-tool-use: checks passed; allowing.')
    exit 0
}
catch {
    [Console]::Error.WriteLine("validate-tool-use: fail-safe allow: $($_.Exception.Message)")
    exit 0
}
