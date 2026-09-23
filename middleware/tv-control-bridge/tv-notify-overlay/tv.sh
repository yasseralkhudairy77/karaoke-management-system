#!/usr/bin/env bash
# Alat bantu uji overlay di TV ruangan (dipakai sesi 2026-09-23).
# Pemakaian: tv.sh <ruangan-ip> <perintah>
#   net        -> buka YouTube VOD biasa
#   ov T S N   -> kirim overlay: teks T, subteks S, detik N
#   hide       -> tutup overlay lebih awal
#   shot FILE  -> tangkapan layar langsung ke PC
#   log        -> 60 baris terakhir log aplikasi kita
# Contoh: tv.sh 192.168.1.104 ov "SISA WAKTU 15 MENIT" "Hubungi kasir untuk perpanjang" 20

set -u
ADB="C:/platform-tools/adb.exe"
IP="${1:?ip ruangan wajib}"
CMD="${2:?perintah wajib}"
D="-s ${IP}:5555"
PKG="com.happysong.tvnotify"

case "$CMD" in
  connect) "$ADB" connect "${IP}:5555" | tr -d '\r'; "$ADB" $D shell getprop ro.build.version.release | tr -d '\r' ;;
  net)     "$ADB" $D shell am start -a android.intent.action.VIEW -d "https://www.youtube.com/watch?v=kJQP7kiw5Fk" | tr -d '\r' ;;
  ov)      "$ADB" $D shell am start-foreground-service -n "$PKG/.OverlayService" \
             --es text "'${3:-SISA WAKTU 15 MENIT}'" \
             --es subtext "'${4:-Hubungi kasir untuk perpanjang}'" \
             --ei seconds "${5:-20}" | tr -d '\r' ;;
  hide)    "$ADB" $D shell am start-foreground-service -n "$PKG/.OverlayService" --es cmd hide | tr -d '\r' ;;
  shot)    "$ADB" $D exec-out screencap -p > "${3:-bukti/shot.png}" && echo "tersimpan: ${3:-bukti/shot.png}" ;;
  log)     "$ADB" $D logcat -d -s TvNotifyOverlay:I AndroidRuntime:E "*:S" 2>/dev/null | tail -60 | tr -d '\r' ;;
  logclr)  "$ADB" $D logcat -c ;;
  *)       echo "perintah tidak dikenal: $CMD" ;;
esac
