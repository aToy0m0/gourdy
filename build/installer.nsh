; Keep user documents/history, but remove BYOK secrets on a real uninstall.
; An installer upgrade invokes the old uninstaller with /updated: keep keys then.
!ifndef GOURDY_CREDENTIAL_DIR
  !define GOURDY_CREDENTIAL_DIR "$APPDATA\local-dictation-streaming\credentials"
!endif
!macro GourdyDeleteCredentials
  Delete "${GOURDY_CREDENTIAL_DIR}\openai.key"
  Delete "${GOURDY_CREDENTIAL_DIR}\gemini.key"
  Delete "${GOURDY_CREDENTIAL_DIR}\openai.key.tmp"
  Delete "${GOURDY_CREDENTIAL_DIR}\gemini.key.tmp"
  !insertmacro GourdyCheckRemoved "openai.key"
  !insertmacro GourdyCheckRemoved "gemini.key"
  !insertmacro GourdyCheckRemoved "openai.key.tmp"
  !insertmacro GourdyCheckRemoved "gemini.key.tmp"
  RMDir "${GOURDY_CREDENTIAL_DIR}"
!macroend
!macro GourdyCheckRemoved name
  IfFileExists "${GOURDY_CREDENTIAL_DIR}\${name}" 0 +3
    MessageBox MB_OK|MB_ICONSTOP "Gourdyの保存APIキーを削除できませんでした。ファイルのアクセス権を確認してから、アンインストールをやり直してください。" /SD IDOK
    Abort
!macroend
!macro customUnInstall
  ${ifNot} ${isUpdated}
    !insertmacro GourdyDeleteCredentials
  ${endIf}
!macroend
