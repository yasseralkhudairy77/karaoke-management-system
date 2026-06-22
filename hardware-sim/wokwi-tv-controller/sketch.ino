/*
  Karaoke Management System — Wokwi ESP32 TV Device Simulator
  Fase 7A-1.5

  Simulates a TV controller device. LED = TV power status.
  Commands via Serial Monitor: power_on, power_off, test
*/

#define TV_STATUS_LED_PIN 2
#define BLINK_INTERVAL_MS 300
#define BLINK_COUNT 6

const char* TV_DEVICE_ID = "TV-WOKWI-001";
const char* ROOM_ID = "ROOM-001";

enum TvState {
  TV_OFF,
  TV_ON,
  TV_TESTING
};

TvState tvState = TV_OFF;
unsigned long lastBlinkToggle = 0;
bool ledOn = false;
int blinkRemaining = 0;

void setLed(bool on) {
  digitalWrite(TV_STATUS_LED_PIN, on ? HIGH : LOW);
  ledOn = on;
}

void printHelp() {
  Serial.println("Commands:");
  Serial.println("  power_on");
  Serial.println("  power_off");
  Serial.println("  test");
  Serial.println("  tv_action=power_on");
  Serial.println("  {\"tv_action\":\"test\",\"tv_device_id\":\"TV-001\",\"room_id\":\"ROOM-001\"}");
  Serial.println("  status");
  Serial.println("  help");
}

void printStatus() {
  Serial.println("--- TV Controller Status ---");
  Serial.print("tv_device_id: ");
  Serial.println(TV_DEVICE_ID);
  Serial.print("room_id: ");
  Serial.println(ROOM_ID);
  Serial.print("tv_action: ");
  if (tvState == TV_ON) {
    Serial.println("power_on");
  } else if (tvState == TV_OFF) {
    Serial.println("power_off");
  } else {
    Serial.println("test");
  }
  Serial.print("led: ");
  Serial.println(ledOn ? "ON" : "OFF");
  Serial.println("----------------------------");
}

void printSuccessResponse(const char* tvAction) {
  Serial.print("{\"ok\":true,\"success\":true,\"message\":\"Perintah TV berhasil dikirim.\",\"tv_action\":\"");
  Serial.print(tvAction);
  Serial.print("\",\"data\":{\"room_id\":\"");
  Serial.print(ROOM_ID);
  Serial.print("\",\"tv_device_id\":\"");
  Serial.print(TV_DEVICE_ID);
  Serial.println("\",\"result\":\"sent\"}}");
}

void printErrorResponse() {
  Serial.println("{\"ok\":false,\"success\":false,\"message\":\"Perintah TV gagal dikirim.\",\"block_reason\":\"TV_ACTION_INVALID\"}");
}

String extractTvAction(const String& rawCommand) {
  String cmd = rawCommand;
  cmd.trim();

  if (cmd.length() == 0) {
    return "";
  }

  if (cmd.startsWith("{")) {
    int actionIndex = cmd.indexOf("tv_action");
    if (actionIndex < 0) {
      return "";
    }

    int colonIndex = cmd.indexOf(':', actionIndex);
    int quoteStart = cmd.indexOf('"', colonIndex);
    int quoteEnd = cmd.indexOf('"', quoteStart + 1);

    if (quoteStart >= 0 && quoteEnd > quoteStart) {
      return cmd.substring(quoteStart + 1, quoteEnd);
    }

    return "";
  }

  if (cmd.indexOf("tv_action") >= 0) {
    int equalIndex = cmd.indexOf('=');
    if (equalIndex < 0) {
      return "";
    }

    String action = cmd.substring(equalIndex + 1);
    action.trim();
    action.replace("\"", "");
    return action;
  }

  return cmd;
}

void handleCommand(const String& rawCommand) {
  String cmd = rawCommand;
  cmd.trim();
  cmd.toLowerCase();

  if (cmd.length() == 0) {
    return;
  }

  if (cmd == "help") {
    printHelp();
    return;
  }

  if (cmd == "status") {
    printStatus();
    return;
  }

  String tvAction = extractTvAction(cmd);
  tvAction.trim();
  tvAction.toLowerCase();

  if (tvAction == "power_on") {
    tvState = TV_ON;
    blinkRemaining = 0;
    setLed(true);
    printSuccessResponse("power_on");
    printStatus();
    return;
  }

  if (tvAction == "power_off") {
    tvState = TV_OFF;
    blinkRemaining = 0;
    setLed(false);
    printSuccessResponse("power_off");
    printStatus();
    return;
  }

  if (tvAction == "test") {
    tvState = TV_TESTING;
    blinkRemaining = BLINK_COUNT;
    lastBlinkToggle = millis();
    setLed(true);
    printSuccessResponse("test");
    Serial.println("LED blink test started...");
    return;
  }

  printErrorResponse();
}

void setup() {
  Serial.begin(115200);
  pinMode(TV_STATUS_LED_PIN, OUTPUT);
  setLed(false);

  delay(500);
  Serial.println();
  Serial.println("Karaoke TV Controller Simulator (Wokwi ESP32)");
  Serial.print("tv_device_id: ");
  Serial.println(TV_DEVICE_ID);
  Serial.print("room_id: ");
  Serial.println(ROOM_ID);
  Serial.println("Type: power_on | power_off | test | status | help");
}

void loop() {
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    handleCommand(line);
  }

  if (tvState == TV_TESTING && blinkRemaining > 0) {
    if (millis() - lastBlinkToggle >= BLINK_INTERVAL_MS) {
      lastBlinkToggle = millis();
      setLed(!ledOn);
      blinkRemaining--;

      if (blinkRemaining <= 0) {
        tvState = TV_OFF;
        setLed(false);
        Serial.println("LED blink test completed.");
        printStatus();
      }
    }
  }
}