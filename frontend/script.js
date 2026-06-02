let ctx = document.getElementById('gasChart')?.getContext('2d');
let maxDataPoints = 12;

let gasChart = ctx ? new Chart(ctx, {
  type: 'line',
  data: {
    labels: Array(maxDataPoints).fill(''),
    datasets: [
      {
        label: 'MQ-2 (H₂/CH₄)',
        data: Array(maxDataPoints).fill(1.0),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.04)',
        borderWidth: 3,
        tension: 0.35,
        fill: true,
        pointRadius: 2
      },
      {
        label: 'MQ-3 (Acetone)',
        data: Array(maxDataPoints).fill(1.0),
        borderColor: '#d946ef',
        backgroundColor: 'rgba(217, 70, 239, 0.04)',
        borderWidth: 3,
        tension: 0.35,
        fill: true,
        pointRadius: 2
      },
      {
        label: 'MQ-7 (CO)',
        data: Array(maxDataPoints).fill(1.0),
        borderColor: '#f43f5e',
        backgroundColor: 'rgba(244, 63, 94, 0.04)',
        borderWidth: 3,
        tension: 0.35,
        fill: true,
        pointRadius: 2
      },
      {
        label: 'MQ-135 (Ammonia)',
        data: Array(maxDataPoints).fill(1.0),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.04)',
        borderWidth: 3,
        tension: 0.35,
        fill: true,
        pointRadius: 2
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: '#faf9f6',
          font: { family: 'Outfit', size: 11, weight: 600 }
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.02)' },
        ticks: { color: '#a8a29e', font: { family: 'Outfit', size: 9 } }
      },
      y: {
        beginAtZero: false,
        min: 0.5,
        suggestedMax: 3.5,
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#a8a29e', font: { family: 'Outfit', size: 10 } },
        title: {
          display: true,
          text: 'Resistance Ratio (Rs/Ro)',
          color: '#a8a29e',
          font: { family: 'Outfit', size: 11, weight: 600 }
        }
      }
    }
  }
}) : null;

let latestData = null; // Store the latest fetched data


async function fetchData() {
  try {
    const response = await fetch("http://10.238.149.66:5000/data", {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    const data = await response.json();

    // Store the fetched data globally for the button to use
    latestData = data;

    // ── Sensor disconnected ──────────────────────────────────────
    if (data.error) {
      if (gasChart) {
        gasChart.data.labels = Array(maxDataPoints).fill('');
        gasChart.data.datasets.forEach(ds => ds.data = Array(maxDataPoints).fill(1.0));
        gasChart.update();
      }
      const stat = document.getElementById("sensorStatus");
      const btn = document.getElementById("detectBtn");
      if (stat) { stat.textContent = "Sensors Disconnected"; stat.className = "status-indicator status-disconnected"; }
      if (btn) {
        btn.disabled = true;
        btn.style.opacity = "0.4";
        btn.style.cursor = "not-allowed";
        btn.textContent = "Waiting for Sensors...";
      }
      return;
    }

    // ── Update sensor chart with dynamic sliding window ───────────
    if (gasChart) {
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      gasChart.data.labels.push(nowStr);
      gasChart.data.labels.shift();

      gasChart.data.datasets[0].data.push(data.values.mq2);
      gasChart.data.datasets[0].data.shift();

      gasChart.data.datasets[1].data.push(data.values.mq3);
      gasChart.data.datasets[1].data.shift();

      gasChart.data.datasets[2].data.push(data.values.mq7);
      gasChart.data.datasets[2].data.shift();

      gasChart.data.datasets[3].data.push(data.values.mq135);
      gasChart.data.datasets[3].data.shift();

      gasChart.update('none');
    }

    // ── Update metric value cards (graph.html) with both Ratio & PPM ──
    ['mq2','mq3','mq7','mq135'].forEach(id => {
      const el = document.getElementById(`${id}-value`);
      if (el) {
        const ratio = data.values[id];
        const ppm = data.values[`ppm_${id}`] || 0.00;
        el.innerHTML = `${ratio.toFixed(2)} <span style="font-size:0.85rem; color:var(--text-secondary); font-weight:500; display:block; margin-top:0.2rem;">${ppm.toFixed(2)} PPM</span>`;
      }
    });

    // ── Sensor status ────────────────────────────────────────────
    const stat = document.getElementById("sensorStatus");
    const btn = document.getElementById("startScanBtn");
    if (stat) { stat.textContent = "Sensors Connected"; stat.className = "status-indicator status-connected"; }
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
    }

    // (UI updates for predictions are now handled by the Guided Breathing Wizard below)

  } catch (error) {
    console.error("Error fetching data:", error);
    const stat = document.getElementById("sensorStatus");
    const btn = document.getElementById("startScanBtn");
    if (stat) { stat.textContent = "Connection Error — Is the server running?"; stat.className = "status-indicator status-error"; }
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = "0.35";
      btn.style.cursor = "not-allowed";
    }
  }
}

setInterval(fetchData, 3000);
fetchData(); // Run immediately on load

// ==========================================
// --- Breathing Wizard State Transitions ---
// ==========================================
function showStage(stageId) {
  document.querySelectorAll('.wizard-stage').forEach(el => el.style.display = 'none');
  const activeEl = document.getElementById(`stage-${stageId}`);
  if (activeEl) activeEl.style.display = 'block';

  // Update steps indicator styling
  document.querySelectorAll('.step-indicator').forEach(el => el.classList.remove('active-step'));
  
  if (stageId === 'calibration') {
    document.getElementById('step1-lbl')?.classList.add('active-step');
  } else if (stageId === 'inhale') {
    document.getElementById('step2-lbl')?.classList.add('active-step');
  } else if (stageId === 'exhale') {
    document.getElementById('step3-lbl')?.classList.add('active-step');
  } else if (stageId === 'processing') {
    document.getElementById('step4-lbl')?.classList.add('active-step');
  } else if (stageId === 'report') {
    document.getElementById('step5-lbl')?.classList.add('active-step');
  }
}

// Global scan triggers
const startScanBtn = document.getElementById("startScanBtn");
const resetWizardBtn = document.getElementById("resetWizardBtn");

if (startScanBtn) {
  startScanBtn.addEventListener("click", () => {
    // 1. Enter Stage 2: Deep Inhalation Coach (5s)
    showStage('inhale');
    let inhaleSecs = 5;
    const inhaleTimer = document.getElementById("inhaleTimer");
    if (inhaleTimer) inhaleTimer.innerHTML = `<span style="font-size:1.8rem; font-weight:700; color:var(--primary); display:block; margin-top:0.5rem;">${inhaleSecs}s</span>`;
    
    const inhaleInterval = setInterval(() => {
      inhaleSecs--;
      if (inhaleTimer) inhaleTimer.innerHTML = `<span style="font-size:1.8rem; font-weight:700; color:var(--primary); display:block; margin-top:0.5rem;">${inhaleSecs}s</span>`;
      
      if (inhaleSecs <= 0) {
        clearInterval(inhaleInterval);
        
        // 2. Transition to Stage 3: Controlled Exhalation Coach (10s)
        showStage('exhale');
        let exhaleSecs = 10;
        const exhaleTime = document.getElementById("exhaleTime");
        const exhaleProgress = document.getElementById("exhaleProgress");
        if (exhaleProgress) exhaleProgress.style.width = '100%';
        if (exhaleTime) exhaleTime.textContent = `${exhaleSecs}s remaining`;

        const exhaleInterval = setInterval(() => {
          exhaleSecs--;
          if (exhaleTime) exhaleTime.textContent = `${exhaleSecs}s remaining`;
          if (exhaleProgress) exhaleProgress.style.width = `${(exhaleSecs / 10) * 100}%`;
          
          if (exhaleSecs <= 0) {
            clearInterval(exhaleInterval);
            
            // 3. Transition to Stage 4: AI Feature Extraction Processing (2.5s)
            showStage('processing');
            
            setTimeout(() => {
              // 4. Transition to Stage 5: Final Report Analysis
              showStage('report');
              renderDiagnosticsReport();
            }, 2500);
          }
        }, 1000);
      }
    }, 1000);
  });
}

if (resetWizardBtn) {
  resetWizardBtn.addEventListener("click", () => {
    // Clear clinical recommendations card if any exists
    const existingRec = document.querySelector(".recommendation-card");
    if (existingRec) existingRec.remove();
    
    // Clear health flags UI list
    const flagsEl = document.getElementById("flags");
    if (flagsEl) flagsEl.innerHTML = "<span style='color: var(--text-secondary);'>No flags detected yet...</span>";

    showStage('calibration');
  });
}

function renderDiagnosticsReport() {
  if (!latestData || latestData.error) {
    alert("Error: Active sensor connection lost during scanning session.");
    showStage('calibration');
    return;
  }

  const pred = document.getElementById("prediction");
  const box = document.getElementById("resultBox");
  const flagsEl = document.getElementById("flags");

  // Render Results Box
  if (latestData.status === "healthy") {
    pred.textContent = "No Disease Detected";
    box.className = "result-box result-healthy";
    if (box.querySelector('.result-icon')) box.querySelector('.result-icon').textContent = "✅";
  } else if (latestData.status === "alert") {
    pred.textContent = latestData.prediction;
    box.className = "result-box result-alert";
    if (box.querySelector('.result-icon')) box.querySelector('.result-icon').textContent = "⚠️";
  }

  // Render Flags List
  if (flagsEl) {
    if (latestData.flags && latestData.flags.length > 0) {
      flagsEl.innerHTML = "";
      latestData.flags.forEach(flag => {
        const span = document.createElement("span");
        span.className = "flag-item";
        span.textContent = flag;
        flagsEl.appendChild(span);
      });
    } else {
      flagsEl.innerHTML = "<span style='color:var(--text-secondary)'>No abnormalities detected — breath looks healthy!</span>";
    }
  }

  // Append Dynamic Clinical Recommendation Card
  const wizardPanel = document.getElementById("wizardPanel");
  if (wizardPanel) {
    // Remove old recommendation card first
    const oldRec = wizardPanel.querySelector(".recommendation-card");
    if (oldRec) oldRec.remove();
    
    const recHTML = getClinicalRecommendation(latestData.prediction, latestData.flags);
    if (recHTML) {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = recHTML;
      wizardPanel.querySelector("#stage-report").appendChild(tempDiv.firstElementChild);
    }
  }

  // Save to Firebase history if toggle is checked
  const autoSave = document.getElementById("autoSaveToggle");
  if (autoSave && autoSave.checked && window.dbService) {
    const record = {
      status: latestData.status,
      prediction: latestData.prediction,
      flags: latestData.flags || [],
      values: {
        mq2: latestData.values.mq2,
        mq3: latestData.values.mq3,
        mq7: latestData.values.mq7,
        mq135: latestData.values.mq135,
        ppm_mq2: latestData.values.ppm_mq2 || 0.00,
        ppm_mq3: latestData.values.ppm_mq3 || 0.00,
        ppm_mq7: latestData.values.ppm_mq7 || 0.00,
        ppm_mq135: latestData.values.ppm_mq135 || 0.00
      }
    };
    
    const cloudLabel = document.getElementById("cloudStatusLabel");
    cloudLabel.innerHTML = `⏳ Saving to history...`;
    
    window.dbService.saveRecord(record)
      .then(() => {
        console.log("[AirInsight Sync] Breath analysis saved to history!");
        cloudLabel.innerHTML = `<span style="color:var(--success)">✓ Saved to history</span>`;
        setTimeout(() => {
          updateCloudToggleState(window.authService?.getCurrentUser());
        }, 3000);
      })
      .catch(err => {
        console.error("Error saving to history:", err);
        cloudLabel.innerHTML = `<span style="color:var(--error)">Error saving: ${err.message}</span>`;
        setTimeout(() => {
          updateCloudToggleState(window.authService?.getCurrentUser());
        }, 4000);
      });
  }
}

// Research-Backed Clinical Guidance Generator
function getClinicalRecommendation(prediction, flags) {
  let recHTML = '';
  if (prediction === 'Diabetes') {
    recHTML = `
      <div class="recommendation-card">
        <div class="recommendation-title">🩺 Clinical Guidance: Acetone Elevation</div>
        <p style="color:var(--text-secondary); margin-bottom:0.4rem; text-align:left;">Exhaled Acetone is a recognized metabolic biomarker associated with ketosis and cellular glucose deprivation (diabetes). We recommend the following screening steps:</p>
        <ul style="color:var(--text-secondary); padding-left:1.2rem; font-size:0.85rem; text-align:left; line-height:1.5;">
          <li>Consult your primary physician or endocrinologist for a standard Fasting Blood Glucose and HbA1c laboratory test.</li>
          <li>Review carbohydrates profile in daily food intake and ensure proper systemic hydration.</li>
          <li>If experiencing extreme fatigue, nausea, or rapid/deep breathing, seek immediate professional medical evaluation.</li>
        </ul>
      </div>
    `;
  } else if (prediction === 'Chronic Kidney Disease') {
    recHTML = `
      <div class="recommendation-card">
        <div class="recommendation-title">🩺 Clinical Guidance: Ammonia Spike</div>
        <p style="color:var(--text-secondary); margin-bottom:0.4rem; text-align:left;">Exhaled Ammonia (NH₃) elevations are closely correlated with impaired renal glomerular filtration and uremic pathways. We suggest:</p>
        <ul style="color:var(--text-secondary); padding-left:1.2rem; font-size:0.85rem; text-align:left; line-height:1.5;">
          <li>Request a nephrology evaluation to review Kidney Function parameters (BUN - Blood Urea Nitrogen, Serum Creatinine, and eGFR).</li>
          <li>Reduce sodium and high-density protein intake under professional nutritionist medical guidance.</li>
          <li>Keep daily logs of blood pressure readings.</li>
        </ul>
      </div>
    `;
  } else if (prediction === 'COPD' || prediction === 'Asthma') {
    recHTML = `
      <div class="recommendation-card">
        <div class="recommendation-title">🩺 Clinical Guidance: Respiratory Pathway Alert</div>
        <p style="color:var(--text-secondary); margin-bottom:0.4rem; text-align:left;">Elevated Carbon Monoxide (CO) or Nitric Oxide triggers indicate oxidative airway stress or active bronchial inflammation. Recommended next steps:</p>
        <ul style="color:var(--text-secondary); padding-left:1.2rem; font-size:0.85rem; text-align:left; line-height:1.5;">
          <li>Schedule a standard Pulmonary Function Test (PFT) or Spirometry study with a pulmonologist.</li>
          <li>Avoid atmospheric pollution, indoor chemical triggers, mold, and tobacco smoke.</li>
          <li>Discuss asthma control plans or regular inhalation controller medications with your doctor.</li>
        </ul>
      </div>
    `;
  } else if (prediction === 'Liver Cirrhosis') {
    recHTML = `
      <div class="recommendation-card">
        <div class="recommendation-title">🩺 Clinical Guidance: Hepatic Markers Elevated</div>
        <p style="color:var(--text-secondary); margin-bottom:0.4rem; text-align:left;">Conjoint spikes of exhaled Ammonia and volatile Acetaldehyde points to impaired hepatic detox and urea cycle block. We suggest:</p>
        <ul style="color:var(--text-secondary); padding-left:1.2rem; font-size:0.85rem; text-align:left; line-height:1.5;">
          <li>Request a gastroenterology or hepatology screening with basic Liver Function Tests (LFTs including ALT, AST, Bilirubin, and Albumin).</li>
          <li>Avoid hepatotoxic substances, excessive processed medications, and completely restrict alcohol consumption.</li>
        </ul>
      </div>
    `;
  } else if (prediction === 'Gastrointestinal Disease') {
    recHTML = `
      <div class="recommendation-card">
        <div class="recommendation-title">🩺 Clinical Guidance: Small Intestinal Gas Spike</div>
        <p style="color:var(--text-secondary); margin-bottom:0.4rem; text-align:left;">Elevated exhaled Hydrogen and Methane gases indicate excess bacterial fermentation in the upper digestive tract. Suggested steps:</p>
        <ul style="color:var(--text-secondary); padding-left:1.2rem; font-size:0.85rem; text-align:left; line-height:1.5;">
          <li>Consult a gastroenterologist to confirm SIBO (Small Intestinal Bacterial Overgrowth) using standard lactulose breath tests.</li>
          <li>Explore a temporary Low-FODMAP diet under dietary supervision to starve active intestinal dysbiosis.</li>
        </ul>
      </div>
    `;
  } else if (prediction === 'Lung Cancer') {
    recHTML = `
      <div class="recommendation-card" style="background:rgba(239,68,68,0.05); border-color:rgba(239,68,68,0.25);">
        <div class="recommendation-title" style="color:#fca5a5;">🩺 Clinical Guidance: VOC Biomarkers Detected</div>
        <p style="color:var(--text-secondary); margin-bottom:0.4rem; text-align:left;">Note: This electronic nose is a screening prototype and does NOT represent an official oncology diagnosis. Specific trace organic aldehydes were detected. We advise:</p>
        <ul style="color:var(--text-secondary); padding-left:1.2rem; font-size:0.85rem; text-align:left; line-height:1.5;">
          <li>Share these screening trends with your physician to review lung screening paths (such as a low-dose helical CT scan) if clinically indicated.</li>
          <li>Focus on active avoidance of carcinogenic environmental vapours, radon, and smoking.</li>
        </ul>
      </div>
    `;
  }
  return recHTML;
}

// ==========================================
// --- Firebase Integration (Auth & Sync) ---
// ==========================================

window.addEventListener('DOMContentLoaded', () => {
  // Small delay to allow firebase-config.js to load fully
  setTimeout(() => {
    if (window.authService) {
      window.authService.onAuthStateChanged((user) => {
        updateNavbarAuth(user);
        updateCloudToggleState(user);
      });
    }
  }, 100);
});

function updateNavbarAuth(user) {
  const navLinks = document.getElementById("navLinks");
  if (!navLinks) return;
  
  const existingBadge = document.getElementById("nav-auth-profile");
  if (existingBadge) existingBadge.remove();
  
  if (user) {
    const email = user.email || "User";
    const emailShort = email.length > 20 ? email.substring(0, 17) + "..." : email;
    
    const badge = document.createElement("div");
    badge.id = "nav-auth-profile";
    badge.style.cssText = `
      display: flex;
      align-items: center;
      gap: 0.8rem;
      margin-left: 1.5rem;
      padding-left: 1.5rem;
      border-left: 1px solid var(--border);
    `;
    badge.innerHTML = `
      <span style="font-size:0.85rem; color:var(--text-secondary);">${emailShort}</span>
      <button onclick="handleLogout()" style="background:transparent; border:1px solid rgba(239,68,68,0.4); color:#fca5a5; font-size:0.75rem; font-weight:600; padding:0.3rem 0.6rem; border-radius:4px; cursor:pointer; transition:all 0.2s;">Sign Out</button>
    `;
    navLinks.appendChild(badge);
  } else {
    const badge = document.createElement("div");
    badge.id = "nav-auth-profile";
    badge.style.cssText = `
      margin-left: 1.5rem;
      padding-left: 1.5rem;
      border-left: 1px solid var(--border);
    `;
    badge.innerHTML = `
      <a href="auth.html" style="padding: 0.4rem 1rem; background: linear-gradient(135deg, var(--primary), var(--secondary)); color:white; border-radius:6px; font-size:0.8rem; font-weight:600; text-decoration:none;">Sign In</a>
    `;
    navLinks.appendChild(badge);
  }
}

async function handleLogout() {
  if (window.authService) {
    await window.authService.logout();
    window.location.reload();
  }
}

function updateCloudToggleState(user) {
  const toggle = document.getElementById("autoSaveToggle");
  const slider = document.querySelector("#cloudSyncContainer .slider");
  const label = document.getElementById("cloudStatusLabel");
  
  if (!toggle) return; // Not on detection.html page
  
  if (user) {
    toggle.disabled = false;
    toggle.checked = true;
    if (slider) {
      slider.style.cursor = "pointer";
      slider.style.backgroundColor = "#475569";
    }
    const storageMode = window.firebaseConfigured ? "Cloud History" : "Local History";
    label.innerHTML = `<span style="color:var(--success)">●</span> Sync active: Saving to ${storageMode}`;
  } else {
    toggle.disabled = true;
    toggle.checked = false;
    if (slider) {
      slider.style.cursor = "not-allowed";
      slider.style.backgroundColor = "#1e293b";
    }
    label.innerHTML = `<a href="auth.html" style="color:var(--secondary); text-decoration:underline;">Sign in</a> to save test history`;
  }
}
