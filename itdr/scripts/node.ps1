param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $NodeArgs
)

function Resolve-ItdrNode {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = @(
    "$env:LOCALAPPDATA\Programs\cursor\resources\app\resources\helpers\node.exe",
    "$env:LOCALAPPDATA\Programs\cursor\_\resources\app\resources\helpers\node.exe"
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { return $c }
  }
  throw "Node.js was not found. Phase 0 uses Node built-in modules only (no npm install)."
}

$node = Resolve-ItdrNode
if ($NodeArgs.Count -eq 0) { return $node }
& $node @NodeArgs
exit $LASTEXITCODE
