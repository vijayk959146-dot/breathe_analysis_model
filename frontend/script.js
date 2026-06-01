let ctx = document.getElementById('gasChart')?.getContext('2d');
let gasChart = ctx ? new Chart(ctx, {
  type: 'bar',
  data: {
    labels: ['MQ-2 (H2/CH4)','MQ-3 (Acetone)','MQ-7 (CO)','MQ-135 (Ammonia)'],
    datasets: [{
      label: 'Resistance Ratio (Rs/Ro)',
      data: [0,0,0,0],
      backgroundColor: [
        'rgba(245, 158, 11, 0.8)',  /* Sunburnt Golden Amber */
        'rgba(217, 70, 239, 0.8)',  /* Electric Violet/Fuchsia */
        'rgba(244, 63, 94, 0.8)',   /* Sunset Coral Rose */
        'rgba(16, 185, 129, 0.8)'   /* Mint Emerald Jade */
      ],
      borderColor: [
        '#f59e0b', '#d946ef', '#f43f5e', '#10b981'
      ],
      borderWidth: 2,
      borderRadius: 8
    }]
  },
  options: {
    indexAxis: 'y',  // Make the bar chart horizontal
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } } }
  }
}) : null;

let latestData = null; // Store the latest fetched data


async function fetchData() {
  try {
    const response = await fetch("http://10.183.206.66:5000/data", {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    const data = await response.json();

    // Store the fetched data globally for the button to use
    latestData = data;

    // ── Sensor disconnected ──────────────────────────────────────
    if (data.error) {
      if (gasChart) {
        gasChart.data.datasets[0].data = [0,0,0,0];
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

    // ── Update sensor chart ──────────────────────────────────────
    if (gasChart) {
      gasChart.data.datasets[0].data = [
        data.values.mq2, data.values.mq3, data.values.mq7, data.values.mq135
      ];
      gasChart.update();
    }

    // ── Update metric value cards (graph.html) ───────────────────
    ['mq2','mq3','mq7','mq135'].forEach(id => {
      const el = document.getElementById(`${id}-value`);
      if (el) el.textContent = data.values[id].toFixed(2);
    });

    // ── Sensor status ────────────────────────────────────────────
    const stat = document.getElementById("sensorStatus");
    const btn = document.getElementById("detectBtn");
    if (stat) { stat.textContent = "Sensors Connected"; stat.className = "status-indicator status-connected"; }
    if (btn && btn.textContent !== "Analyzing Breath Sample...") {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
      if (btn.textContent === "Waiting for Sensors...") btn.textContent = "Analyze Breath Sample";
    }

    // (UI updates for predictions are now handled by the Detect button event listener below)

  } catch (error) {
    console.error("Error fetching data:", error);
    const stat = document.getElementById("sensorStatus");
    const btn = document.getElementById("detectBtn");
    if (stat) { stat.textContent = "Connection Error — Is the server running?"; stat.style.color = "orange"; }
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = "0.4";
      btn.style.cursor = "not-allowed";
    }
  }
}

setInterval(fetchData, 3000);
fetchData(); // Run immediately on load

// ── Manual Detect Button Logic ─────────────────────────────────
const detectBtn = document.getElementById("detectBtn");
if (detectBtn) {
  detectBtn.addEventListener("click", () => {
    // Check if we have valid data from the ESP32
    if (!latestData || latestData.error) {
      alert("Cannot analyze: No active sensor data. Please ensure ESP32 is connected.");
      return;
    }

    const btn = document.getElementById("detectBtn");
    const pred = document.getElementById("prediction");
    const box = document.getElementById("resultBox");
    const flagsEl = document.getElementById("flags");

    // UI Loading State
    btn.textContent = "Analyzing Breath Sample...";
    btn.disabled = true;
    btn.style.opacity = "0.7";
    box.className = "result-box result-waiting";
    if (box.querySelector('.result-icon')) box.querySelector('.result-icon').textContent = "⏳";
    pred.textContent = "Running ML model...";

    // Simulate processing time
    setTimeout(() => {
      // Restore Button State
      btn.textContent = "Analyze Again";
      btn.disabled = false;
      btn.style.opacity = "1";

      // Render Results
      if (latestData.status === "healthy") {
        pred.textContent = "No Disease Detected";
        box.className = "result-box result-healthy";
        if (box.querySelector('.result-icon')) box.querySelector('.result-icon').textContent = "✅";
      } else if (latestData.status === "alert") {
        pred.textContent = latestData.prediction;
        box.className = "result-box result-alert";
        if (box.querySelector('.result-icon')) box.querySelector('.result-icon').textContent = "⚠️";
      }

      // Render Flags
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
            mq135: latestData.values.mq135
          }
        };
        
        const cloudLabel = document.getElementById("cloudStatusLabel");
        const originalHTML = cloudLabel.innerHTML;
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
    }, 1500); // 1.5 second analysis delay
  });
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
