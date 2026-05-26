from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from sklearn.preprocessing import MinMaxScaler
import pickle

# =============================================================================
# Training Dataset — Rs/Ro Resistance Ratios
# Based on: Scientific literature on MQ sensor arrays + breath biomarker research
#
# Features: [MQ-2 (H2/CH4), MQ-3 (Acetone/Acetaldehyde), MQ-7 (CO), MQ-135 (Ammonia/NOx)]
# Ratio = 1.00 → clean air baseline (Ro)
# Ratio > 1.00 → gas present (higher = more gas)
#
# Diseases detectable by this sensor array:
#   1.  Healthy               – All ratios ~1.00 (baseline)
#   2.  Diabetes              – MQ-3 high (acetone from ketosis)
#   3.  Chronic Kidney Disease– MQ-135 high (exhaled ammonia)
#   4.  Liver Cirrhosis       – MQ-3 + MQ-135 elevated (acetaldehyde + ammonia)
#   5.  Alcohol Consumption   – MQ-3 very high (acetaldehyde fingerprint)
#   6.  Gastrointestinal      – MQ-2 high (hydrogen & methane from gut bacteria)
#   7.  Asthma                – MQ-135 mildly elevated (exhaled NO / hydrogen sulfide)
#   8.  Lung Cancer           – MQ-3 moderately elevated (aldehydes & isoprene)
#   9.  Alzheimer             – MQ-3 slightly elevated (aldehydes, lower than cancer)
#   10. COPD                  – MQ-7 high (carbon monoxide from oxidative stress)
# =============================================================================

X = [
    # 1. Healthy (ratio ~1.0-3.0 to absorb 100% humidity & heat of normal breath)
    [1.00, 1.00, 1.00, 1.00],
    [2.80, 2.50, 2.10, 2.90],
    [1.50, 2.80, 2.30, 2.70],
    [2.90, 1.90, 2.80, 2.20],
    [2.10, 2.90, 2.50, 1.80],
    [2.50, 2.20, 2.90, 2.80],

    # 2. Diabetes (MQ-3 Acetone: 4.50–6.00)
    [2.10, 4.80, 2.20, 2.10],
    [2.20, 5.20, 2.10, 2.00],
    [2.30, 5.80, 2.20, 2.30],
    [2.10, 4.60, 2.30, 2.10],
    [2.40, 5.50, 2.10, 2.20],

    # 3. Chronic Kidney Disease (MQ-135 Ammonia: 4.50–6.50)
    [2.10, 2.20, 2.10, 4.80],
    [2.20, 2.10, 2.20, 5.50],
    [2.30, 2.30, 2.10, 6.20],
    [2.10, 2.20, 2.30, 6.40],
    [2.20, 2.10, 2.10, 5.00],

    # 4. Liver Cirrhosis (MQ-3: 3.50-4.50 & MQ-135: 3.50-4.50)
    [2.20, 3.80, 2.10, 4.10],
    [2.10, 4.20, 2.20, 3.90],
    [2.30, 4.40, 2.10, 3.70],
    [2.10, 3.60, 2.20, 4.30],
    [2.20, 3.90, 2.30, 4.00],

    # 5. Alcohol Consumption (MQ-3 Acetaldehyde: 6.50–12.00)
    [2.10, 7.50, 2.20, 2.10],
    [2.20, 8.80, 2.10, 2.20],
    [2.30, 10.50, 2.30, 2.10],
    [2.10, 11.80, 2.10, 2.30],
    [2.20, 6.90, 2.20, 2.10],

    # 6. Gastrointestinal Diseases (MQ-2 H2/CH4: 4.00–7.00)
    [4.50, 2.20, 2.10, 2.20],
    [5.80, 2.10, 2.20, 2.10],
    [6.90, 2.30, 2.10, 2.30],
    [4.20, 2.10, 2.20, 2.10],
    [5.10, 2.20, 2.10, 2.20],

    # 7. Asthma (MQ-135 NO/H2S: 3.20–4.20)
    [2.10, 2.20, 2.10, 3.50],
    [2.20, 2.10, 2.20, 3.90],
    [2.30, 2.30, 2.10, 4.10],
    [2.10, 2.20, 2.30, 3.30],
    [2.20, 2.10, 2.20, 3.70],

    # 8. Lung Cancer (MQ-3 Aldehydes: 3.80–4.50)
    [2.10, 3.90, 2.20, 2.10],
    [2.20, 4.20, 2.10, 2.20],
    [2.30, 4.40, 2.30, 2.10],
    [2.10, 3.85, 2.10, 2.30],
    [2.20, 4.10, 2.20, 2.10],

    # 9. Alzheimer (MQ-3 Aldehydes: 3.10–3.60)
    [2.10, 3.20, 2.20, 2.10],
    [2.20, 3.40, 2.10, 2.20],
    [2.30, 3.50, 2.30, 2.10],
    [2.10, 3.15, 2.10, 2.30],
    [2.20, 3.30, 2.20, 2.10],

    # 10. COPD (MQ-7 CO: 4.00–7.00)
    [2.10, 2.20, 4.50, 2.10],
    [2.20, 2.10, 5.80, 2.20],
    [2.30, 2.30, 6.50, 2.10],
    [2.10, 2.20, 4.20, 2.30],
    [2.20, 2.10, 5.10, 2.20],
]

y = [
    "Healthy",                 "Healthy",                 "Healthy",                 "Healthy",                 "Healthy",                 "Healthy",
    "Diabetes",                "Diabetes",                "Diabetes",                "Diabetes",                "Diabetes",
    "Chronic Kidney Disease",  "Chronic Kidney Disease",  "Chronic Kidney Disease",  "Chronic Kidney Disease",  "Chronic Kidney Disease",
    "Liver Cirrhosis",         "Liver Cirrhosis",         "Liver Cirrhosis",         "Liver Cirrhosis",         "Liver Cirrhosis",
    "Alcohol Consumption",     "Alcohol Consumption",     "Alcohol Consumption",     "Alcohol Consumption",     "Alcohol Consumption",
    "Gastrointestinal Disease","Gastrointestinal Disease","Gastrointestinal Disease","Gastrointestinal Disease","Gastrointestinal Disease",
    "Asthma",                  "Asthma",                  "Asthma",                  "Asthma",                  "Asthma",
    "Lung Cancer",             "Lung Cancer",             "Lung Cancer",             "Lung Cancer",             "Lung Cancer",
    "Alzheimer",               "Alzheimer",               "Alzheimer",               "Alzheimer",               "Alzheimer",
    "COPD",                    "COPD",                    "COPD",                    "COPD",                    "COPD",
]

# =============================================================================
# Train / Test Split (80/20 as described in methodology)
# =============================================================================
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

# =============================================================================
# Step 2: Min-Max Normalization (Preprocessing)
# Scales all sensor features to [0, 1] so no single sensor dominates.
# IMPORTANT: Fit scaler ONLY on training data to prevent data leakage.
# =============================================================================
scaler = MinMaxScaler()
X_train_scaled = scaler.fit_transform(X_train)   # Learn min/max from train set
X_test_scaled  = scaler.transform(X_test)          # Apply same scale to test set

print("\n=== Min-Max Normalization Applied ===")
print("Feature ranges before scaling (first sample):", X_train[0])
print("Feature ranges after  scaling (first sample):", X_train_scaled[0].round(3))

# =============================================================================
# Step 3: Train Random Forest on normalized data
# =============================================================================
model = RandomForestClassifier(n_estimators=200, max_depth=None, random_state=42)
model.fit(X_train_scaled, y_train)

# Validation report on normalized test data
y_pred = model.predict(X_test_scaled)
print("\n=== Model Validation Report (with Min-Max Normalization) ===")
print(classification_report(y_test, y_pred, zero_division=0))

# =============================================================================
# Step 4: Save both the scaler and the model
# The scaler MUST be saved so the backend can normalize live sensor data
# using the exact same min/max values learned during training.
# =============================================================================
pickle.dump(scaler, open("models/scaler.pkl", "wb"))
print("Scaler saved to models/scaler.pkl")

pickle.dump(model, open("models/disease_model.pkl", "wb"))
print("Model saved to models/disease_model.pkl")
