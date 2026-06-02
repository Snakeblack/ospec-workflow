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
            [Console]::Error.WriteLine('persist-session-state: input was not JSON; continuing without structured fields.')
        }
    }

    [pscustomobject]@{
        Raw = $raw
        Json = $json
    }
}

function Get-StringLeaves {
    param(
        [Parameter(ValueFromPipeline = $true)]
        $Value
    )

    process {
        if ($null -eq $Value) {
            return
        }

        if ($Value -is [string]) {
            $Value
            return
        }

        if ($Value -is [System.Collections.IDictionary]) {
            foreach ($key in $Value.Keys) {
                Get-StringLeaves -Value $Value[$key]
            }
            return
        }

        if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
            foreach ($item in $Value) {
                Get-StringLeaves -Value $item
            }
            return
        }

        $properties = $Value.PSObject.Properties
        if ($properties) {
            foreach ($property in $properties) {
                Get-StringLeaves -Value $property.Value
            }
        }
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

try {
    $inputData = Read-HookInput
    $repoRoot = Get-RepoRoot
    $gitInfo = Join-Path $repoRoot '.git\info'

    if (-not (Test-Path -LiteralPath $gitInfo -PathType Container)) {
        [Console]::Error.WriteLine('persist-session-state: .git/info not found; diagnostic marker skipped.')
        exit 0
    }

    $strings = @()
    if ($null -ne $inputData.Json) {
        $strings = @(Get-StringLeaves -Value $inputData.Json)
    }
    elseif (-not [string]::IsNullOrWhiteSpace($inputData.Raw)) {
        $strings = @($inputData.Raw)
    }

    $combined = ($strings -join "`n")
    $hasSddIntent = $combined -match '(?i)(^|\s)/(sdd-[a-z0-9:-]+)\b|\bsdd[-\s]?(init|foundation|explore|propose|spec|design|tasks|apply|verify|archive|continue|lite|ff|new)\b|\bopenspec\b|\bspec[- ]driven development\b'
    $event = 'unknown'

    if ($null -ne $inputData.Json) {
        foreach ($name in @('event', 'hook_event_name', 'hookEventName')) {
            $property = $inputData.Json.PSObject.Properties[$name]
            if ($property -and $property.Value) {
                $event = [string]$property.Value
                break
            }
        }
    }

    if ($event -eq 'unknown') {
        if ($combined -match '(?i)precompact') {
            $event = 'PreCompact'
        }
        else {
            $event = 'UserPromptSubmit'
        }
    }

    $promptPreview = ''
    if ($combined.Length -gt 0) {
        $promptPreview = ($combined -replace '\s+', ' ').Trim()
        if ($promptPreview.Length -gt 200) {
            $promptPreview = $promptPreview.Substring(0, 200)
        }
    }

    $marker = [ordered]@{
        schema = 'ospec-workflow-session-marker/v1'
        writtenAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        event = $event
        detectedSddIntent = [bool]$hasSddIntent
        diagnosticOnly = $true
        promptPreview = $promptPreview
    }

    $target = Join-Path $gitInfo 'ospec-workflow-session.json'
    $marker | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $target -Encoding UTF8
    exit 0
}
catch {
    [Console]::Error.WriteLine("persist-session-state: fail-safe no-op: $($_.Exception.Message)")
    exit 0
}
