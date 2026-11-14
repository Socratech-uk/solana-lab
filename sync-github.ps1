param(
  [string]$Message='',
  [switch]$Check,
  [switch]$Staged
)
$ErrorActionPreference='Stop'
if(!(Get-Command git -ErrorAction SilentlyContinue)){throw 'Git is required.'}
if(!(Get-Command node -ErrorAction SilentlyContinue)){throw 'Node.js 18 or newer is required.'}
$syncArguments=@((Join-Path $PSScriptRoot 'tools\github-sync.mjs'))
if($Check){$syncArguments+='--check'}
if($Staged){$syncArguments+='--staged'}
if($Message){$syncArguments+=@('--message',$Message)}
& node @syncArguments
exit $LASTEXITCODE
