# Read-only diagnostic. Run from PowerShell as Administrator if access is denied.
param([int]$Days = 2, [string]$OutputPath = (Join-Path $PWD 'defender-storage-blocks.csv'))
$ErrorActionPreference = 'Stop'
$events = Get-WinEvent -FilterHashtable @{
    LogName = 'Microsoft-Windows-Windows Defender/Operational'
    Id = 1126
    StartTime = (Get-Date).AddDays(-[Math]::Max(1, [Math]::Min($Days, 14)))
} -ErrorAction Stop
$rows = foreach ($event in $events) {
    [xml]$xml = $event.ToXml()
    $fields = @{}
    foreach ($field in $xml.Event.EventData.Data) { $fields[$field.Name] = $field.'#text' }
    $destination = $fields['Destination']
    if ($destination -notmatch '(?i)(^|\.)storage\.googleapis\.com([/:]|$)') { continue }
    # Keep only origin, never query strings, paths, cookies or full process arguments.
    try { $destination = ([uri]$destination).GetLeftPart([System.UriPartial]::Authority) } catch { $destination = 'storage.googleapis.com (unparsed)' }
    [pscustomobject]@{
        Time = $event.TimeCreated.ToString('o')
        EventId = $event.Id
        DestinationOrigin = $destination
        Process = [IO.Path]::GetFileName($fields['Process Name'])
    }
}
if (-not $rows) { Write-Output 'No matching storage.googleapis.com block events found.'; exit }
$rows | Export-Csv -LiteralPath $OutputPath -NoTypeInformation -Encoding utf8
Write-Output "Saved matching Defender events to $OutputPath"
