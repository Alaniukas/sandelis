import JSZip from "jszip";
import { readFile } from "fs/promises";
import path from "path";
import type { OrderLabelData } from "./labels";
import { buildQrPdf } from "./qr-pdf";

function xmlEscape(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** BTXML — BarTender įdeda duomenis be atskiro CSV (reikia Named SubStrings šablone) */
export function buildBtxml(label: OrderLabelData, copies = 1): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<XMLScript Version="2.0" Name="Sandelio lipdukas">
  <Command Name="Spausdinti">
    <Print>
      <Format>sablonas.btw</Format>
      <NamedSubString Name="Kodas">
        <Value>${xmlEscape(label.kodas)}</Value>
      </NamedSubString>
      <NamedSubString Name="Objektas">
        <Value>${xmlEscape(label.objektas)}</Value>
      </NamedSubString>
      <NamedSubString Name="Kiek deziu paleciu">
        <Value>${xmlEscape(label.kiekis)}</Value>
      </NamedSubString>
      <NamedSubString Name="atvykimo data">
        <Value>${xmlEscape(label.data)}</Value>
      </NamedSubString>
      <PrintSetup>
        <IdenticalCopiesOfLabel>${Math.max(1, copies)}</IdenticalCopiesOfLabel>
      </PrintSetup>
    </Print>
  </Command>
</XMLScript>`;
}

const SPAUSDINTI_BAT = `@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Sandėlio lipdukas — BarTender

set "BTW=%CD%\\sablonas.btw"
set "CSV=%CD%\\duomenys.csv"
set "XML=%CD%\\uzduotis.xml"

if not exist "%BTW%" (
  echo [KLAIDA] Nerastas sablonas.btw — išarchyvuok ZIP į aplanką.
  pause
  exit /b 1
)

set /p COPIES=Kiek identiškų lipdukų spausdinti? [1]: 
if "%COPIES%"=="" set COPIES=1

REM BarTender keliai (2016 R7 / naujesni)
set "BT="
if exist "C:\\Program Files\\Seagull\\BarTender Suite\\bartend.exe" set "BT=C:\\Program Files\\Seagull\\BarTender Suite\\bartend.exe"
if exist "C:\\Program Files\\Seagull\\BarTender 2016\\BarTend.exe" set "BT=C:\\Program Files\\Seagull\\BarTender 2016\\BarTend.exe"
if exist "C:\\Program Files (x86)\\Seagull\\BarTender Suite\\bartend.exe" set "BT=C:\\Program Files (x86)\\Seagull\\BarTender Suite\\bartend.exe"

if "%BT%"=="" (
  echo [KLAIDA] BarTender nerastas. Įdiek arba pakoreguok kelią šiame .bat faile.
  pause
  exit /b 1
)

echo.
echo Spausdinama per BarTender...
echo Šablonas: %BTW%
echo Kopijos: %COPIES%
echo.

REM 1) CSV duomenų failas (jei šablone susietas Text File)
if exist "%CSV%" (
  "%BT%" /F="%BTW%" /D="%CSV%" /C=%COPIES% /P /X
  if %ERRORLEVEL%==0 goto :ok
)

REM 2) BTXML (jei šablone Named SubStrings: Kodas, Objektas, ...)
if exist "%XML%" (
  "%BT%" /XMLScript="%XML%" /X
  if %ERRORLEVEL%==0 goto :ok
)

echo [KLAIDA] Spausdinimas nepavyko. Atidaryk sablonas.btw ir patikrink duomenų šaltinį.
pause
exit /b 1

:ok
echo Baigta.
timeout /t 2 >nul
`;

const SPAUSDINTI_PS1 = `# Sandėlio lipdukas — BarTender
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$btw = Join-Path $PSScriptRoot "sablonas.btw"
$csv = Join-Path $PSScriptRoot "duomenys.csv"
$xml = Join-Path $PSScriptRoot "uzduotis.xml"

if (-not (Test-Path $btw)) {
  Write-Host "Nerastas sablonas.btw" -ForegroundColor Red
  Read-Host "Enter"
  exit 1
}

$copiesInput = Read-Host "Kiek identisku lipduku spausdinti? [1]"
$copies = if ([string]::IsNullOrWhiteSpace($copiesInput)) { 1 } else { [int]$copiesInput }

$btPaths = @(
  "C:\\Program Files\\Seagull\\BarTender Suite\\bartend.exe",
  "C:\\Program Files\\Seagull\\BarTender 2016\\BarTend.exe",
  "C:\\Program Files (x86)\\Seagull\\BarTender Suite\\bartend.exe"
)
$bt = $btPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $bt) {
  Write-Host "BarTender nerastas." -ForegroundColor Red
  Read-Host "Enter"
  exit 1
}

Write-Host "Spausdinama: $btw (kopijos: $copies)"

if (Test-Path $csv) {
  & $bt "/F=$btw" "/D=$csv" "/C=$copies" /P /X
  if ($LASTEXITCODE -eq 0) { exit 0 }
}

if (Test-Path $xml) {
  & $bt "/XMLScript=$xml" /X
  if ($LASTEXITCODE -eq 0) { exit 0 }
}

Write-Host "Nepavyko. Patikrink sablona BarTender." -ForegroundColor Red
Read-Host "Enter"
`;

const READ_ME = `SANDĖLIO LIPDUKAI — BarTender + QR
===================================

KAS ČIA YRA
-----------
Šiame ZIP yra du skirtingi spausdinimai:

  1. LIPDUKAS (90×60 mm) — spausdinamas per BarTender iš sablonas.btw
     Rodo: užsakymo kodą, objektą, kiekį, atvykimo datą.
     QR KODO ANT ŠIO LIPDUKO NĖRA — per mažas formatas.

  2. QR LAPAS (qr.pdf) — A4 formatas, didelis QR kodas puslapio centre
     Atidaryk qr.pdf ir atspausdink įprastu A4 popieriumi (1 lapas).
     Iškirpk QR dalį arba priklijuok visą lapą prie paletės / dėžės.
     Nuskenuojant telefonu — atsidaro užsakymo informacija sandėlyje.


A. VIENKARTINIS SETUP (BarTender Designer)
------------------------------------------
Atlik vieną kartą, kol šablonas paruoštas. Vėliau pakartoti nereikia.

  1. Atidaryk sablonas.btw BarTender Designer programoje.

  2. Kiekvienam teksto laukui nustatyk duomenų šaltinį:
     Dešiniu pelės klavišu ant teksto → Properties → Data Source → Named SubString

  3. Susiek laukus pagal šią lentelę (pavadinimai turi sutapti TIKSLIAI):

     | Kas rodoma lipduke      | Named SubString pavadinimas |
     |-------------------------|-----------------------------|
     | Užsakymo kodas          | Kodas                       |
     | Objektas / projektas    | Objektas                    |
     | Kiek dėžių / palečių    | Kiek deziu paleciu          |
     | Atvykimo data           | atvykimo data               |

  4. Jei lipduke buvo QR kodas — PAŠALINK jį iš šablono.
     QR spausdinamas atskirai iš qr.pdf (žr. skyrių B).

  5. (Alternatyva) Vietoj Named SubString gali naudoti CSV:
     Database → Text File → pasirink duomenys.csv (skyriklis: kabliataškis ;)

  6. Išsaugok sablonas.btw tame pačiame aplanke kaip ir kiti ZIP failai.


B. KASDIENINIS DARBAS
---------------------
Kiekvienam naujam užsakymui:

  1. WMS sistemoje atsisiųsk ZIP failą ir išarchyvuok į aplanką
     (pvz. Darbalaukis\\lipdukas-ABC123).

  2. LIPDUKAMS: dukart spustelėk spausdinti.bat
     → įvesk kiek identiškų lipdukų reikia → spausdina automatiškai.

  3. QR KODUI: atidaryk qr.pdf ir atspausdink į A4 (1 ar daugiau kopijų).
     Priklijuok prie paletės ar dėžės — QR didelis, lengvai nuskenuojamas.


FAILAI ŠIAME APLANKE
--------------------
  sablonas.btw   — BarTender šablonas (90×60 mm, be QR)
  duomenys.csv   — šio užsakymo duomenys (1 eilutė, kabliataškis)
  uzduotis.xml   — BarTender skriptas su įrašytais laukais
  qr.pdf         — QR kodas A4 lape (atskirai spausdinti ir priklijuoti)
  spausdinti.bat — paleidžia BarTender (rekomenduojama)
  spausdinti.ps1 — tas pats per PowerShell
  SKAITYK.txt    — šios instrukcijos
`;

export async function buildBarTenderZip(
  csv: string,
  label: OrderLabelData,
): Promise<Buffer> {
  const templatePath = path.join(
    process.cwd(),
    "public",
    "labels",
    "sablonas.btw",
  );
  const template = await readFile(templatePath);

  const qrPdf = await buildQrPdf(label);

  const zip = new JSZip();
  zip.file("sablonas.btw", template);
  zip.file("duomenys.csv", csv);
  zip.file("uzduotis.xml", buildBtxml(label, 1));
  zip.file("qr.pdf", qrPdf);
  zip.file("spausdinti.bat", SPAUSDINTI_BAT);
  zip.file("spausdinti.ps1", SPAUSDINTI_PS1);
  zip.file("SKAITYK.txt", READ_ME);

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  }) as Promise<Buffer>;
}

export function zipFileName(orderCode: string, orderId: string): string {
  const base = orderCode.trim() || orderId.slice(0, 8);
  return `lipdukai-${base}.zip`;
}
