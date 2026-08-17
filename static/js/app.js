import { ThreeScene } from './three-setup.js';
import { API } from './api.js';
import { CellExplorer } from './modules/cell-explorer.js';
import { OrbitSimulator } from './modules/orbit-simulator.js';
import { MoleculeBuilder } from './modules/molecule-builder.js';

class AppController {
  constructor() {
    this.threeScene = null;
    this.activeModule = null;
    this.activeModuleName = "";
    
    // Toast Notification elements queue
    this.toastContainer = null;
  }

  init() {
    // 1. Setup Toast Container
    this.createToastContainer();

    // 2. Initialize 3D Canvas
    try {
      this.threeScene = new ThreeScene("canvas-container");
    } catch (err) {
      console.error("Failed to initialize Three.js Scene:", err);
      this.showToast("Critical: WebGL is not supported or blocked in this browser.", "error");
      return;
    }

    // 3. Bind Global UI Listeners
    this.bindGlobalListeners();

    // 4. Sync Settings & Connection Status
    this.syncConnectionStatus();

    // 5. Load Default Module (Biology)
    this.switchModule("biology");
  }

  bindGlobalListeners() {
    // Module selection buttons
    const navButtons = document.querySelectorAll(".module-nav button");
    navButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const targetModule = btn.dataset.module;
        if (targetModule !== this.activeModuleName) {
          this.switchModule(targetModule);
          
          // Set active UI class
          navButtons.forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
        }
      });
    });

    // Left Panel Tab toggles (Learn vs. Activity)
    const tabButtons = document.querySelectorAll(".tab-selectors button");
    tabButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const targetTab = btn.dataset.tab;
        this.switchTab(targetTab);
      });
    });

    // Settings Modal controls
    const settingsBtn = document.getElementById("settings-btn");
    const settingsModal = document.getElementById("settings-modal");
    const closeSettings = document.getElementById("btn-close-settings");
    const saveSettings = document.getElementById("btn-save-settings");
    const clearSettings = document.getElementById("btn-clear-settings");
    const apiKeyInput = document.getElementById("input-api-key");

    settingsBtn.addEventListener("click", () => {
      apiKeyInput.value = API.getApiKey();
      settingsModal.classList.remove("hidden");
    });

    closeSettings.addEventListener("click", () => {
      settingsModal.classList.add("hidden");
    });

    // Close on clicking overlay
    settingsModal.addEventListener("click", (e) => {
      if (e.target === settingsModal) {
        settingsModal.classList.add("hidden");
      }
    });

    saveSettings.addEventListener("click", () => {
      const key = apiKeyInput.value.trim();
      if (key) {
        API.setApiKey(key);
        this.showToast("API Key saved successfully!", "success");
      } else {
        API.clearApiKey();
        this.showToast("API Key cleared.");
      }
      this.syncConnectionStatus();
      settingsModal.classList.add("hidden");
    });

    clearSettings.addEventListener("click", () => {
      API.clearApiKey();
      apiKeyInput.value = "";
      this.syncConnectionStatus();
      this.showToast("API Key cleared.");
      settingsModal.classList.add("hidden");
    });

    // Camera Recenter Button
    const recenterBtn = document.getElementById("btn-recenter-cam");
    recenterBtn.addEventListener("click", () => {
      if (this.threeScene) {
        // Reset orbit controls target
        this.threeScene.controls.reset();
        
        // Reset camera positions depending on module
        if (this.activeModuleName === "biology") {
          this.threeScene.camera.position.set(0, 8, 20);
        } else if (this.activeModuleName === "physics") {
          this.threeScene.camera.position.set(0, 15, 25);
        } else if (this.activeModuleName === "chemistry") {
          this.threeScene.camera.position.set(0, 10, 15);
        }
        this.threeScene.controls.target.set(0, 0, 0);
        this.showToast("Camera perspective recentered.");
      }
    });
  }

  // Switches between Biology, Physics, and Chemistry
  switchModule(moduleName) {
    console.log("Loading module:", moduleName);

    // 1. Destroy existing active module (clean WebGL textures, listeners)
    if (this.activeModule) {
      this.activeModule.destroy();
      this.activeModule = null;
    }

    this.activeModuleName = moduleName;

    // 2. Set dynamic theme classes on body (instantly shifts neon CSS variable highlights!)
    document.body.className = `theme-${moduleName}`;

    // 3. Reset left panel view states
    this.switchTab("learn");
    this.resetLeftPanelContent(moduleName);

    // 4. Reset right panel quiz states
    this.resetQuizPanelState();

    // 5. Initialize the new module
    if (moduleName === "biology") {
      this.activeModule = new CellExplorer(this.threeScene, API, this);
    } else if (moduleName === "physics") {
      this.activeModule = new OrbitSimulator(this.threeScene, API, this);
    } else if (moduleName === "chemistry") {
      this.activeModule = new MoleculeBuilder(this.threeScene, API, this);
    }

    if (this.activeModule) {
      this.activeModule.init();
      this.showToast(`Switched to ${moduleName.toUpperCase()} module.`, "success");
    }
    
    // Refresh Lucide icons in generated panels
    lucide.createIcons();
  }

  // Switch tabs in left sidebar
  switchTab(tabName) {
    const tabButtons = document.querySelectorAll(".tab-selectors button");
    const panes = document.querySelectorAll(".tab-pane");

    tabButtons.forEach(b => {
      if (b.dataset.tab === tabName) {
        b.classList.add("active");
      } else {
        b.classList.remove("active");
      }
    });

    panes.forEach(p => {
      if (p.id === `pane-${tabName}`) {
        p.classList.add("active");
      } else {
        p.classList.remove("active");
      }
    });

    // When toggling into Activity mode, trigger setups in modules
    if (tabName === "activity" && this.activeModule) {
      if (this.activeModuleName === "biology") {
        this.activeModule.startActivity();
      } else if (this.activeModuleName === "chemistry") {
        this.activeModule.resetWorkspace();
      } else if (this.activeModuleName === "physics") {
        this.activeModule.resetSimulation();
      }
    } else if (tabName === "learn" && this.activeModule && this.activeModuleName === "biology") {
      // Exit biology building sandbox if user clicks back to learn
      this.activeModule.stopActivity();
    }
  }

  resetLeftPanelContent(moduleName) {
    // Reset instructions texts
    const instTitle = document.querySelector("#explain-intro h3");
    const instDesc = document.getElementById("module-instruction");
    const explainContent = document.getElementById("explain-content");
    const explainIntro = document.getElementById("explain-intro");

    explainContent.classList.add("hidden");
    explainContent.innerHTML = "";
    explainIntro.classList.remove("hidden");

    if (moduleName === "biology") {
      instTitle.textContent = "Cell Biology Explorer";
      instDesc.textContent = "Click on any part of the 3D cell model to trigger a deep AI explanation of its structure and function.";
    } else if (moduleName === "physics") {
      instTitle.textContent = "Planetary Orbits Lab";
      instDesc.textContent = "Click on the Star or Planet to get an AI summary, or adjust controls in the 'Activity' tab to analyze your custom orbits.";
    } else if (moduleName === "chemistry") {
      instTitle.textContent = "Molecular Geometry Sandbox";
      instDesc.textContent = "Assemble covalent compounds in the 'Activity' tab, then click 'Analyze Molecule' to trigger chemical properties and geometry evaluations.";
    }

    // Toggle corresponding active panel elements
    const actBio = document.getElementById("activity-biology");
    const actPhys = document.getElementById("activity-physics");
    const actChem = document.getElementById("activity-chemistry");

    actBio.classList.add("hidden");
    actPhys.classList.add("hidden");
    actChem.classList.add("hidden");

    if (moduleName === "biology") actBio.classList.remove("hidden");
    if (moduleName === "physics") actPhys.classList.remove("hidden");
    if (moduleName === "chemistry") actChem.classList.remove("hidden");
  }

  resetQuizPanelState() {
    document.getElementById("quiz-setup-state").classList.remove("hidden");
    document.getElementById("quiz-active-state").classList.add("hidden");
    document.getElementById("quiz-finished-state").classList.add("hidden");
    document.getElementById("quiz-score").textContent = "0";
  }

  // Sync API badge headers
  syncConnectionStatus() {
    const statusBadge = document.getElementById("connection-status");
    const statusText = statusBadge.querySelector(".status-text");
    const modalBadge = document.getElementById("modal-mode-badge");

    const key = API.getApiKey();
    if (key) {
      statusBadge.className = "status-badge status-live";
      statusText.textContent = "AI Live Mode";
      
      modalBadge.className = "badge-tag tag-live";
      modalBadge.textContent = "Live (Gemini API)";
    } else {
      statusBadge.className = "status-badge status-sandbox";
      statusText.textContent = "Sandbox Mode";
      
      modalBadge.className = "badge-tag tag-sandbox";
      modalBadge.textContent = "Sandbox (Offline)";
    }
  }

  // Toast System
  createToastContainer() {
    this.toastContainer = document.createElement("div");
    this.toastContainer.className = "toast-container";
    
    // Style toast container programmatically to keep CSS simple
    Object.assign(this.toastContainer.style, {
      position: 'fixed',
      bottom: '24px',
      left: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      zIndex: '150',
      pointerEvents: 'none'
    });
    
    document.body.appendChild(this.toastContainer);
  }

  showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    // Setup matching icons
    let iconName = "info";
    if (type === "success") iconName = "check-circle";
    if (type === "error") iconName = "alert-triangle";
    if (type === "warning") iconName = "help-circle";

    toast.innerHTML = `
      <i data-lucide="${iconName}"></i>
      <span>${message}</span>
    `;

    // Programmatic styling for toast card
    Object.assign(toast.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px 18px',
      background: 'rgba(17, 19, 30, 0.9)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '8px',
      boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
      color: '#ffffff',
      fontSize: '0.85rem',
      fontWeight: '600',
      minWidth: '240px',
      maxWidth: '360px',
      pointerEvents: 'auto',
      animation: 'slide-up-subtle 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      backdropFilter: 'blur(8px)'
    });

    // Apply color accents
    const accentColors = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: 'var(--accent-active)'
    };
    toast.querySelector('i').style.color = accentColors[type];
    toast.style.borderLeft = `4px solid ${accentColors[type]}`;

    this.toastContainer.appendChild(toast);
    lucide.createIcons();

    // Animate out
    setTimeout(() => {
      toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 400);
    }, 3000);
  }
}

// Instantiate and start app on page load
document.addEventListener("DOMContentLoaded", () => {
  const app = new AppController();
  app.init();
});
