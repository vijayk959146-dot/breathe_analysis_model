/**
 * AirInsight - Dynamic Backend Settings
 * Allows the user to configure their backend API URL dynamically via the UI.
 * Saves preference in localStorage.
 */

(function () {
  const STORAGE_KEY = "airinsight_backend_url";
  const DEFAULT_URL = "http://10.238.149.66:5000";

  // Expose helper to retrieve active backend URL
  window.getBackendUrl = function () {
    const url = localStorage.getItem(STORAGE_KEY) || DEFAULT_URL;
    // Strip trailing slash if present
    return url.endsWith("/") ? url.slice(0, -1) : url;
  };

  // Inject CSS for the settings modal
  const style = document.createElement("style");
  style.textContent = `
    .settings-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(9, 8, 7, 0.85);
      backdrop-filter: blur(8px);
      z-index: 10000;
      display: flex;
      justify-content: center;
      align-items: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
    }
    .settings-modal-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }
    .settings-modal {
      background: #14100e;
      border: 1px solid rgba(245, 158, 11, 0.2);
      border-radius: 20px;
      width: 90%;
      max-width: 480px;
      padding: 2.2rem;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6), inset 0 0 15px rgba(245, 158, 11, 0.05);
      position: relative;
      transform: translateY(-20px);
      transition: transform 0.3s ease;
    }
    .settings-modal-overlay.active .settings-modal {
      transform: translateY(0);
    }
    .settings-modal::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, #f59e0b, #f43f5e);
      border-radius: 20px 20px 0 0;
    }
    .settings-modal-title {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, #f59e0b, #f43f5e);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .settings-modal-desc {
      color: #a8a29e;
      font-size: 0.85rem;
      line-height: 1.5;
      margin-bottom: 1.5rem;
    }
    .settings-form-group {
      margin-bottom: 1.25rem;
    }
    .settings-label {
      display: block;
      color: #faf9f6;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
    .settings-input {
      width: 100%;
      padding: 0.75rem 1rem;
      background: rgba(36, 30, 26, 0.8);
      border: 1px solid rgba(245, 158, 11, 0.12);
      border-radius: 8px;
      color: #faf9f6;
      font-family: inherit;
      font-size: 0.95rem;
      outline: none;
      transition: border-color 0.3s;
    }
    .settings-input:focus {
      border-color: #f43f5e;
    }
    .settings-quick-btns {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
    }
    .settings-quick-btn {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #a8a29e;
      padding: 0.35rem 0.7rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .settings-quick-btn:hover {
      background: rgba(245, 158, 11, 0.1);
      border-color: rgba(245, 158, 11, 0.3);
      color: #faf9f6;
    }
    .settings-modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
    }
    .settings-btn-cancel {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #faf9f6;
      padding: 0.65rem 1.2rem;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .settings-btn-cancel:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    .settings-btn-save {
      background: linear-gradient(135deg, #f59e0b, #f43f5e);
      border: none;
      color: #090807;
      padding: 0.65rem 1.4rem;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.15);
      transition: all 0.2s;
    }
    .settings-btn-save:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(245, 158, 11, 0.3);
    }
  `;
  document.head.appendChild(style);

  // Setup DOM elements when page is loaded
  window.addEventListener("DOMContentLoaded", () => {
    // 1. Inject settings button into navbar
    const navLinks = document.getElementById("navLinks");
    if (navLinks) {
      const settingsBtn = document.createElement("button");
      settingsBtn.id = "navbar-settings-btn";
      settingsBtn.innerHTML = "⚙️ Connection";
      settingsBtn.style.cssText = `
        background: transparent;
        border: 1px solid rgba(245, 158, 11, 0.12);
        color: #a8a29e;
        font-family: inherit;
        font-size: 0.8rem;
        font-weight: 600;
        padding: 0.4rem 0.8rem;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin-left: auto;
      `;
      
      // Hover effects
      settingsBtn.onmouseenter = () => {
        settingsBtn.style.borderColor = "rgba(244, 63, 94, 0.4)";
        settingsBtn.style.color = "#faf9f6";
      };
      settingsBtn.onmouseleave = () => {
        settingsBtn.style.borderColor = "rgba(245, 158, 11, 0.12)";
        settingsBtn.style.color = "#a8a29e";
      };

      // Add to navLinks (before profile badge if user is signed in)
      const profileBadge = document.getElementById("nav-auth-profile");
      if (profileBadge) {
        navLinks.insertBefore(settingsBtn, profileBadge);
      } else {
        navLinks.appendChild(settingsBtn);
      }

      settingsBtn.addEventListener("click", openSettingsModal);
    }

    // 2. Inject settings modal overlay & structure
    const modalHTML = `
      <div class="settings-modal-overlay" id="settingsOverlay">
        <div class="settings-modal">
          <h4 class="settings-modal-title">Connection Settings</h4>
          <p class="settings-modal-desc">Configure the API URL of the AirInsight backend Flask server.</p>
          
          <div class="settings-form-group">
            <label class="settings-label" for="apiSettingsInput">Backend Server URL</label>
            <input class="settings-input" type="url" id="apiSettingsInput" placeholder="http://127.0.0.1:5000" required>
          </div>

          <div class="settings-quick-btns">
            <button class="settings-quick-btn" data-url="http://localhost:5000">localhost (Local USB)</button>
            <button class="settings-quick-btn" data-url="http://192.168.137.1:5000">192.168.137.1 (Hotspot)</button>
            <button class="settings-quick-btn" data-url="http://10.238.149.66:5000">10.238.149.66 (Default)</button>
          </div>

          <div class="settings-modal-actions">
            <button class="settings-btn-cancel" id="settingsCancelBtn">Cancel</button>
            <button class="settings-btn-save" id="settingsSaveBtn">Save Changes</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHTML);

    // Setup event listeners for modal
    const overlay = document.getElementById("settingsOverlay");
    const input = document.getElementById("apiSettingsInput");
    const cancelBtn = document.getElementById("settingsCancelBtn");
    const saveBtn = document.getElementById("settingsSaveBtn");

    function openSettingsModal() {
      input.value = window.getBackendUrl();
      overlay.classList.add("active");
    }

    function closeSettingsModal() {
      overlay.classList.remove("active");
    }

    cancelBtn.addEventListener("click", closeSettingsModal);
    
    // Close on overlay click
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeSettingsModal();
    });

    // Quick fill buttons
    document.querySelectorAll(".settings-quick-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        input.value = btn.getAttribute("data-url");
      });
    });

    // Save configuration
    saveBtn.addEventListener("click", () => {
      let value = input.value.trim();
      if (!value) return;
      
      // Basic URL verification/normalization
      if (!value.startsWith("http://") && !value.startsWith("https://")) {
        value = "http://" + value;
      }

      localStorage.setItem(STORAGE_KEY, value);
      closeSettingsModal();
      
      // Reload page to re-establish connection tests
      window.location.reload();
    });
  });
})();
