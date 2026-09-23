/*
  Frontend API configuration.

  Fill this value with the deployed Google Apps Script Web App URL.
  Example:
  "https://script.google.com/macros/s/AKfycbzYoO2LkCAG0fUBKMjAv7uI9RkANiW795Dj_DdlFO4omvW3Btt3MEEI7kW8bOgg1ve1/exec"

  If this value is empty, the dashboard automatically uses mock data.
  When the dashboard is served from the local Node.js server
  (localhost / 127.0.0.1 / LAN IP), it automatically uses the local API
  on the same origin. GitHub Pages keeps using the Google Apps Script URL.
*/

const GOOGLE_APPS_SCRIPT_API_BASE_URL = "https://script.google.com/macros/s/AKfycbzjBoz2FvaRqTdsmdR-eYQBRvzPVqGV0lf-FPJlDgfFDQ0bxSWr8JVpgxICBwIkI7CK/exec";

function isLocalBackendHost(hostname) {
  return (
    hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || /^192\.168\.\d+\.\d+$/.test(hostname)
    || /^10\.\d+\.\d+\.\d+$/.test(hostname)
  );
}

const browserLocation = globalThis?.window?.location;

export const API_BASE_URL = (
  browserLocation
  && browserLocation.protocol.startsWith("http")
  && isLocalBackendHost(browserLocation.hostname)
)
  ? `${browserLocation.origin}/exec`
  : GOOGLE_APPS_SCRIPT_API_BASE_URL;

/*
  Local TV bridge configuration.

  This is called directly by the cashier browser on the local network.
  Keep empty to disable physical TV control from the dashboard.
*/
/*
  Alamat bridge TV = PC bridge (192.168.1.3, port 3030).
  Sebelumnya tertulis 192.168.1.4 yang tidak ada perangkatnya, sehingga setiap perintah TV
  dari dashboard kasir (nyalakan saat mulai, matikan saat waktu habis) tidak pernah sampai.
*/
/*
  Token bersama bridge <-> POS.
  SENGAJA TIDAK ditulis di berkas ini: repositori ini publik dan juga dipakai untuk
  GitHub Pages. Nilainya disuntikkan oleh server POS lewat /tv-bridge-config.js
  (variabel window.__TV_BRIDGE__) dari .env server, jadi token tidak pernah ikut terunggah.
  PENTING: deklarasi ini harus berada DI ATAS pemakaiannya, kalau tidak modul gagal dimuat
  dan seluruh dashboard (termasuk layar login) tidak akan muncul.
*/
const injectedTvBridge = (typeof window !== "undefined" && window.__TV_BRIDGE__) || {};

export const LOCAL_TV_BRIDGE_URL = String(
  injectedTvBridge.url || "http://192.168.1.3:3030/tv-command"
).trim();
export const LOCAL_TV_BRIDGE_ENABLED = true;

export const LOCAL_TV_BRIDGE_TOKEN = String(injectedTvBridge.token || "").trim();

/*
  Developer/testing helper.
  Enable short sessions only while testing physical TV/session automation.
*/
export const DEV_SHORT_SESSION_ENABLED = true;
export const DEV_MIN_SESSION_MINUTES = 1;
