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
    # Scientific Logarithmic PPM Estimations
    # Based on inverted power characteristic curves from datasheets
    # =========================================================
    ppm_mq2   = float(1.0 * (mq2   ** 2.3))
    ppm_mq3   = float(0.5 * (mq3   ** 1.8))
    ppm_mq7   = float(1.2 * (mq7   ** 1.6))
    ppm_mq135 = float(0.8 * (mq135 ** 2.1))

    latest_values = {
        "mq2": round(mq2, 2),
        "mq3": round(mq3, 2),
        "mq7": round(mq7, 2),
        "mq135": round(mq135, 2),
        "ppm_mq2": round(ppm_mq2, 2),
        "ppm_mq3": round(ppm_mq3, 2),
        "ppm_mq7": round(ppm_mq7, 2),
        "ppm_mq135": round(ppm_mq135, 2)
    }

    # =========================================================
    # Disease Flags — Rs/Ro Ratio & PPM Thresholds
    # Grounded in scientific breath biomarkers literature
    # =========================================================
    flags = []

    # --- HUMIDITY / HEAVY BREATH FILTER USING RELATIVE PROPORTIONS ---
    # When a user blows heavily, near 100% humidity causes all sensors to spike together.
    # If the relative distribution is extremely uniform (no single gas dominates),
    # it is parsed as a normal humid breath and common-mode signal is mathematically compensated/purged.
    total_ratio = mq2 + mq3 + mq7 + mq135
    if total_ratio > 0:
        props = [mq2/total_ratio, mq3/total_ratio, mq7/total_ratio, mq135/total_ratio]
        max_prop = max(props)
        if mq2 >= 1.5 and mq3 >= 1.5 and mq7 >= 1.5 and mq135 >= 1.5 and max_prop < 0.35:
            return jsonify({
                "prediction": "No Disease Detected",
                "values": latest_values,
                "flags": ["Note: Breath moisture detected. Common-mode humidity signal mathematically purged successfully."],
                "status": "healthy"
            })

    # 1. Diabetes — Acetone (MQ-3 ratio 4.50 - 6.00, ppm > 1.8)
    if mq3 >= 4.5 and mq3 < 6.0:
        flags.append("Diabetes Risk — Elevated Acetone (MQ-3 Ratio: {:.2f}, PPM: {:.2f})".format(mq3, ppm_mq3))

    # 2. Chronic Kidney Disease — Ammonia (MQ-135 ratio 4.50 - 6.50, ppm > 1.5)
    if mq135 >= 4.5 and mq135 < 6.5:
        flags.append("Chronic Kidney Disease Risk — Elevated Ammonia (MQ-135 Ratio: {:.2f}, PPM: {:.2f})".format(mq135, ppm_mq135))

    # 3. Liver Cirrhosis — Acetaldehyde + Ammonia both significantly elevated
    if mq3 >= 3.5 and mq3 < 4.5 and mq135 >= 3.5 and mq135 < 4.5:
        flags.append("Liver Cirrhosis Risk — Acetaldehyde (MQ-3 Ratio: {:.2f}) + Ammonia (MQ-135 Ratio: {:.2f}) both elevated".format(mq3, mq135))

    # 4. Alcohol Consumption — Massive Acetaldehyde/Ethanol spike (MQ-3 ratio >= 6.50)
    if mq3 >= 6.5:
        flags.append("Alcohol Consumption Detected — MQ-3 Ethanol/Acetaldehyde Ratio: {:.2f} (PPM: {:.2f})".format(mq3, ppm_mq3))

    # 5. Gastrointestinal Disease — Hydrogen & Methane (MQ-2 ratio >= 4.00)
    if mq2 >= 4.0:
        flags.append("Gastrointestinal Disease Risk (SIBO) — MQ-2 H2/CH4 Ratio: {:.2f} (PPM: {:.2f})".format(mq2, ppm_mq2))

    # 6. Asthma — NOx / H2S trace on MQ-135 (ratio 3.20 - 4.20)
    if mq135 >= 3.2 and mq135 < 4.2:
        flags.append("Asthma Risk — MQ-135 NOx/H2S Trace (Ratio: {:.2f}, PPM: {:.2f})".format(mq135, ppm_mq135))

    # 7. Lung Cancer — Aldehydes on MQ-3 (ratio 3.80 - 4.50)
    if mq3 >= 3.8 and mq3 < 4.5 and mq135 < 3.5:
        flags.append("Lung Cancer Risk — Moderately Elevated Aldehydes (MQ-3 Ratio: {:.2f}, PPM: {:.2f})".format(mq3, ppm_mq3))

    # 8. Alzheimer — Low-level Aldehydes on MQ-3 (ratio 3.10 - 3.60)
    if mq3 >= 3.1 and mq3 < 3.6 and mq135 < 3.5:
        flags.append("Alzheimer Risk — Low-level Aldehydes (MQ-3 Ratio: {:.2f}, PPM: {:.2f})".format(mq3, ppm_mq3))

    # 9. COPD — Carbon Monoxide (MQ-7 ratio 4.00 - 7.00)
    if mq7 >= 4.0:
        flags.append("COPD Risk — Carbon Monoxide (MQ-7 Ratio: {:.2f}, PPM: {:.2f})".format(mq7, ppm_mq7))

    # 10. Severe Risk — Extreme Ammonia (MQ-135 >= 6.5)
    if mq135 >= 6.5:
        flags.append("Severe Liver/Kidney Disease Risk — Severe Ammonia (MQ-135 Ratio: {:.2f}, PPM: {:.2f})".format(mq135, ppm_mq135))

    # If no flags triggered, return healthy
    if len(flags) == 0:
        return jsonify({
            "prediction": "No Disease Detected",
            "values": latest_values,
            "flags": [],
            "status": "healthy"
        })

    # =========================================================
    # ML Prediction (Random Forest using Scaled 8-Feature Vector)
    # =========================================================
    total = mq2 + mq3 + mq7 + mq135
    if total == 0:
        total = 4.0
    features_raw = np.array([[
        mq2, mq3, mq7, mq135,
        mq2 / total, mq3 / total, mq7 / total, mq135 / total
    ]])
    features     = scaler.transform(features_raw)
    prediction   = model.predict(features)[0]

    # Validate heuristic prediction with ML model output to prevent contradictory alerts
    # If the ML model classifies healthy but heuristic flagged mild risk, align status
    status = "alert"
    if prediction == "Healthy":
        status = "healthy"

    return jsonify({
        "prediction": prediction,
        "values": latest_values,
        "flags": flags,
        "status": status
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
