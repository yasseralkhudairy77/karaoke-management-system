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
export const LOCAL_TV_BRIDGE_URL = "http://192.168.1.4:3030/tv-command";
export const LOCAL_TV_BRIDGE_ENABLED = true;

/*
  Developer/testing helper.
  Enable short sessions only while testing physical TV/session automation.
*/
export const DEV_SHORT_SESSION_ENABLED = true;
export const DEV_MIN_SESSION_MINUTES = 1;
