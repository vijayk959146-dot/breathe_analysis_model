#include <WiFi.h>
#include <HTTPClient.h>
#include "soc/soc.h"           // Disable brownout problems
#include "soc/rtc_cntl_reg.h"  // Disable brownout problems

// ==========================================
// CONFIGURATION
// ==========================================
const char* ssid = "vijayvivo";
const char* password = "123456789";
const char* serverName = "http://10.238.149.66:5000/sensor_data";

// MQ sensor pins (analog)
#define MQ2_PIN 35   // MQ-2 connected to GPIO 35
#define MQ3_PIN 32   // MQ-3 connected to GPIO 32
#define MQ7_PIN 33   // MQ-7 connected to GPIO 33
#define MQ135_PIN 34 // MQ-135 connected to GPIO 34

// Load resistance on sensor board (typically 10kΩ)
#define RL_VALUE 10.0

// ==========================================
// GLOBAL VARIABLES
// ==========================================
float Ro_mq2   = 1.0;
float Ro_mq3   = 1.0;
float Ro_mq7   = 1.0;
float Ro_mq135 = 1.0;

// ==========================================
// SENSOR FUNCTIONS (Optimized & Efficient)
// ==========================================

// Reads the sensor multiple times and averages to eliminate ESP32 ADC noise
float getStableResistance(int pin, int samples = 10) {
  float sum = 0;
  for (int i = 0; i < samples; i++) {
    int raw = analogRead(pin);
    if (raw == 0) raw = 1; // Prevent division by zero
    // Standard MQ Sensor Formula: Rs = RL * (V_in - V_out) / V_out
    // For 12-bit ADC (0-4095): Rs = RL * (4095 - raw) / raw
    float rs = RL_VALUE * (4095.0 - raw) / (float)raw;
    sum += rs;
    delay(5); // Small delay to let ADC stabilize
  }
  return sum / samples;
}

// Calibration takes longer to establish a solid baseline (Ro) in clean air
float calibrateSensor(int pin) {
  // Use 50 samples for highly accurate initial calibration
  return getStableResistance(pin, 50);
}

// ==========================================
// SETUP
// ==========================================
void setup() {
  // Disable brownout detector to prevent crash loops from power spikes
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

  Serial.begin(115200);
  delay(1000); 

  // Improve ADC stability
  analogSetAttenuation(ADC_11db); // Full range (0 - 3.3V)
  
  Serial.println("\n=== ESP32 Breath Sensor Starting ===");

  // Connect to WiFi
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(1000);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi Connected!");
    Serial.println("IP Address: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n❌ WiFi Failed! Check SSID/Password or Hotspot.");
  }

  // Sensor Warm-up
  Serial.println("\n--- Warming up sensors (10 seconds) ---");
  for (int i = 10; i > 0; i--) {
    Serial.print(String(i) + "... ");
    delay(1000);
  }
  Serial.println("\n");

  // Calibrate Ro (Clean Air Baseline)
  Serial.println("--- Calibrating Sensors (Keep in CLEAN AIR) ---");
  Ro_mq2   = calibrateSensor(MQ2_PIN);
  Ro_mq3   = calibrateSensor(MQ3_PIN);
  Ro_mq7   = calibrateSensor(MQ7_PIN);
  Ro_mq135 = calibrateSensor(MQ135_PIN);

  Serial.println("✅ Calibration done! Baseline established.\n");
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
  Serial.println("\n--- Reading Sensors ---");

  // Keep WiFi alive
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(2000);
    if (WiFi.status() != WL_CONNECTED) return; // Skip cycle if still disconnected
  }

  // 1. Get stable resistance readings (Rs)
  float Rs_mq2   = getStableResistance(MQ2_PIN, 15);
  float Rs_mq3   = getStableResistance(MQ3_PIN, 15);
  float Rs_mq7   = getStableResistance(MQ7_PIN, 15);
  float Rs_mq135 = getStableResistance(MQ135_PIN, 15);

  // 2. Calculate Gas Ratio (Ro / Rs)
  // Higher ratio = Higher gas concentration. Clean air = ~1.0
  float ratio_mq2   = Ro_mq2   / Rs_mq2;
  float ratio_mq3   = Ro_mq3   / Rs_mq3;
  float ratio_mq7   = Ro_mq7   / Rs_mq7;
  float ratio_mq135 = Ro_mq135 / Rs_mq135;

  // 3. Filter noise (Clamp between 0.9 and 15.0)
  ratio_mq2   = constrain(ratio_mq2,   0.9, 15.0);
  ratio_mq3   = constrain(ratio_mq3,   0.9, 15.0);
  ratio_mq7   = constrain(ratio_mq7,   0.9, 15.0);
  ratio_mq135 = constrain(ratio_mq135, 0.9, 15.0);

  Serial.printf("Ratios -> MQ-2: %.2f | MQ-3: %.2f | MQ-7: %.2f | MQ-135: %.2f\n", 
                ratio_mq2, ratio_mq3, ratio_mq7, ratio_mq135);

  // 4. Send to Server efficiently
  String jsonPayload = "{\"mq2\":" + String(ratio_mq2, 2) + 
                       ",\"mq3\":" + String(ratio_mq3, 2) + 
                       ",\"mq7\":" + String(ratio_mq7, 2) + 
                       ",\"mq135\":" + String(ratio_mq135, 2) + "}";

  // --- DEBUG: Raw TCP test ---
  String serverIP   = "10.238.149.66";
  const uint16_t port = 5000;
  WiFiClient tcpClient;
  Serial.print("[DEBUG] TCP to ");
  Serial.print(serverIP);
  Serial.print(":");
  Serial.print(port);
  Serial.print(" ... ");
  if (tcpClient.connect(serverIP.c_str(), port)) {
    Serial.println("SUCCESS");
    tcpClient.stop();
  } else {
    Serial.println("FAIL");
  }
  // ---------------------------

  HTTPClient http;
  http.begin(serverName);
  http.addHeader("Content-Type", "application/json");
  
  int httpResponseCode = http.POST(jsonPayload);
  if (httpResponseCode > 0) {
    Serial.println("✅ Data sent successfully: " + jsonPayload);
  } else {
    Serial.println("❌ HTTP Error: " + String(httpResponseCode));
  }
  
  http.end();
  delay(3000); // Wait 3 seconds before next reading
}