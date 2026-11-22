; Instalador de Hymns STT para Windows (NSIS). Se compila desde macOS/Linux/Windows con:
;   makensis -DVERSION=0.1.0 packaging/installer.nsi
; Modo ANSI a proposito: makensis 3.13 de Homebrew en macOS falla (bad_alloc) en modo Unicode,
; y el idioma Spanish de MUI2 exige Unicode. Por eso la interfaz del instalador va en ingles.
; (En Windows se puede cambiar a "Unicode true" + MUI_LANGUAGE "Spanish".)
Unicode false
!include "MUI2.nsh"
!include "x64.nsh"

!ifndef VERSION
  !define VERSION "0.1.0"
!endif

Name "Hymns STT"
OutFile "..\dist\HymnsSTT-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\Hymns STT"
InstallDirRegKey HKCU "Software\HymnsSTT" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!define MUI_ABORTWARNING
!define MUI_ICON "icons\icon.ico"
!define MUI_UNICON "icons\icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\hymns-stt.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Run Hymns STT"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Instalar"
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Hymns STT requires 64-bit Windows."
    Abort
  ${EndIf}
  SetRegView 64

  ; Cierra una instancia en ejecucion para poder reemplazar el .exe (actualizaciones)
  nsExec::Exec 'taskkill /F /IM hymns-stt.exe'

  SetOutPath "$INSTDIR"
  File "..\dist\hymns-stt.exe"
!ifdef VCREDIST
  ; Runtime de Visual C++ (solo si el equipo no la tiene)
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${If} $0 != 1
    SetOutPath "$PLUGINSDIR"
    File "/oname=vc_redist.x64.exe" "${VCREDIST}"
    ExecWait '"$PLUGINSDIR\vc_redist.x64.exe" /install /quiet /norestart'
  ${EndIf}
!endif

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\HymnsSTT" "InstallDir" "$INSTDIR"

  CreateDirectory "$SMPROGRAMS\Hymns STT"
  CreateShortcut "$SMPROGRAMS\Hymns STT\Hymns STT.lnk" "$INSTDIR\hymns-stt.exe"
  CreateShortcut "$SMPROGRAMS\Hymns STT\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\Hymns STT.lnk" "$INSTDIR\hymns-stt.exe"

  ; Entrada en "Aplicaciones instaladas"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HymnsSTT" "DisplayName" "Hymns STT"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HymnsSTT" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HymnsSTT" "Publisher" "Hymns"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HymnsSTT" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HymnsSTT" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HymnsSTT" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HymnsSTT" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetRegView 64
  nsExec::Exec 'taskkill /F /IM hymns-stt.exe'
  Delete "$INSTDIR\hymns-stt.exe"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\Hymns STT\Hymns STT.lnk"
  Delete "$SMPROGRAMS\Hymns STT\Uninstall.lnk"
  RMDir "$SMPROGRAMS\Hymns STT"
  Delete "$DESKTOP\Hymns STT.lnk"
  DeleteRegKey HKCU "Software\HymnsSTT"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HymnsSTT"
  ; El modelo descargado (%APPDATA%\hymns\HymnsSTT) se conserva a proposito: pesa ~670 MB.
SectionEnd
