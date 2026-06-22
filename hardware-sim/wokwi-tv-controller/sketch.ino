@'
const int TV_LED_PIN = 2;

String inputBuffer = "";

void setup() {
  Serial.begin(115200);
  pinMode(TV_LED_PIN, OUTPUT);
  digitalWrite(TV_LED_PIN, LOW);

  Serial.println("Karaoke TV Device Simulator Ready");
  Serial.println("Command tersedia:");
  Serial.println("- power_on");
  Serial.println("- power_off");
  Serial.println("- test");
  Serial.println("- tv_action=power_on");
  Serial.println("- {\"tv_action\":\"test\",\"tv_device_id\":\"TV-001\",\"room_id\":\"ROOM-001\"}");
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();

    if (c == '\n' || c == '\r') {
      if (inputBuffer.length() > 0) {
        handleCommand(inputBuffer);
        inputBuffer = "";
      }
    } else {
      inputBuffer += c;
    }
  }

  delay(10);
}

void handleCommand(String rawInput) {
  rawInput.trim();

  String action = extractAction(rawInput);

  if (action == "power_on") {
    digitalWrite(TV_LED_PIN, HIGH);
    sendSuccess("power_on", "Perintah TV ON berhasil dikirim.");
  }
  else if (action == "power_off") {
    digitalWrite(TV_LED_PIN, LOW);
    sendSuccess("power_off", "Perintah TV OFF berhasil dikirim.");
  }
  else if (action == "test") {
    blinkTest();
    sendSuccess("test", "Test command berhasil dikirim.");
  }
  else {
    sendFailed(rawInput, "Command tidak dikenal.");
  }
}

String extractAction(String input) {
  input.trim();

  // Format singkat: power_on / power_off / test
  if (input == "power_on" || input == "power_off" || input == "test") {
    return input;
  }

  // Format key-value: tv_action=power_on
  if (input.indexOf("tv_action=") >= 0) {
    int start = input.indexOf("tv_action=") + 10;
    String action = input.substring(start);
    action.trim();
    return action;
  }

  // Format JSON sederhana: {"tv_action":"test"}
  if (input.indexOf("\"tv_action\"") >= 0) {
    int keyIndex = input.indexOf("\"tv_action\"");
    int colonIndex = input.indexOf(":", keyIndex);
    int firstQuote = input.indexOf("\"", colonIndex + 1);
    int secondQuote = input.indexOf("\"", firstQuote + 1);

    if (firstQuote >= 0 && secondQuote > firstQuote) {
      String action = input.substring(firstQuote + 1, secondQuote);
      action.trim();
      return action;
    }
  }

  return "";
}

void blinkTest() {
  for (int i = 0; i < 6; i++) {
    digitalWrite(TV_LED_PIN, HIGH);
    delay(200);
    digitalWrite(TV_LED_PIN, LOW);
    delay(200);
  }
}

void sendSuccess(String action, String message) {
  Serial.print("{\"ok\":true,\"success\":true,\"message\":\"");
  Serial.print(message);
  Serial.print("\",\"data\":{\"tv_action\":\"");
  Serial.print(action);
  Serial.print("\",\"result\":\"sent\"}}");
  Serial.println();
}

void sendFailed(String rawInput, String message) {
  Serial.print("{\"ok\":false,\"success\":false,\"message\":\"");
  Serial.print(message);
  Serial.print("\",\"raw_input\":\"");
  Serial.print(rawInput);
  Serial.print("\"}");
  Serial.println();
}
'@ | Set-Content -Encoding UTF8 "hardware-sim\wokwi-tv-controller\sketch.ino"