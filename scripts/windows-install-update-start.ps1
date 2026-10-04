param(
  [string]$RepoUrl = "https://github.com/Luisgustavocn/Controle-academia.git",
  [string]$InstallDir = "$env:USERPROFILE\Controle-academia",
  [string]$DbName = "controle_academia",
  [string]$DbUser = "postgres",
  [string]$DbPassword = $env:CONTROLE_ACADEMIA_DB_PASSWORD,
  [string]$DbPort = "5432"
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Refresh-Path {
  $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
}

function Test-CommandExists([string]$CommandName) {
  return [bool](Get-Command $CommandName -ErrorAction SilentlyContinue)
}

function Invoke-ExternalCommand([string]$FilePath, [string[]]$Arguments, [string]$Label) {
  Write-Step $Label
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao executar: $FilePath"
  }
}

function Ensure-Winget {
  if (Test-CommandExists "winget") {
    return
  }

  throw "O Windows precisa ter o winget/App Installer habilitado para a instalacao automatica."
}

function Install-WingetPackage([string]$PackageId, [string]$Label, [string[]]$ExtraArguments = @()) {
  $arguments = @(
    "install",
    "--id", $PackageId,
    "-e",
    "--accept-package-agreements",
    "--accept-source-agreements"
  ) + $ExtraArguments

  Invoke-ExternalCommand "winget" $arguments $Label
  Refresh-Path
}

function Ensure-Git {
  if (Test-CommandExists "git") {
    return
  }

  Install-WingetPackage "Git.Git" "Instalando Git"

  if (-not (Test-CommandExists "git")) {
    throw "Git nao foi encontrado apos a instalacao."
  }
}

function Ensure-Node {
  if ((Test-CommandExists "node") -and (Test-CommandExists "npm")) {
    return
  }

  Install-WingetPackage "OpenJS.NodeJS.LTS" "Instalando Node.js"

  if ((-not (Test-CommandExists "node")) -or (-not (Test-CommandExists "npm"))) {
    throw "Node.js/npm nao foram encontrados apos a instalacao."
  }
}

function Ensure-Postgres {
  if (Test-CommandExists "psql") {
    return
  }

  Install-WingetPackage `
    "PostgreSQL.PostgreSQL.16" `
    "Instalando PostgreSQL" `
    @("--override", "--mode unattended --unattendedmodeui none --superpassword $DbPassword --serverport $DbPort")

  if (-not (Test-CommandExists "psql")) {
    throw "PostgreSQL foi instalado, mas o comando psql nao ficou disponivel. Feche e abra o script novamente."
  }
}

function Ensure-Repository {
  if (Test-Path (Join-Path $InstallDir ".git")) {
    Set-Location $InstallDir
    Invoke-ExternalCommand "git" @("pull", "--ff-only") "Atualizando projeto pelo GitHub"
    return
  }

  if (Test-Path $InstallDir) {
    if (Test-Path (Join-Path $InstallDir "package.json")) {
      Set-Location $InstallDir
      Write-Step "Usando pasta existente do projeto"
      return
    }

    throw "A pasta $InstallDir ja existe e nao parece conter o projeto. Escolha outra pasta ou remova essa."
  }

  Invoke-ExternalCommand "git" @("clone", $RepoUrl, $InstallDir) "Baixando projeto do GitHub"
  Set-Location $InstallDir
}

function Set-Or-ReplaceEnvValue([string]$FilePath, [string]$Key, [string]$Value) {
  $line = "$Key=`"$Value`""
  $content = ""

  if (Test-Path $FilePath) {
    $content = Get-Content $FilePath -Raw
  }

  if ($content -match "(?m)^$([regex]::Escape($Key))=") {
    $updated = [regex]::Replace($content, "(?m)^$([regex]::Escape($Key))=.*$", $line)
    Set-Content -Path $FilePath -Value $updated -Encoding UTF8
    return
  }

  if ($content.Length -gt 0 -and -not $content.EndsWith("`n")) {
    $content += "`r`n"
  }

  Set-Content -Path $FilePath -Value ($content + $line + "`r`n") -Encoding UTF8
}

function Ensure-EnvFile {
  $envExample = Join-Path $InstallDir ".env.example"
  $envFile = Join-Path $InstallDir ".env"

  if (-not (Test-Path $envFile)) {
    Copy-Item $envExample $envFile
  }

  $databaseUrl = "postgresql://$DbUser`:$DbPassword@localhost:$DbPort/$DbName"
  $jwtSecret = ([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N"))

  Set-Or-ReplaceEnvValue $envFile "DATABASE_URL" $databaseUrl
  Set-Or-ReplaceEnvValue $envFile "APP_DATA_DIR" (Join-Path $InstallDir "data")

  $envContent = Get-Content $envFile -Raw
  if ($envContent -match '(?m)^JWT_SECRET="?troque-por-uma-chave-forte"?$' -or -not ($envContent -match '(?m)^JWT_SECRET=')) {
    Set-Or-ReplaceEnvValue $envFile "JWT_SECRET" $jwtSecret
  }

  $env:DATABASE_URL = $databaseUrl
  $env:APP_DATA_DIR = Join-Path $InstallDir "data"
  $env:PGPASSWORD = $DbPassword
}

function Start-PostgresServiceIfNeeded {
  $service = Get-Service | Where-Object {
    $_.Name -like "postgresql*" -or $_.DisplayName -like "postgresql*"
  } | Select-Object -First 1

  if ($null -eq $service) {
    return
  }

  if ($service.Status -ne "Running") {
    Write-Step "Iniciando servico do PostgreSQL"
    Start-Service $service.Name
    Start-Sleep -Seconds 3
  }
}

function Ensure-Database {
  Write-Step "Verificando banco de dados"

  $check = & psql -h "localhost" -p $DbPort -U $DbUser -d "postgres" -tAc "SELECT 1 FROM pg_database WHERE datname = '$DbName';"
  if ($LASTEXITCODE -ne 0) {
    throw "Nao foi possivel conectar ao PostgreSQL com o usuario '$DbUser'."
  }

  if ($check.Trim() -ne "1") {
    & psql -h "localhost" -p $DbPort -U $DbUser -d "postgres" -c "CREATE DATABASE `"$DbName`";"
    if ($LASTEXITCODE -ne 0) {
      throw "Falha ao criar o banco $DbName."
    }
  }
}

function Ensure-SeedIfNeeded {
  Write-Step "Verificando dados iniciais"

  $userCount = & psql -h "localhost" -p $DbPort -U $DbUser -d $DbName -tAc 'SELECT COUNT(*) FROM "User";'
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao consultar a tabela de usuarios."
  }

  if ([int]($userCount.Trim()) -eq 0) {
    Invoke-ExternalCommand "npm" @("run", "prisma:seed") "Aplicando dados iniciais"
  }
}

try {
  if ([string]::IsNullOrWhiteSpace($DbPassword)) {
    throw "Defina CONTROLE_ACADEMIA_DB_PASSWORD antes de executar este script."
  }

  Ensure-Winget
  Ensure-Git
  Ensure-Node
  Ensure-Postgres
  Ensure-Repository
  Ensure-EnvFile
  Start-PostgresServiceIfNeeded
  Invoke-ExternalCommand "npm" @("install") "Instalando dependencias do projeto"
  Invoke-ExternalCommand "npx" @("prisma", "generate") "Gerando cliente Prisma"
  Ensure-Database
  Invoke-ExternalCommand "npx" @("prisma", "migrate", "deploy") "Aplicando migracoes do banco"
  Ensure-SeedIfNeeded
  Invoke-ExternalCommand "npm" @("run", "build") "Gerando build de producao"
  Invoke-ExternalCommand "npm" @("start") "Iniciando servidor local"
}
catch {
  Write-Host ""
  Write-Host "Falha ao instalar/atualizar/iniciar o sistema." -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host ""
  Write-Host "Se for a primeira vez, aceite as instalacoes do Windows quando forem solicitadas." -ForegroundColor Yellow
  exit 1
}
