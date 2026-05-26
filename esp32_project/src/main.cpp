#include <WiFi.h>
#include <HTTPClient.h>

// WiFi credentials - REPLACE WITH YOUR ACTUAL WIFI DETAILS
const char* ssid = "vijayvivo";          // e.g., "MyHomeWiFi"
const char* password = "123456789";  // e.g., "mypassword123"

// Server details - REPLACE WITH YOUR SERVER'S IP ADDRESS
// Find your PC's IP: Run 'ipconfig' in Command Prompt and use the IPv4 Address
const char* serverName = "http://172.20.10.14:5000/sensor_data";  // e.g., "http://192.168.1.100:5000/sensor_data"

// MQ sensor pins (analog and digital) - VERIFIED WITH BOARD WIRING
#define MQ2_PIN 35      // MQ-2 analog (AO) connected to GPIO 35
#define MQ2_DIGITAL 27  // MQ-2 digital (DO) connected to GPIO 27
#define MQ3_PIN 32      // MQ-3 analog (AO) connected to GPIO 32
#define MQ3_DIGITAL 12  // MQ-3 digital (DO) connected to GPIO 12
#define MQ7_PIN 33      // MQ-7 analog (AO) connected to GPIO 33
#define MQ7_DIGITAL 14  // MQ-7 digital (DO) connected to GPIO 14
#define MQ135_PIN 34    // MQ-135 analog (AO) connected to GPIO 34
#define MQ135_DIGITAL 13 // MQ-135 digital (DO) connected to GPIO 13

void setup() {
  Serial.begin(115200);
  delay(1000); // Give serial time to initialize
  Serial.println("\n=== ESP32 Breath Sensor Starting ===");

  // Configure digital pins as inputs for DO (Digital Output)
  pinMode(MQ2_DIGITAL, INPUT);
  pinMode(MQ3_DIGITAL, INPUT);
  pinMode(MQ7_DIGITAL, INPUT);
  pinMode(MQ135_DIGITAL, INPUT);

  // Check if pins are properly defined
  Serial.println("Sensor pins configured:");
  Serial.println("MQ-2: GPIO " + String(MQ2_PIN) + " (AO), GPIO " + String(MQ2_DIGITAL) + " (DO)");
  Serial.println("MQ-3: GPIO " + String(MQ3_PIN) + " (AO), GPIO " + String(MQ3_DIGITAL) + " (DO)");
  Serial.println("MQ-7: GPIO " + String(MQ7_PIN) + " (AO), GPIO " + String(MQ7_DIGITAL) + " (DO)");
  Serial.println("MQ-135: GPIO " + String(MQ135_PIN) + " (AO), GPIO " + String(MQ135_DIGITAL) + " (DO)");

  // Connect to WiFi
  Serial.println("\nConnecting to WiFi: " + String(ssid));
  WiFi.begin(ssid, password);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(1000);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi Connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("Gateway: ");
    Serial.println(WiFi.gatewayIP());
  } else {
    Serial.println("\n❌ WiFi Connection Failed!");
    Serial.println("Check your SSID and password");
    while (true) { // Stop here if WiFi fails
      delay(1000);
      Serial.println("Retrying WiFi...");
      WiFi.reconnect();
      if (WiFi.status() == WL_CONNECTED) break;
    }
  }

  Serial.println("Server URL: " + String(serverName));
  Serial.println("=== Setup Complete ===\n");
}

void loop() {
  Serial.println("\n--- Reading Sensors ---");

  // Check WiFi status
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ WiFi disconnected! Reconnecting...");
    WiFi.reconnect();
    delay(2000);
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("❌ Reconnection failed. Skipping this cycle.");
      delay(3000);
      return;
    }
    Serial.println("✅ WiFi reconnected!");
  }

  HTTPClient http;
  http.begin(serverName);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000); // 10 second timeout

  // Read sensor values with validation
  int mq2_raw = analogRead(MQ2_PIN);
  int mq2_digital = digitalRead(MQ2_DIGITAL);
  int mq3_raw = analogRead(MQ3_PIN);
  int mq3_digital = digitalRead(MQ3_DIGITAL);
  int mq7_raw = analogRead(MQ7_PIN);
  int mq7_digital = digitalRead(MQ7_DIGITAL);
  int mq135_raw = analogRead(MQ135_PIN);
  int mq135_digital = digitalRead(MQ135_DIGITAL);

  // Check for sensor reading errors (should be 0-4095)
  if (mq2_raw < 0 || mq2_raw > 4095 || mq3_raw < 0 || mq3_raw > 4095 ||
      mq7_raw < 0 || mq7_raw > 4095 || mq135_raw < 0 || mq135_raw > 4095) {
    Serial.println("❌ Invalid sensor readings detected!");
    http.end();
    delay(3000);
    return;
  }

  // Convert to approximate ppm
  float mq2 = mq2_raw * 0.1;
  float mq3 = mq3_raw * 0.05;
  float mq7 = mq7_raw * 0.02;
  float mq135 = mq135_raw * 0.01;

  Serial.println("Sensor values (approx ppm):");
  Serial.println("MQ-2: " + String(mq2) + " (Digital: " + String(mq2_digital) + ")");
  Serial.println("MQ-3: " + String(mq3) + " (Digital: " + String(mq3_digital) + ")");
  Serial.println("MQ-7: " + String(mq7) + " (Digital: " + String(mq7_digital) + ")");
  Serial.println("MQ-135: " + String(mq135) + " (Digital: " + String(mq135_digital) + ")");

  // Create JSON payload
  String jsonPayload = "{";
  jsonPayload += "\"mq2\":" + String(mq2) + ",";
  jsonPayload += "\"mq2_digital\":" + String(mq2_digital) + ",";
  jsonPayload += "\"mq3\":" + String(mq3) + ",";
  jsonPayload += "\"mq3_digital\":" + String(mq3_digital) + ",";
  jsonPayload += "\"mq7\":" + String(mq7) + ",";
  jsonPayload += "\"mq7_digital\":" + String(mq7_digital) + ",";
  jsonPayload += "\"mq135\":" + String(mq135) + ",";
  jsonPayload += "\"mq135_digital\":" + String(mq135_digital);
  jsonPayload += "}";

  Serial.println("Sending data to server...");
  int httpResponseCode = http.POST(jsonPayload);

  if (httpResponseCode > 0) {
    Serial.println("✅ Data sent successfully! Response code: " + String(httpResponseCode));
    String response = http.getString();
    Serial.println("Response: " + response);
  } else {
    Serial.println("❌ Failed to send data! Error code: " + String(httpResponseCode));
    Serial.println("Error: " + http.errorToString(httpResponseCode));
  }

  http.end();

  // Wait before next reading
  delay(3000); // 3 seconds
}