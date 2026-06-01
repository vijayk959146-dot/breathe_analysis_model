import numpy as np
import random
import pickle
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from sklearn.preprocessing import MinMaxScaler

# Set random seeds for reproducibility
random.seed(42)
np.random.seed(42)

# =============================================================================
# Feature Engineering Function
# Extracts both raw ratios AND relative proportions to isolate individual sensor spikes
# from common-mode breath humidity and baseline drift.
# =============================================================================
def extract_features(raw_ratios):
    mq2, mq3, mq7, mq135 = raw_ratios
    total = mq2 + mq3 + mq7 + mq135
    if total == 0:
        total = 4.0
    return [
        mq2, mq3, mq7, mq135,                # Raw Ratios
        mq2 / total, mq3 / total,            # Relative Proportions
        mq7 / total, mq135 / total
    ]

# =============================================================================
# Expanded Synthetic Dataset Generation (250 Samples)
# Incorporates baseline noise, common-mode humidity spikes, and clinical VOC levels.
# =============================================================================
X_raw = []
y = []

# 1. Healthy (all sensors rise moderately due to breath humidity, balanced relative ratios)
for _ in range(25):
    base_level = random.uniform(1.0, 2.9)
    mq2   = base_level + random.uniform(-0.3, 0.3)
    mq3   = base_level + random.uniform(-0.3, 0.3)
    mq7   = base_level + random.uniform(-0.3, 0.3)
    mq135 = base_level + random.uniform(-0.3, 0.3)
    X_raw.append([max(1.0, mq2), max(1.0, mq3), max(1.0, mq7), max(1.0, mq135)])
    y.append("Healthy")

# 2. Diabetes (MQ-3 Acetone high, 4.5–6.0)
for _ in range(25):
    mq2   = random.uniform(1.2, 2.4)
    mq3   = random.uniform(4.5, 6.0)
    mq7   = random.uniform(1.2, 2.4)
    mq135 = random.uniform(1.2, 2.4)
    X_raw.append([mq2, mq3, mq7, mq135])
    y.append("Diabetes")

# 3. Chronic Kidney Disease (MQ-135 Ammonia high, 4.5–6.5)
for _ in range(25):
    mq2   = random.uniform(1.2, 2.4)
    mq3   = random.uniform(1.2, 2.4)
    mq7   = random.uniform(1.2, 2.4)
    mq135 = random.uniform(4.5, 6.5)
    X_raw.append([mq2, mq3, mq7, mq135])
    y.append("Chronic Kidney Disease")

# 4. Liver Cirrhosis (MQ-3 Acetaldehyde & MQ-135 Ammonia both elevated: 3.5–4.5)
for _ in range(25):
    mq2   = random.uniform(1.2, 2.4)
    mq3   = random.uniform(3.5, 4.5)
    mq7   = random.uniform(1.2, 2.4)
    mq135 = random.uniform(3.5, 4.5)
    X_raw.append([mq2, mq3, mq7, mq135])
    y.append("Liver Cirrhosis")

# 5. Alcohol Consumption (MQ-3 Ethanol very high, 6.5–12.0)
for _ in range(25):
    mq2   = random.uniform(1.2, 2.4)
    mq3   = random.uniform(6.5, 12.0)
    mq7   = random.uniform(1.2, 2.4)
    mq135 = random.uniform(1.2, 2.4)
    X_raw.append([mq2, mq3, mq7, mq135])
    y.append("Alcohol Consumption")

# 6. Gastrointestinal Disease (MQ-2 Methane/H2 high, 4.0–7.0)
for _ in range(25):
    mq2   = random.uniform(4.0, 7.0)
    mq3   = random.uniform(1.2, 2.4)
    mq7   = random.uniform(1.2, 2.4)
    mq135 = random.uniform(1.2, 2.4)
    X_raw.append([mq2, mq3, mq7, mq135])
    y.append("Gastrointestinal Disease")

# 7. Asthma (MQ-135 Nitric Oxide mildly elevated, 3.2–4.2)
for _ in range(25):
    mq2   = random.uniform(1.2, 2.4)
    mq3   = random.uniform(1.2, 2.4)
    mq7   = random.uniform(1.2, 2.4)
    mq135 = random.uniform(3.2, 4.2)
    X_raw.append([mq2, mq3, mq7, mq135])
    y.append("Asthma")

# 8. Lung Cancer (MQ-3 Aldehydes moderately elevated, 3.8–4.5, with normal ammonia)
for _ in range(25):
    mq2   = random.uniform(1.2, 2.4)
    mq3   = random.uniform(3.8, 4.5)
    mq7   = random.uniform(1.2, 2.4)
    mq135 = random.uniform(1.2, 3.1)
    X_raw.append([mq2, mq3, mq7, mq135])
    y.append("Lung Cancer")

# 9. Alzheimer (MQ-3 Aldehydes slightly elevated, 3.1–3.6, with normal ammonia)
for _ in range(25):
    mq2   = random.uniform(1.2, 2.4)
    mq3   = random.uniform(3.1, 3.6)
    mq7   = random.uniform(1.2, 2.4)
    mq135 = random.uniform(1.2, 3.1)
    X_raw.append([mq2, mq3, mq7, mq135])
    y.append("Alzheimer")

# 10. COPD (MQ-7 Carbon Monoxide high, 4.0–7.0)
for _ in range(25):
    mq2   = random.uniform(1.2, 2.4)
    mq3   = random.uniform(1.2, 2.4)
    mq7   = random.uniform(4.0, 7.0)
    mq135 = random.uniform(1.2, 2.4)
    X_raw.append([mq2, mq3, mq7, mq135])
    y.append("COPD")

# =============================================================================
# Extract robust feature vectors (8 features per sample)
# =============================================================================
X = [extract_features(sample) for sample in X_raw]

# =============================================================================
# Train / Test Split (80/20 Stratified)
# =============================================================================
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

# =============================================================================
# Min-Max Normalization (Scales features to [0, 1])
# =============================================================================
scaler = MinMaxScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled  = scaler.transform(X_test)

print("\n=== Min-Max Normalization & Robust Feature Engineering ===")
print("Features count per sample:", len(X_train[0]))
print("First raw sample:", np.round(X_raw[0], 2))
print("First engineered features:", np.round(X_train[0], 2))
print("First scaled features:", np.round(X_train_scaled[0], 3))

# =============================================================================
# Train Random Forest Classifier
# =============================================================================
model = RandomForestClassifier(n_estimators=300, max_depth=None, random_state=42)
model.fit(X_train_scaled, y_train)

# Validation evaluation
y_pred = model.predict(X_test_scaled)
print("\n=== Robust Model Validation Report ===")
print(classification_report(y_test, y_pred, zero_division=0))

# =============================================================================
# Save both the scaler and the model
# =============================================================================
pickle.dump(scaler, open("models/scaler.pkl", "wb"))
print("Scaler saved successfully to models/scaler.pkl")

pickle.dump(model, open("models/disease_model.pkl", "wb"))
print("Model saved successfully to models/disease_model.pkl")
