from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import numpy as np
import time
import os

# Resolve paths relative to the project root (one level up from backend/)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

app = Flask(__name__)
CORS(app)

# Load trained ML model and MinMax scaler
model  = pickle.load(open(os.path.join(BASE_DIR, "models", "disease_model.pkl"), "rb"))
scaler = pickle.load(open(os.path.join(BASE_DIR, "models", "scaler.pkl"),        "rb"))

latest_data = None
last_sensor_time = None

@app.route('/sensor_data', methods=['POST'])
def receive_sensor_data():
    global latest_data, last_sensor_time
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Invalid or missing JSON payload"}), 400
        latest_data = data
        last_sensor_time = time.time()  # Record when data was received
        return jsonify({"status": "received"})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/reset', methods=['POST'])
def reset_data():
    global latest_data, last_sensor_time
    latest_data = None
    last_sensor_time = None
    return jsonify({"status": "data reset"})

@app.route('/data', methods=['GET'])
def get_prediction():
    global last_sensor_time
    
    # Check if we have recent sensor data (within last 30 seconds)
    if latest_data is None or last_sensor_time is None or (time.time() - last_sensor_time) > 30:
        return jsonify({
            "error": "No recent sensor data available", 
            "status": "disconnected",
            "message": "ESP32 sensors not connected or no recent data received"
        })
    
    try:
        mq2   = float(latest_data.get('mq2', 0))
        mq3   = float(latest_data.get('mq3', 0))
        mq7   = float(latest_data.get('mq7', 0))
        mq135 = float(latest_data.get('mq135', 0))
    except (TypeError, ValueError, AttributeError):
        return jsonify({
            "error": "Invalid sensor data format",
            "status": "error",
            "message": "Received data is corrupted or missing expected keys"
        })

    # =========================================================
    # Disease Flags — Rs/Ro Ratio Thresholds
    # All values are sensor resistance ratios (1.00 = clean air)
    # Based on: breath biomarker research + MQ sensor datasheets
    # =========================================================
    flags = []

    # --- HUMIDITY / HEAVY BREATH FILTER ---
    # When a user blows heavily, the ~100% humidity drops resistance across ALL sensors massively.
    # If all sensors spike roughly together, it is a normal wet breath, not a targeted disease biomarker.
    if mq2 >= 2.0 and mq3 >= 2.0 and mq7 >= 2.0 and mq135 >= 2.0:
        return jsonify({
            "prediction": "No Disease Detected (Heavy Breath)",
            "values": latest_data,
            "flags": ["Note: High overall sensor spike detected due to normal breath moisture."],
            "status": "healthy"
        })

    # 1. Diabetes — Acetone (MQ-3 ratio 4.50 - 6.00)
    if mq3 >= 4.5 and mq3 < 6.0:
        flags.append("Diabetes Risk — MQ-3 (Acetone) Ratio: {:.2f}".format(mq3))

    # 2. Chronic Kidney Disease — Ammonia (MQ-135 ratio 4.50 - 6.50)
    if mq135 >= 4.5 and mq135 < 6.5:
        flags.append("Chronic Kidney Disease Risk — MQ-135 (Ammonia) Ratio: {:.2f}".format(mq135))

    # 3. Liver Cirrhosis — Acetaldehyde + Ammonia both significantly elevated
    if mq3 >= 3.5 and mq3 < 4.5 and mq135 >= 3.5 and mq135 < 4.5:
        flags.append("Liver Cirrhosis Risk — Elevated Acetaldehyde (MQ-3: {:.2f}) + Ammonia (MQ-135: {:.2f})".format(mq3, mq135))

    # 4. Alcohol Consumption — Huge Acetaldehyde spike (MQ-3 ratio 6.50 - 12.00)
    if mq3 >= 6.5:
        flags.append("Alcohol Consumption Detected — MQ-3 (Acetaldehyde) Ratio: {:.2f}".format(mq3))

    # 5. Gastrointestinal Disease — Hydrogen & Methane (MQ-2 ratio 4.00 - 7.00)
    if mq2 >= 4.0:
        flags.append("Gastrointestinal Disease Risk — MQ-2 (H2/CH4) Ratio: {:.2f}".format(mq2))

    # 6. Asthma — NOx / H2S trace on MQ-135 (ratio 3.20 - 4.20)
    if mq135 >= 3.2 and mq135 < 4.2:
        flags.append("Asthma Risk — MQ-135 (NO/H2S) Ratio: {:.2f}".format(mq135))

    # 7. Lung Cancer — Aldehydes on MQ-3 (ratio 3.80 - 4.50)
    if mq3 >= 3.8 and mq3 < 4.5 and mq135 < 3.5:
        flags.append("Lung Cancer Risk — MQ-3 (Aldehydes) Ratio: {:.2f}".format(mq3))

    # 8. Alzheimer — Low-level Aldehydes on MQ-3 (ratio 3.10 - 3.60)
    if mq3 >= 3.1 and mq3 < 3.6 and mq135 < 3.5:
        flags.append("Alzheimer Risk — MQ-3 (Elevated Aldehydes) Ratio: {:.2f}".format(mq3))

    # 9. COPD — Carbon Monoxide (MQ-7 ratio 4.00 - 7.00)
    if mq7 >= 4.0:
        flags.append("COPD Risk — MQ-7 (CO) Ratio: {:.2f}".format(mq7))

    # 10. Severe Risk — Extreme Ammonia (MQ-135 > 6.5)
    if mq135 >= 6.5:
        flags.append("Severe Liver/Kidney Disease Risk — MQ-135 (Ammonia) Ratio: {:.2f}".format(mq135))

    # If no flags triggered, return healthy
    if len(flags) == 0:
        return jsonify({
            "prediction": "No Disease Detected",
            "values": latest_data,
            "flags": [],
            "status": "healthy"
        })

    # Normalize live data with the same scaler used during training
    features_raw = np.array([[mq2, mq3, mq7, mq135]])
    features     = scaler.transform(features_raw)
    prediction   = model.predict(features)[0]

    return jsonify({
        "prediction": prediction,
        "values": latest_data,
        "flags": flags,
        "status": "alert"
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
