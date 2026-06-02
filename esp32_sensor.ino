#include <WiFi.h>
#include <HTTPClient.h>
#include "soc/soc.h"           // Disable brownout
#include "soc/rtc_cntl_reg.h"  // Disable brownout

const char* ssid       = "BOOK5_VIJAYAK 3238";
const char* password   = "39Kt33&8";
const char* serverName = "http://192.168.137.1:5000/sensor_data";

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

  // Explicitly set sensor pins as inputs
  pinMode(MQ2_PIN, INPUT);
  pinMode(MQ3_PIN, INPUT);
  pinMode(MQ7_PIN, INPUT);
  pinMode(MQ135_PIN, INPUT);

  // Full ADC range (0-3.3V)
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  analogSetAttenuation(ADC_ATTEN_DB_12);
#else
  analogSetAttenuation(ADC_ATTEN_DB_11);
#endif

  Serial.println("\n=== ESP32 Breath Sensor Starting ===");
  Serial.println("Server: " + String(serverName));

  // Connect WiFi with watchdog
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
    Serial.println("\nWiFi Connected successfully!");
    Serial.print("ESP32 IP: "); Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWARNING: WiFi initial connection timed out. Will attempt background reconnection in loop().");
  }

  // Sensor Warm-up (60 seconds for MQ sensors to stabilize)
  Serial.println("\n--- Warming up sensors 60 seconds (DO NOT BREATHE ON SENSORS YET) ---");
  for (int i = 60; i > 0; i--) {
    if (i % 10 == 0) {
      float r2 = getStableRaw(MQ2_PIN, 5);
      float r3 = getStableRaw(MQ3_PIN, 5);
      float r7 = getStableRaw(MQ7_PIN, 5);
      float r135 = getStableRaw(MQ135_PIN, 5);
      
      // Warn if sensors are reading extremely low values (< 200), likely disconnected
      if (r2 < 200 || r3 < 200 || r7 < 200 || r135 < 200) {
        Serial.println("  [DIAGNOSTIC WARNING]: Suspiciously low raw ADC values. Verify sensor connections.");
      }
      
      Serial.printf("  Warmup: %ds remaining | RAW ADC -> MQ2:%.0f MQ3:%.0f MQ7:%.0f MQ135:%.0f\n",
                    i, r2, r3, r7, r135);
    }
    delay(1000);
  }
  Serial.println();

  // Auto-calibrate baseline AFTER proper warmup
  Serial.println("=== Calibrating Baselines in CLEAN AIR (Do not blow) ===");
  delay(1000);
  Base_mq2   = getStableRaw(MQ2_PIN,   100);
  Base_mq3   = getStableRaw(MQ3_PIN,   100);
  Base_mq7   = getStableRaw(MQ7_PIN,   100);
  Base_mq135 = getStableRaw(MQ135_PIN, 100);

  // If any baseline is suspiciously low (< 500) or at max (4090+),
  // the sensor is likely disconnected — use safe default
  auto safeguard = [](float &base, const char* name) {
    if (base < 500.0f || base > 4090.0f) {
      Serial.printf("  [SAFEGUARD]: %s baseline %.0f is invalid (sensor disconnected?). Using default 2457.\n", name, base);
      base = 2457.0f;
    }
  };
  safeguard(Base_mq2,   "MQ2");
  safeguard(Base_mq3,   "MQ3");
  safeguard(Base_mq7,   "MQ7");
  safeguard(Base_mq135, "MQ135");

  Serial.println("Baseline calibration complete!");
  Serial.printf("Final Ro Baselines -> MQ2:%.0f  MQ3:%.0f  MQ7:%.0f  MQ135:%.0f\n",
                Base_mq2, Base_mq3, Base_mq7, Base_mq135);
  Serial.println("=========================================================");
  Serial.println("SYSTEM READY: Take a breath scan on your web dashboard.");
  Serial.println("=========================================================\n");
}

bool inCoachingSession = false;

void loop() {
  // 1. Maintain WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI WATCHDOG]: Connection lost! Reconnecting...");
    WiFi.disconnect();
    WiFi.begin(ssid, password);
    int retries = 0;
    while (WiFi.status() != WL_CONNECTED && retries < 5) {
      delay(1000);
      Serial.print(".");
      retries++;
    }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\nWiFi Reconnected!");
    } else {
      Serial.println("\nWiFi Reconnection deferred. Operating offline.");
    }
  }

  // 2. Read live sensor values
  float raw_mq2   = getStableRaw(MQ2_PIN);
  float raw_mq3   = getStableRaw(MQ3_PIN);
  float raw_mq7   = getStableRaw(MQ7_PIN);
  float raw_mq135 = getStableRaw(MQ135_PIN);

  // Calculate Ratios (Rs/Ro equivalent: Raw / Baseline)
  float ratio_mq2   = raw_mq2   / Base_mq2;
  float ratio_mq3   = raw_mq3   / Base_mq3;
  float ratio_mq7   = raw_mq7   / Base_mq7;
  float ratio_mq135 = raw_mq135 / Base_mq135;

  // Clamp to reasonable ranges [0.0, 20.0]
  ratio_mq2   = constrain(ratio_mq2,   0.0f, 20.0f);
  ratio_mq3   = constrain(ratio_mq3,   0.0f, 20.0f);
  ratio_mq7   = constrain(ratio_mq7,   0.0f, 20.0f);
  ratio_mq135 = constrain(ratio_mq135, 0.0f, 20.0f);

  // 3. Automated Breath Coach Trigger
  // A standard breath blow triggers a noticeable spike (e.g. Ratio > 1.25) on MQ-3/MQ-135/MQ-2
  bool isBlowing = (ratio_mq2 > 1.25 || ratio_mq3 > 1.25 || ratio_mq135 > 1.25);
  
  if (isBlowing && !inCoachingSession) {
    inCoachingSession = true;
    Serial.println("\n=========================================================");
    Serial.println("  [BREATH COACH]: Breath detected! Starting capture... ");
    Serial.println("  ==> INHALE DEEPLY & EXHALE SLOWLY & STEADILY ONTO SENSORS");
    Serial.println("=========================================================");
    
    // 8-second countdown for stabilized breathing exposure
    for (int countdown = 8; countdown > 0; countdown--) {
      Serial.printf("  [Capturing Peak Biomarkers]: %ds remaining...\n", countdown);
      delay(1000);
    }
    
    // Take final peak samples
    raw_mq2   = getStableRaw(MQ2_PIN);
    raw_mq3   = getStableRaw(MQ3_PIN);
    raw_mq7   = getStableRaw(MQ7_PIN);
    raw_mq135 = getStableRaw(MQ135_PIN);
    
    ratio_mq2   = constrain(raw_mq2   / Base_mq2,   0.0f, 20.0f);
    ratio_mq3   = constrain(raw_mq3   / Base_mq3,   0.0f, 20.0f);
    ratio_mq7   = constrain(raw_mq7   / Base_mq7,   0.0f, 20.0f);
    ratio_mq135 = constrain(raw_mq135 / Base_mq135, 0.0f, 20.0f);

    Serial.println("\n  [BREATH COACH]: Capture complete! Sending peak data to server.");
    Serial.println("  ==> Please step back from the device to allow sensors to purge.\n");
  } else if (!isBlowing && inCoachingSession) {
    // Reset coaching session when sensors drop back near baseline
    inCoachingSession = false;
    Serial.println("  [BREATH COACH]: Sensors purged. Ready for next breath scan.");
  }

  // 4. Output values to serial
  Serial.printf("LIVE RATIOS -> MQ2:%.2f  MQ3:%.2f  MQ7:%.2f  MQ135:%.2f\n",
                ratio_mq2, ratio_mq3, ratio_mq7, ratio_mq135);

  // 5. Build and send JSON payload if connected
  if (WiFi.status() == WL_CONNECTED) {
    String jsonPayload = "{\"mq2\":"    + String(ratio_mq2,   2) +
                         ",\"mq3\":"   + String(ratio_mq3,   2) +
                         ",\"mq7\":"   + String(ratio_mq7,   2) +
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
    int code = http.POST(jsonPayload);
    if (code > 0) {
      Serial.println("  Data streamed -> " + jsonPayload);
    } else {
      Serial.println("  HTTP Error: " + String(code));
    }
    http.end();
  }

  // Check every 3 seconds
  delay(3000);
}