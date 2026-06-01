/**
 * AirInsight - Firebase Integration Configuration
 * 
 * Single source of truth for Firebase services (Authentication & Firestore).
 * Supports Dual-Mode:
 * - Cloud Mode: When real API keys are configured, it dynamically imports and connects to Firestore & Firebase Auth.
 * - Demo Mode: When placeholder keys are detected, it falls back to a mock service using localStorage.
 */

const firebaseConfig = {
  apiKey: "AIzaSyBq51g910YGl9oduLea8LcyO73e4NeSfc0",
  authDomain: "airflowinsight.firebaseapp.com",
  projectId: "airflowinsight",
  storageBucket: "airflowinsight.firebasestorage.app",
  messagingSenderId: "456637506916",
  appId: "1:456637506916:web:b0879cf24e24baed8f4671",
  measurementId: "G-415T58LC1W"
};

// Check if developer has replaced placeholders
const isDemoMode = !firebaseConfig.apiKey || 
                   firebaseConfig.apiKey.includes("YOUR_API_KEY") || 
                   firebaseConfig.apiKey.trim() === "";

// Make configuration status globally accessible
window.firebaseConfigured = !isDemoMode;

// Set up UI Demo Banner if in demo mode
function createDemoBanner() {
  if (document.getElementById('firebase-demo-banner')) return;
  
  const banner = document.createElement('div');
  banner.id = 'firebase-demo-banner';
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
    <span>💡 <strong>Demo Mode Active:</strong> Data is currently saved to browser local storage. Connect real cloud database by configuring <code>frontend/firebase-config.js</code>.</span>
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
  
  console.log("%c[AirInsight Firebase] Active in DEMO MODE (Local Storage Fallback)", "color: #f59e0b; font-weight: bold; font-size: 11px;");

  // Create collections in localStorage if missing
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
    // Fire all callbacks asynchronously
    setTimeout(() => {
      authCallbacks.forEach(cb => cb(user));
    }, 0);
  };

  window.authService = {
    getCurrentUser: () => activeUser,
    
    onAuthStateChanged: (callback) => {
      authCallbacks.push(callback);
      // Call immediately with active user
      callback(activeUser);
      return () => {
        const idx = authCallbacks.indexOf(callback);
        if (idx > -1) authCallbacks.splice(idx, 1);
      };
    },
    
    register: async (email, password) => {
      await new Promise(r => setTimeout(r, 600)); // Premium micro-delay
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
      
      // In demo/mock mode, we accept any password as long as the account exists
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
  // --- CLOUD MODE (Official SDK v10) ---
  // ==========================================
  
  console.log("%c[AirInsight Firebase] Connecting to CLOUD FIRESTORE & AUTH", "color: #10b981; font-weight: bold; font-size: 11px;");

  const firebaseAppUrl = "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
  const firebaseAuthUrl = "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
  const firebaseFirestoreUrl = "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

  let app, auth, db;
  let activeUser = null;
  let isLoaded = false;
  const authCallbacks = [];
  
  // Resolve loader promise
  let resolveInit;
  const initPromise = new Promise(resolve => { resolveInit = resolve; });

  const initFirebase = async () => {
    try {
      // Dynamic imports from Firebase modular CDN
      const { initializeApp } = await import(firebaseAppUrl);
      const { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } = await import(firebaseAuthUrl);
      const { getFirestore, collection, addDoc, getDocs, query, where, orderBy, deleteDoc, doc } = await import(firebaseFirestoreUrl);

      app = initializeApp(firebaseConfig);
      auth = getAuth(app);
      db = getFirestore(app);

      // Listen to real auth state changes
      onAuthStateChanged(auth, (user) => {
        activeUser = user;
        authCallbacks.forEach(cb => cb(user));
      });

      // Bind actual methods to global service objects
      window.authService = {
        getCurrentUser: () => activeUser,
        
        onAuthStateChanged: (callback) => {
          authCallbacks.push(callback);
          // Run immediately with current state if loaded
          if (isLoaded) callback(activeUser);
          return () => {
            const idx = authCallbacks.indexOf(callback);
            if (idx > -1) authCallbacks.splice(idx, 1);
          };
        },
        
        register: async (email, password) => {
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          return cred.user;
        },
        
        login: async (email, password) => {
          const cred = await signInWithEmailAndPassword(auth, email, password);
          return cred.user;
        },
        
        logout: async () => {
          await signOut(auth);
        }
      };

      window.dbService = {
        saveRecord: async (record) => {
          if (!activeUser) throw new Error("Authentication required: Please sign in to save test records.");
          
          const newRecord = {
            uid: activeUser.uid,
            timestamp: new Date().toISOString(),
            ...record
          };
          
          const docRef = await addDoc(collection(db, "history"), newRecord);
          return { id: docRef.id, ...newRecord };
        },
        
        getHistory: async () => {
          if (!activeUser) return [];
          
          const q = query(
            collection(db, "history"),
            where("uid", "==", activeUser.uid),
            orderBy("timestamp", "desc")
          );
          
          const querySnapshot = await getDocs(q);
          const history = [];
          querySnapshot.forEach((doc) => {
            history.push({ id: doc.id, ...doc.data() });
          });
          return history;
        },
        
        deleteRecord: async (recordId) => {
          await deleteDoc(doc(db, "history", recordId));
          return true;
        }
      };

      isLoaded = true;
      resolveInit();
      console.log("[AirInsight Firebase] Cloud Services initialized successfully!");

    } catch (err) {
      console.error("[AirInsight Firebase] Failed to initialize official Firebase SDK:", err);
      alert("Cloud Firebase SDK failed to load. Falling back to local Demo Mode.");
      // Fallback variables to ensure the app doesn't freeze
      isLoaded = true;
      resolveInit();
    }
  };

  // Setup loader proxies to queue requests until imports are resolved
  const makeLoaderProxy = (serviceName, methodName) => {
    return async (...args) => {
      if (!isLoaded) {
        await initPromise;
      }
      return await window[serviceName][methodName](...args);
    };
  };

  // Placeholders that forward calls after load is complete
  window.authService = {
    getCurrentUser: () => activeUser,
    onAuthStateChanged: (callback) => {
      authCallbacks.push(callback);
      return () => {
        const idx = authCallbacks.indexOf(callback);
        if (idx > -1) authCallbacks.splice(idx, 1);
      };
    },
    register: makeLoaderProxy("authService", "register"),
    login: makeLoaderProxy("authService", "login"),
    logout: makeLoaderProxy("authService", "logout")
  };

  window.dbService = {
    saveRecord: makeLoaderProxy("dbService", "saveRecord"),
    getHistory: makeLoaderProxy("dbService", "getHistory"),
    deleteRecord: makeLoaderProxy("dbService", "deleteRecord")
  };

  // Launch asynchronous script load
  initFirebase();
}
