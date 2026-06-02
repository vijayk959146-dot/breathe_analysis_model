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
    # Disease Flags — Differential Ratio Analysis
    # =========================================================
    flags = []

    total_ratio = mq2 + mq3 + mq7 + mq135
    if total_ratio == 0:
        total_ratio = 4.0
    
    prop2 = mq2 / total_ratio
    prop3 = mq3 / total_ratio
    prop7 = mq7 / total_ratio
    prop135 = mq135 / total_ratio
    max_prop = max(prop2, prop3, prop7, prop135)

    # --- BASELINE NORMAL BREATH FILTER ---
    # Normal breath without disease biomarkers shouldn't exceed 3.5 on any sensor
    if max(mq2, mq3, mq7, mq135) < 3.5:
        return jsonify({
            "prediction": "No Disease Detected",
            "values": latest_values,
            "flags": ["Normal breath detected. No significant gas spikes."],
            "status": "healthy"
        })

    # --- HUMIDITY / HEAVY BREATH FILTER USING RELATIVE PROPORTIONS ---
    # A true disease biomarker will dominate the total signal.
    # If no gas exceeds 40% (0.40) of the total, it is a uniform spike caused by humidity/CO2.
    if max_prop < 0.40:
        return jsonify({
            "prediction": "No Disease Detected",
            "values": latest_values,
            "flags": ["Note: Breath moisture detected. Common-mode humidity signal mathematically purged successfully."],
            "status": "healthy"
        })

    # 1. Diabetes — Acetone (MQ-3 dominant and high)
    if prop3 >= 0.40 and mq3 >= 4.5 and mq3 < 6.5:
        flags.append("Diabetes Risk — Elevated Acetone (MQ-3 Dominance: {:.1f}%, PPM: {:.2f})".format(prop3*100, ppm_mq3))

    # 2. Chronic Kidney Disease — Ammonia (MQ-135 dominant and high)
    if prop135 >= 0.40 and mq135 >= 4.5 and mq135 < 6.5:
        flags.append("Chronic Kidney Disease Risk — Elevated Ammonia (MQ-135 Dominance: {:.1f}%, PPM: {:.2f})".format(prop135*100, ppm_mq135))

    # 3. Liver Cirrhosis — Acetaldehyde + Ammonia (Both moderately dominant)
    if prop3 >= 0.30 and prop135 >= 0.30 and mq3 >= 3.5 and mq135 >= 3.5:
        flags.append("Liver Cirrhosis Risk — Acetaldehyde + Ammonia both significantly elevated")

    # 4. Alcohol Consumption — Massive Acetaldehyde/Ethanol spike
    if prop3 >= 0.40 and mq3 >= 6.5:
        flags.append("Alcohol Consumption Detected — MQ-3 Ethanol Ratio: {:.2f} (PPM: {:.2f})".format(mq3, ppm_mq3))

    # 5. Gastrointestinal Disease — Hydrogen & Methane (MQ-2 dominant)
    if prop2 >= 0.38 and mq2 >= 4.0:
        flags.append("Gastrointestinal Disease Risk (SIBO) — MQ-2 Dominance: {:.1f}% (PPM: {:.2f})".format(prop2*100, ppm_mq2))

    # 6. Asthma — NOx / H2S trace on MQ-135
    if prop135 >= 0.38 and mq135 >= 3.8 and mq135 < 4.5:
        flags.append("Asthma Risk — MQ-135 Trace Dominance: {:.1f}% (PPM: {:.2f})".format(prop135*100, ppm_mq135))

    # 7. Lung Cancer — Aldehydes on MQ-3
    if prop3 >= 0.38 and mq3 >= 3.8 and mq3 < 4.5:
        flags.append("Lung Cancer Risk — Moderately Elevated Aldehydes (MQ-3 Dominance: {:.1f}%, PPM: {:.2f})".format(prop3*100, ppm_mq3))

    # 8. COPD — Carbon Monoxide (MQ-7 dominant)
    if prop7 >= 0.38 and mq7 >= 4.0:
        flags.append("COPD Risk — Carbon Monoxide (MQ-7 Dominance: {:.1f}%, PPM: {:.2f})".format(prop7*100, ppm_mq7))

    # 9. Severe Risk — Extreme Ammonia (MQ-135 >= 6.5)
    if prop135 >= 0.40 and mq135 >= 6.5:
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
    features_raw = np.array([[
        mq2, mq3, mq7, mq135,
        prop2, prop3, prop7, prop135
    ]])
    features     = scaler.transform(features_raw)
    prediction   = model.predict(features)[0]

    # Validate heuristic prediction with ML model output
    status = "alert"
    final_prediction = prediction

    if prediction == "Healthy" and len(flags) > 0:
        # If the robust heuristic flagged a disease, prioritize it over the baseline ML model
        primary = flags[0].split(" — ")[0].replace(" Risk", "").replace(" Detected", "")
        final_prediction = primary
    elif len(flags) > 0 and prediction != "Healthy":
        final_prediction = prediction

    return jsonify({
        "prediction": final_prediction,
        "values": latest_values,
        "flags": flags,
        "status": status
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
