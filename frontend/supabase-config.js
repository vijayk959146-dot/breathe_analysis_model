/**
 * AirInsight - Supabase Integration Configuration
 * 
 * Single source of truth for Supabase services (Authentication & Database).
 * Supports Dual-Mode:
 * - Cloud Mode: When real API keys are configured, it connects to Supabase Database & Auth.
 * - Demo Mode: When placeholder keys are detected, it falls back to a mock service using localStorage.
 */

const supabaseConfig = {
  url: "YOUR_SUPABASE_URL",
  anonKey: "YOUR_SUPABASE_ANON_KEY"
};

// Check if developer has replaced placeholders
const isDemoMode = !supabaseConfig.url || 
                   supabaseConfig.url.includes("YOUR_SUPABASE_URL") || 
                   supabaseConfig.url.trim() === "" ||
                   !supabaseConfig.anonKey ||
                   supabaseConfig.anonKey.includes("YOUR_SUPABASE_ANON_KEY") ||
                   supabaseConfig.anonKey.trim() === "";

// Make configuration status globally accessible
window.firebaseConfigured = !isDemoMode; // Keep naming to avoid breaking dashboard labels

// Set up UI Demo Banner if in demo mode
function createDemoBanner() {
  if (document.getElementById('supabase-demo-banner')) return;
  
  const banner = document.createElement('div');
  banner.id = 'supabase-demo-banner';
  banner.style.cssText = `
    background: linear-gradient(90deg, #f59e0b, #d97706);
    color: #0f172a;
    text-align: center;
    padding: 0.5rem 1rem;
    font-size: 0.85rem;
    font-weight: 600;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    box-shadow: 0 -4px 12px rgba(0,0,0,0.3);
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    backdrop-filter: blur(10px);
  `;
  banner.innerHTML = `
    <span>💡 <strong>Demo Mode Active:</strong> Data is currently saved to browser local storage. Connect Supabase by configuring <code>frontend/supabase-config.js</code>.</span>
    <button onclick="this.parentElement.remove()" style="background:rgba(15,23,42,0.15); border:none; color:#0f172a; font-weight:bold; cursor:pointer; padding:2px 8px; border-radius:4px; font-size:0.75rem; margin-left:10px;">Dismiss</button>
  `;
  document.body.appendChild(banner);
}

// Display banner when DOM is ready (in Demo Mode)
if (isDemoMode) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createDemoBanner);
  } else {
    createDemoBanner();
  }
}

if (isDemoMode) {
  // ==========================================
  // --- DEMO / MOCK MODE (localStorage) ---
  // ==========================================
  
  console.log("%c[AirInsight Supabase] Active in DEMO MODE (Local Storage Fallback)", "color: #f59e0b; font-weight: bold; font-size: 11px;");

  if (!localStorage.getItem("mock_users")) {
    localStorage.setItem("mock_users", JSON.stringify([]));
  }
  if (!localStorage.getItem("mock_history")) {
    localStorage.setItem("mock_history", JSON.stringify([]));
  }

  let activeUser = JSON.parse(localStorage.getItem("mock_active_user") || "null");
  const authCallbacks = [];

  const notifyAuthChange = (user) => {
    activeUser = user;
    if (user) {
      localStorage.setItem("mock_active_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("mock_active_user");
    }
    setTimeout(() => {
      authCallbacks.forEach(cb => cb(user));
    }, 0);
  };

  window.authService = {
    getCurrentUser: () => activeUser,
    onAuthStateChanged: (callback) => {
      authCallbacks.push(callback);
      callback(activeUser);
      return () => {
        const idx = authCallbacks.indexOf(callback);
        if (idx > -1) authCallbacks.splice(idx, 1);
      };
    },
    register: async (email, password) => {
      await new Promise(r => setTimeout(r, 600));
      const emailNorm = email.trim().toLowerCase();
      if (!emailNorm || !password || password.length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }
      const users = JSON.parse(localStorage.getItem("mock_users"));
      if (users.find(u => u.email === emailNorm)) {
        throw new Error("An account already exists with this email address.");
      }
      const newUser = {
        uid: "mock-uid-" + Math.random().toString(36).substr(2, 9),
        email: emailNorm
      };
      users.push(newUser);
      localStorage.setItem("mock_users", JSON.stringify(users));
      notifyAuthChange(newUser);
      return newUser;
    },
    login: async (email, password) => {
      await new Promise(r => setTimeout(r, 600));
      const emailNorm = email.trim().toLowerCase();
      const users = JSON.parse(localStorage.getItem("mock_users"));
      const user = users.find(u => u.email === emailNorm);
      if (!user) {
        throw new Error("No user record found corresponding to this email.");
      }
      notifyAuthChange(user);
      return user;
    },
    logout: async () => {
      await new Promise(r => setTimeout(r, 300));
      notifyAuthChange(null);
    }
  };

  window.dbService = {
    saveRecord: async (record) => {
      await new Promise(r => setTimeout(r, 450));
      if (!activeUser) {
        throw new Error("Authentication required: Please sign in to save test records.");
      }
      const history = JSON.parse(localStorage.getItem("mock_history"));
      const newRecord = {
        id: "mock-rec-" + Math.random().toString(36).substr(2, 9),
        uid: activeUser.uid,
        timestamp: new Date().toISOString(),
        ...record
      };
      history.push(newRecord);
      localStorage.setItem("mock_history", JSON.stringify(history));
      return newRecord;
    },
    getHistory: async () => {
      await new Promise(r => setTimeout(r, 400));
      if (!activeUser) return [];
      const history = JSON.parse(localStorage.getItem("mock_history"));
      return history
        .filter(r => r.uid === activeUser.uid)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    },
    deleteRecord: async (recordId) => {
      await new Promise(r => setTimeout(r, 200));
      let history = JSON.parse(localStorage.getItem("mock_history"));
      history = history.filter(r => r.id !== recordId);
      localStorage.setItem("mock_history", JSON.stringify(history));
      return true;
    }
  };

} else {
  // ==========================================
  // --- CLOUD MODE (Official Supabase JS SDK) ---
  // ==========================================
  
  console.log("%c[AirInsight Supabase] Connecting to Supabase Cloud...", "color: #10b981; font-weight: bold; font-size: 11px;");

  // Initialize Supabase Client
  const supabase = window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);
  let activeUser = null;
  const authCallbacks = [];

  // Initialize user status
  supabase.auth.getUser().then(({ data: { user } }) => {
    activeUser = user;
    authCallbacks.forEach(cb => cb(user));
  });

  // Listen to Auth State Changes
  supabase.auth.onAuthStateChange((event, session) => {
    activeUser = session ? session.user : null;
    authCallbacks.forEach(cb => cb(activeUser));
  });

  window.authService = {
    getCurrentUser: () => activeUser,
    onAuthStateChanged: (callback) => {
      authCallbacks.push(callback);
      // Callback with current state if loaded
      callback(activeUser);
      return () => {
        const idx = authCallbacks.indexOf(callback);
        if (idx > -1) authCallbacks.splice(idx, 1);
      };
    },
    register: async (email, password) => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password
      });
      if (error) throw error;
      return data.user;
    },
    login: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });
      if (error) throw error;
      return data.user;
    },
    logout: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
  };

  window.dbService = {
    saveRecord: async (record) => {
      if (!activeUser) {
        throw new Error("Authentication required: Please sign in to save test records.");
      }
      
      const dbRecord = {
        uid: activeUser.id,
        status: record.status,
        prediction: record.prediction,
        flags: record.flags,
        values: record.values
      };

      const { data, error } = await supabase
        .from('records')
        .insert([dbRecord])
        .select();

      if (error) throw error;
      return data[0];
    },
    getHistory: async () => {
      if (!activeUser) return [];
      
      const { data, error } = await supabase
        .from('records')
        .select('*')
        .eq('uid', activeUser.id)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      return data;
    },
    deleteRecord: async (recordId) => {
      const { error } = await supabase
        .from('records')
        .delete()
        .eq('id', recordId);

      if (error) throw error;
      return true;
    }
  };
}
