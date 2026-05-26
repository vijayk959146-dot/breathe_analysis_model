let ctx = document.getElementById('gasChart')?.getContext('2d');
let gasChart = ctx ? new Chart(ctx, {
  type: 'bar',
  data: {
    labels: ['MQ-2 (H2/CH4)','MQ-3 (Acetone)','MQ-7 (CO)','MQ-135 (Ammonia)'],
    datasets: [{
      label: 'Resistance Ratio (Rs/Ro)',
      data: [0,0,0,0],
      backgroundColor: [
        'rgba(99, 179, 237, 0.8)',
        'rgba(154, 117, 234, 0.8)',
        'rgba(252, 129, 74, 0.8)',
        'rgba(72, 187, 120, 0.8)'
      ],
      borderColor: [
        '#63b3ed','#9a75ea','#fc814a','#48bb78'
      ],
      borderWidth: 2,
      borderRadius: 6
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
    }, 1500); // 1.5 second analysis delay
  });
}
