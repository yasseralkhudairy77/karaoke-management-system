/*
  Frontend API configuration.

  Fill this value with the deployed Google Apps Script Web App URL.
  Example:
  "https://script.google.com/macros/s/AKfycbzYoO2LkCAG0fUBKMjAv7uI9RkANiW795Dj_DdlFO4omvW3Btt3MEEI7kW8bOgg1ve1/exec"

  If this value is empty, the dashboard automatically uses mock data.
*/

export const API_BASE_URL = "https://script.google.com/macros/s/AKfycbxbAL-pQ0hwE5iTEmZ14Po83p4YFMGP8Cj117H7_Dx9YNPcUDOkJhR3vnb76j102fQ/exec";

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
