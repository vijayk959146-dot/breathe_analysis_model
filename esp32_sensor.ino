#include <WiFi.h>
#include <HTTPClient.h>
#include "soc/soc.h"           // Disable brownout
#include "soc/rtc_cntl_reg.h"  // Disable brownout

const char* ssid       = "vijayvivo";
const char* password   = "123456789";
const char* serverName = "http://10.183.206.66:5000/sensor_data";

// MQ sensor pins (ESP32 ADC1 only — ADC2 conflicts with WiFi)
#define MQ2_PIN   35
#define MQ3_PIN   32
#define MQ7_PIN   33
#define MQ135_PIN 34

// ---- Baseline (Ro) in clean air ----
// We use a fixed safe baseline of 4095 * 0.6 = ~2457 (mid-range for clean air).
// This avoids bad auto-calibration when sensors are still cold.
// The ESP32 ADC reads 0-4095 for 0-3.3V.
float Base_mq2   = 2457.0f;
float Base_mq3   = 2457.0f;
float Base_mq7   = 2457.0f;
float Base_mq135 = 2457.0f;

// Reads and averages ADC samples
float getStableRaw(int pin, int samples = 20) {
  float sum = 0;
  for (int i = 0; i < samples; i++) {
    sum += analogRead(pin);
    delay(5);
  }
  return sum / samples;
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // Disable brownout

  Serial.begin(115200);
  delay(1000);

  // Full ADC range (0-3.3V)
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  analogSetAttenuation(ADC_ATTEN_DB_12);
#else
  analogSetAttenuation(ADC_ATTEN_DB_11);
#endif

  Serial.println("\n=== ESP32 Breath Sensor Starting ===");
  Serial.println("Server: " + String(serverName));

  // Connect WiFi
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(1000);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected!");
    Serial.print("ESP32 IP: "); Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi Failed! Check SSID/Password.");
  }

  // Sensor Warm-up (60 seconds for MQ sensors to stabilize)
  Serial.println("\n--- Warming up sensors 60 seconds (DO NOT BREATHE YET) ---");
  for (int i = 60; i > 0; i--) {
    if (i % 10 == 0) {
      float r2 = getStableRaw(MQ2_PIN, 5);
      float r3 = getStableRaw(MQ3_PIN, 5);
      float r7 = getStableRaw(MQ7_PIN, 5);
      float r135 = getStableRaw(MQ135_PIN, 5);
      Serial.printf("%ds remaining | RAW: MQ2=%.0f MQ3=%.0f MQ7=%.0f MQ135=%.0f\n",
                    i, r2, r3, r7, r135);
    }
    delay(1000);
  }
  Serial.println();

  // Auto-calibrate baseline AFTER proper warmup
  Serial.println("--- Calibrating Baseline in CLEAN AIR ---");
  Base_mq2   = getStableRaw(MQ2_PIN,   100);
  Base_mq3   = getStableRaw(MQ3_PIN,   100);
  Base_mq7   = getStableRaw(MQ7_PIN,   100);
  Base_mq135 = getStableRaw(MQ135_PIN, 100);

  // If any baseline is suspiciously low (< 500) or at max (4090+),
  // the sensor is likely disconnected — use safe default
  auto safeguard = [](float &base, const char* name) {
    if (base < 500.0f || base > 4090.0f) {
      Serial.printf("WARNING: %s baseline %.0f is invalid (sensor disconnected?). Using default 2457.\n", name, base);
      base = 2457.0f;
    }
  };
  safeguard(Base_mq2,   "MQ2");
  safeguard(Base_mq3,   "MQ3");
  safeguard(Base_mq7,   "MQ7");
  safeguard(Base_mq135, "MQ135");

  Serial.println("Calibration complete. Final Baselines:");
  Serial.printf("MQ2=%.0f  MQ3=%.0f  MQ7=%.0f  MQ135=%.0f\n\n",
                Base_mq2, Base_mq3, Base_mq7, Base_mq135);
}

void loop() {
  Serial.println("\n--- Reading Sensors ---");

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi lost. Reconnecting...");
    WiFi.reconnect();
    delay(3000);
    if (WiFi.status() != WL_CONNECTED) return;
  }

  // 1. Read raw ADC
  float raw_mq2   = getStableRaw(MQ2_PIN);
  float raw_mq3   = getStableRaw(MQ3_PIN);
  float raw_mq7   = getStableRaw(MQ7_PIN);
  float raw_mq135 = getStableRaw(MQ135_PIN);

  Serial.printf("RAW ADC  -> MQ2:%.0f  MQ3:%.0f  MQ7:%.0f  MQ135:%.0f\n",
                raw_mq2, raw_mq3, raw_mq7, raw_mq135);

  // 2. Ratio = Raw / Baseline  (clean air = 1.0)
  float ratio_mq2   = raw_mq2   / Base_mq2;
  float ratio_mq3   = raw_mq3   / Base_mq3;
  float ratio_mq7   = raw_mq7   / Base_mq7;
  float ratio_mq135 = raw_mq135 / Base_mq135;

  // 3. Clamp to reasonable range — max 20.0 to detect extreme readings
  ratio_mq2   = constrain(ratio_mq2,   0.0f, 20.0f);
  ratio_mq3   = constrain(ratio_mq3,   0.0f, 20.0f);
  ratio_mq7   = constrain(ratio_mq7,   0.0f, 20.0f);
  ratio_mq135 = constrain(ratio_mq135, 0.0f, 20.0f);

  Serial.printf("RATIOS   -> MQ2:%.2f  MQ3:%.2f  MQ7:%.2f  MQ135:%.2f\n",
                ratio_mq2, ratio_mq3, ratio_mq7, ratio_mq135);

  // 4. Build JSON payload
  String jsonPayload = "{\"mq2\":"    + String(ratio_mq2,   2) +
                       ",\"mq3\":"   + String(ratio_mq3,   2) +
                       ",\"mq7\":"   + String(ratio_mq7,   2) +
                       ",\"mq135\":" + String(ratio_mq135, 2) + "}";

  // 5. POST to Flask backend
  HTTPClient http;
  http.begin(serverName);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(jsonPayload);
  if (code > 0) {
    Serial.println("Sent OK -> " + jsonPayload);
  } else {
    Serial.println("HTTP Error: " + String(code));
  }
  http.end();

  delay(3000);
}