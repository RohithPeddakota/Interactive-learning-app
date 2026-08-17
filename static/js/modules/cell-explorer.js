import * as THREE from 'three';
import { parseMarkdown } from '../api.js';

export class CellExplorer {
  constructor(threeScene, api, ui) {
    this.threeScene = threeScene;
    this.api = api;
    this.ui = ui;

    // Track active meshes and ghost placeholders
    this.organelles = {};
    this.ghosts = {};
    this.selectedInventoryItem = null;
    this.placedCount = 0;
    this.isActivityActive = false;

    // Quiz Data
    this.quizQuestions = [
      {
        question: "Which organelle is often referred to as the 'powerhouse of the cell' for its role in generating ATP?",
        options: ["Nucleus", "Ribosome", "Mitochondria", "Golgi Apparatus"],
        answer: 2,
        explanation: "Mitochondria convert chemical energy from food into Adenosine Triphosphate (ATP) through cellular respiration, earning them the name 'powerhouse'!"
      },
      {
        question: "What is the primary function of ribosomes in a eukaryotic cell?",
        options: ["Lipid synthesis", "Protein synthesis", "Waste disposal", "DNA storage"],
        answer: 1,
        explanation: "Ribosomes translate messenger RNA (mRNA) sequences into polypeptide chains, which are then folded into functional proteins."
      },
      {
        question: "Which organelle consists of stacked cisternae and functions to modify, sort, and package proteins for export?",
        options: ["Rough Endoplasmic Reticulum", "Lysosome", "Golgi Apparatus", "Nucleolus"],
        answer: 2,
        explanation: "The Golgi apparatus acts like a cell's shipping post-office, processing proteins coming from the endoplasmic reticulum and sending them to their destinations."
      },
      {
        question: "What separates the nucleus from the cytoplasm in eukaryotic cells?",
        options: ["Cell wall", "Double-layered nuclear envelope", "Single plasma membrane", "Ribosomal sheet"],
        answer: 1,
        explanation: "The nuclear envelope is a double-membrane barrier perforated by nuclear pores that regulate macromolecule passage."
      },
      {
        question: "The Smooth Endoplasmic Reticulum specializes in which of the following activities?",
        options: ["Protein translation", "Photosynthesis", "Lipid synthesis and detoxification", "RNA transcription"],
        answer: 2,
        explanation: "Unlike the Ribosome-studded Rough ER, the Smooth ER lacks ribosomes and is the main site for lipid synthesis, steroid production, and detoxification."
      }
    ];

    this.currentQuestionIndex = 0;
    this.score = 0;
    this.hasAnswered = false;

    // Camera targets for smooth transition
    this.targetCameraPos = null;
    this.targetLookAt = new THREE.Vector3(0, 0, 0);
    this.defaultCameraPos = new THREE.Vector3(0, 8, 20);

    // Bind event listeners
    this.handle3DClick = this.handle3DClick.bind(this);
    this.handle3DHover = this.handle3DHover.bind(this);
    this.updateCameraLerp = this.updateCameraLerp.bind(this);
  }

  init() {
    this.threeScene.scene.background = new THREE.Color(0x08090d);
    this.threeScene.scene.fog = new THREE.FogExp2(0x08090d, 0.02);
    
    // Set camera default
    this.threeScene.camera.position.copy(this.defaultCameraPos);
    this.threeScene.controls.target.set(0, 0, 0);

    // Build the 3D cell model
    this.buildCell();

    // Register raycast events
    this.threeScene.onClick(this.handle3DClick);
    this.threeScene.onHover(this.handle3DHover);

    // Add logic loop listener for smooth camera lerp
    this.threeScene.controls.addEventListener('change', () => {
      // User manual controls break the camera lerp target
      if (this.threeScene.controls.state === 0) { // user interaction finished or idle
        // Let user rotate freely
      }
    });
    
    // Hook camera animation loop
    this.cameraAnimationActive = true;
    this.animateCamera();

    // Init UI elements
    this.initUI();
  }

  // Generate the 3D Eukaryotic Cell components programmatically
  buildCell() {
    this.cellGroup = new THREE.Group();
    this.threeScene.scene.add(this.cellGroup);

    // 1. CYTOPLASM (Cutaway shell)
    // We use a SphereGeometry with phiLength to create a 3/4 cutaway view
    const cytoGeo = new THREE.SphereGeometry(7, 32, 32, 0, Math.PI * 1.5, 0, Math.PI);
    const cytoMat = new THREE.MeshPhysicalMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.6,
      thickness: 1.5,
      wireframe: false
    });
    const cytoplasm = new THREE.Mesh(cytoGeo, cytoMat);
    cytoplasm.name = "cell_membrane";
    cytoplasm.castShadow = false;
    cytoplasm.receiveShadow = true;
    this.cellGroup.add(cytoplasm);
    this.organelles["cell_membrane"] = cytoplasm;

    // 2. NUCLEUS (Central sphere with a small wedge cut out)
    const nucleusGeo = new THREE.SphereGeometry(2.2, 32, 32, 0, Math.PI * 1.6);
    const nucleusMat = new THREE.MeshStandardMaterial({
      color: 0x4f46e5,
      roughness: 0.4,
      metalness: 0.2,
      side: THREE.DoubleSide
    });
    const nucleus = new THREE.Mesh(nucleusGeo, nucleusMat);
    nucleus.position.set(0, 0, 0);
    nucleus.name = "nucleus";
    this.cellGroup.add(nucleus);
    this.organelles["nucleus"] = nucleus;

    // 3. MITOCHONDRIA (Jelly-bean capsule shape)
    // We create multiple mitochondria in different spots
    const mitoColor = 0xea580c;
    const mitoPositions = [
      { pos: new THREE.Vector3(-3.5, -1, 2), rot: new THREE.Vector3(0.5, 1.2, 0.2) },
      { pos: new THREE.Vector3(2.5, -2, -3), rot: new THREE.Vector3(0.8, -0.5, 0.9) }
    ];

    this.mitochondriaMeshes = [];
    mitoPositions.forEach((m, idx) => {
      // Mitochondria Outer Membrane (capsule)
      const mitoGeo = new THREE.CapsuleGeometry(0.6, 1.2, 8, 16);
      const mitoMat = new THREE.MeshStandardMaterial({
        color: mitoColor,
        roughness: 0.5,
        metalness: 0.1
      });
      const mito = new THREE.Mesh(mitoGeo, mitoMat);
      mito.position.copy(m.pos);
      mito.rotation.set(m.rot.x, m.rot.y, m.rot.z);
      mito.name = "mitochondria";
      this.cellGroup.add(mito);
      this.mitochondriaMeshes.push(mito);
    });
    // Store the first one as representative
    this.organelles["mitochondria"] = this.mitochondriaMeshes[0];

    // 4. ENDOPLASMIC RETICULUM (ER - Concentric wavy ribbons)
    // Programmed as stacked flat rings wrapped around the nucleus
    this.erMeshes = [];
    const erColor = 0x0ea5e9;
    const erPositions = [
      { r: 2.8, w: 0.3, y: -0.2, scaleY: 1.5 },
      { r: 3.3, w: 0.2, y: 0.2, scaleY: 1.2 }
    ];

    erPositions.forEach((p, idx) => {
      // We represent ER as wavy tubes
      const curvePoints = [];
      const numPoints = 24;
      for (let i = 0; i <= numPoints; i++) {
        // We restrict the ER to the cutaway region (0 to 1.5 * PI)
        const angle = (i / numPoints) * Math.PI * 1.5;
        // Introduce waviness using sine wave displacement
        const radiusOffset = Math.sin(angle * 8) * 0.25;
        const radius = p.r + radiusOffset;
        
        curvePoints.push(new THREE.Vector3(
          Math.cos(angle) * radius,
          p.y + Math.cos(angle * 12) * 0.15,
          Math.sin(angle) * radius
        ));
      }
      
      const erCurve = new THREE.CatmullRomCurve3(curvePoints);
      const erGeo = new THREE.TubeGeometry(erCurve, 64, p.w, 8, false);
      const erMat = new THREE.MeshStandardMaterial({
        color: erColor,
        roughness: 0.4,
        metalness: 0.1
      });
      const erMesh = new THREE.Mesh(erGeo, erMat);
      erMesh.name = "endoplasmic_reticulum";
      this.cellGroup.add(erMesh);
      this.erMeshes.push(erMesh);
    });
    this.organelles["endoplasmic_reticulum"] = this.erMeshes[0];

    // 5. GOLGI APPARATUS (Stacked flat disks)
    const golgiColor = 0xec4899;
    const golgiGroup = new THREE.Group();
    golgiGroup.position.set(2, 1.5, 2.5);
    golgiGroup.rotation.set(0.4, -0.8, 0.2);
    
    // Stack 4 discs
    for (let i = 0; i < 4; i++) {
      const scale = 1.0 - i * 0.12;
      const height = i * 0.25;
      // Curved ribbon segment represented by a squeezed torus segment
      const diskGeo = new THREE.TorusGeometry(1.2, 0.15, 8, 32, Math.PI * 0.8);
      const diskMat = new THREE.MeshStandardMaterial({
        color: golgiColor,
        roughness: 0.3,
        metalness: 0.1
      });
      const disk = new THREE.Mesh(diskGeo, diskMat);
      disk.position.set(0, height, 0);
      disk.scale.set(scale, scale * 0.4, scale);
      disk.rotation.x = Math.PI / 2;
      disk.name = "golgi_apparatus";
      golgiGroup.add(disk);
    }
    this.cellGroup.add(golgiGroup);
    this.organelles["golgi_apparatus"] = golgiGroup.children[0];
    this.golgiContainer = golgiGroup; // Track parent group for highlighting

    // 6. RIBOSOMES (Tiny yellow spheres on ER and free in cytoplasm)
    this.ribosomeGroup = new THREE.Group();
    const riboColor = 0xeab308;
    const riboGeo = new THREE.SphereGeometry(0.12, 8, 8);
    const riboMat = new THREE.MeshStandardMaterial({ color: riboColor, roughness: 0.9 });
    
    // Place some on the ER
    for (let i = 0; i < 25; i++) {
      const angle = Math.random() * Math.PI * 1.4;
      const rad = 2.9 + Math.random() * 0.5;
      const rx = Math.cos(angle) * rad;
      const ry = -0.3 + Math.random() * 0.6;
      const rz = Math.sin(angle) * rad;
      
      const ribo = new THREE.Mesh(riboGeo, riboMat);
      ribo.position.set(rx, ry, rz);
      ribo.name = "ribosomes";
      this.ribosomeGroup.add(ribo);
    }

    // Free ribosomes in cytosol
    for (let i = 0; i < 15; i++) {
      const ribo = new THREE.Mesh(riboGeo, riboMat);
      // Random coordinates inside the cytoplasm hemisphere
      const angle = Math.random() * Math.PI * 1.5;
      const rad = 3.5 + Math.random() * 2.5;
      ribo.position.set(
        Math.cos(angle) * rad,
        -1.5 + Math.random() * 3,
        Math.sin(angle) * rad
      );
      ribo.name = "ribosomes";
      this.ribosomeGroup.add(ribo);
    }
    
    this.cellGroup.add(this.ribosomeGroup);
    this.organelles["ribosomes"] = this.ribosomeGroup.children[0];

    // Setup shadows on all meshes
    this.cellGroup.traverse(obj => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }

  // Handle Raycasting Highlights
  handle3DHover(hoveredObj, isHovered) {
    if (this.isActivityActive) return; // Disable inspection during building challenge

    // Clear previous highlights
    this.cellGroup.traverse(obj => {
      if (obj.isMesh && obj.material && obj.material.emissive) {
        obj.material.emissive.setHex(0x000000);
      }
    });

    if (isHovered && hoveredObj && hoveredObj.name) {
      const name = hoveredObj.name;
      // Highlight all matching organelles
      this.cellGroup.traverse(obj => {
        if (obj.name === name && obj.material && obj.material.emissive) {
          // Glow intensity based on accent
          obj.material.emissive.setHex(0x112233);
        }
      });
    }
  }

  // Handle clicking a 3D organelle
  handle3DClick(clickedObj) {
    if (this.isActivityActive) {
      // Activity Placement logic:
      this.handleActivityPlacement(clickedObj);
      return;
    }

    if (!clickedObj || !clickedObj.name) return;
    const name = clickedObj.name;
    console.log("Clicked organelle:", name);

    // 1. Focus Camera onto organelle
    const targetPos = new THREE.Vector3();
    clickedObj.getWorldPosition(targetPos);
    
    // Position camera slightly offset from the organelle
    this.targetLookAt.copy(targetPos);
    
    // Zoom close
    const offset = new THREE.Vector3(0, 3, 7);
    if (name === "nucleus") offset.set(0, 2, 5);
    if (name === "cell_membrane") offset.set(0, 8, 16);
    this.targetCameraPos = targetPos.clone().add(offset);

    // 2. Query AI Explanation
    this.loadExplanation(name);
  }

  // AI request trigger
  async loadExplanation(organelleName) {
    const titleMap = {
      "nucleus": "Nucleus",
      "mitochondria": "Mitochondria",
      "ribosomes": "Ribosomes",
      "endoplasmic_reticulum": "Endoplasmic Reticulum",
      "golgi_apparatus": "Golgi Apparatus",
      "cell_membrane": "Cell Membrane"
    };

    const friendlyName = titleMap[organelleName] || organelleName;

    // Show loading
    const intro = document.getElementById("explain-intro");
    const content = document.getElementById("explain-content");
    const loader = document.getElementById("explain-loading");
    
    intro.classList.add("hidden");
    content.classList.add("hidden");
    loader.classList.remove("hidden");

    try {
      const data = await this.api.fetchExplanation(friendlyName, "biology");
      if (data.success) {
        content.innerHTML = parseMarkdown(data.explanation);
        loader.classList.add("hidden");
        content.classList.remove("hidden");
      }
    } catch (err) {
      loader.classList.add("hidden");
      content.innerHTML = `<blockquote class="alert-warning"><p><strong>Error:</strong> Failed to generate explanation. Please check your connection or API configuration.</p></blockquote>`;
      content.classList.remove("hidden");
    }
  }

  // Smooth Camera Animation Loop
  animateCamera() {
    if (!this.cameraAnimationActive) return;
    requestAnimationFrame(this.animateCamera.bind(this));
    this.updateCameraLerp();
  }

  updateCameraLerp() {
    const lerpSpeed = 0.05;
    
    // Smoothly interpolate Camera Position
    if (this.targetCameraPos) {
      this.threeScene.camera.position.lerp(this.targetCameraPos, lerpSpeed);
      
      // If camera is very close to target, stop overriding to let OrbitControls take over smoothly
      if (this.threeScene.camera.position.distanceTo(this.targetCameraPos) < 0.1) {
        this.targetCameraPos = null;
      }
    }

    // Smoothly interpolate Controls Target (what camera is looking at)
    if (this.targetLookAt) {
      this.threeScene.controls.target.lerp(this.targetLookAt, lerpSpeed);
    }
  }

  // ==========================================================================
  // INVENTORY CELL BUILDER ACTIVITY
  // ==========================================================================
  
  startActivity() {
    this.isActivityActive = true;
    this.placedCount = 0;
    this.selectedInventoryItem = null;

    // 1. Hide actual organelles in 3D scene (scale to zero)
    this.toggleRealOrganellesVisibility(false);

    // 2. Build Ghost placeholders (semi-transparent outlines)
    this.buildGhosts();

    // 3. Render Sidebar Inventory
    this.renderInventory();

    // Update instruction panel tab to activity
    this.ui.switchTab("activity");

    // Reset verify actions
    const feedback = document.getElementById("explain-content");
    feedback.classList.add("hidden");
  }

  stopActivity() {
    this.isActivityActive = false;
    this.clearGhosts();
    this.toggleRealOrganellesVisibility(true);
    this.selectedInventoryItem = null;
  }

  toggleRealOrganellesVisibility(visible) {
    const scale = visible ? 1 : 0.001;
    
    // Scale down meshes to hide them
    if (this.organelles["nucleus"]) this.organelles["nucleus"].scale.set(scale, scale, scale);
    if (this.organelles["golgi_apparatus"]) this.golgiContainer.scale.set(scale, scale, scale);
    
    this.mitochondriaMeshes.forEach(m => m.scale.set(scale, scale, scale));
    this.erMeshes.forEach(m => m.scale.set(scale, scale, scale));
    this.ribosomeGroup.scale.set(scale, scale, scale);
  }

  // Create semi-transparent phantom placeholders in cell structure
  buildGhosts() {
    this.clearGhosts();
    
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.15,
      wireframe: true
    });

    // Ghost Nucleus
    const nGhost = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 16), ghostMat);
    nGhost.position.set(0, 0, 0);
    nGhost.name = "ghost_nucleus";
    this.threeScene.scene.add(nGhost);
    this.ghosts["nucleus"] = nGhost;

    // Ghost Mitochondria (capsule)
    const mGhost = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1.2, 4, 8), ghostMat);
    mGhost.position.set(-3.5, -1, 2);
    mGhost.rotation.set(0.5, 1.2, 0.2);
    mGhost.name = "ghost_mitochondria";
    this.threeScene.scene.add(mGhost);
    this.ghosts["mitochondria"] = mGhost;

    // Ghost Golgi (flat disks)
    const gGhost = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.15, 4, 16, Math.PI * 0.8), ghostMat);
    gGhost.position.set(2, 1.5, 2.5);
    gGhost.rotation.set(0.4, -0.8, 0.2);
    gGhost.scale.set(1, 0.4, 1);
    gGhost.name = "ghost_golgi_apparatus";
    this.threeScene.scene.add(gGhost);
    this.ghosts["golgi_apparatus"] = gGhost;

    // Ghost Endoplasmic Reticulum (simple ring approximation for wireframe)
    const erGhost = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.2, 4, 24), ghostMat);
    erGhost.position.set(0, 0, 0);
    erGhost.rotation.x = Math.PI / 2;
    erGhost.name = "ghost_endoplasmic_reticulum";
    this.threeScene.scene.add(erGhost);
    this.ghosts["endoplasmic_reticulum"] = erGhost;
    
    // Ghost Ribosomes
    const rGhost = new THREE.Mesh(new THREE.SphereGeometry(1.0, 8, 8), ghostMat);
    rGhost.position.set(1.5, -1.0, 1.5);
    rGhost.name = "ghost_ribosomes";
    this.threeScene.scene.add(rGhost);
    this.ghosts["ribosomes"] = rGhost;
  }

  clearGhosts() {
    Object.values(this.ghosts).forEach(g => {
      this.threeScene.scene.remove(g);
      g.geometry.dispose();
      g.material.dispose();
    });
    this.ghosts = {};
  }

  renderInventory() {
    const inventoryGrid = document.getElementById("bio-inventory");
    inventoryGrid.innerHTML = "";

    const items = [
      { id: "nucleus", name: "Nucleus", color: "#4f46e5" },
      { id: "mitochondria", name: "Mitochondria", color: "#ea580c" },
      { id: "endoplasmic_reticulum", name: "Endoplasmic Reticulum", color: "#0ea5e9" },
      { id: "golgi_apparatus", name: "Golgi Apparatus", color: "#ec4899" },
      { id: "ribosomes", name: "Ribosomes", color: "#eab308" }
    ];

    items.forEach(item => {
      const div = document.createElement("div");
      div.className = "inventory-item";
      div.dataset.id = item.id;
      div.innerHTML = `
        <div class="item-meta">
          <span class="item-color-dot" style="background-color: ${item.color}"></span>
          <span class="item-name">${item.name}</span>
        </div>
        <span class="item-status">Ready</span>
      `;
      
      div.addEventListener("click", () => {
        // Deselect previous
        const prev = inventoryGrid.querySelector(".selected");
        if (prev) prev.classList.remove("selected");

        if (this.selectedInventoryItem === item.id) {
          this.selectedInventoryItem = null;
        } else {
          this.selectedInventoryItem = item.id;
          div.classList.add("selected");
          // Focus camera on ghost placeholder to guide user
          const ghost = this.ghosts[item.id];
          if (ghost) {
            this.targetLookAt.copy(ghost.position);
            this.targetCameraPos = ghost.position.clone().add(new THREE.Vector3(0, 3, 6));
          }
        }
      });
      inventoryGrid.appendChild(div);
    });
  }

  // Raycast click response during Cell Builder activity
  handleActivityPlacement(clickedObj) {
    if (!this.selectedInventoryItem) {
      this.ui.showToast("Select an organelle from the inventory first!");
      return;
    }

    if (!clickedObj || !clickedObj.name) return;
    const ghostName = clickedObj.name;
    
    // Expected name matches: ghost_[item_id]
    const expectedGhost = `ghost_${this.selectedInventoryItem}`;
    
    if (ghostName === expectedGhost) {
      // SUCCESSFUL PLACEMENT
      const itemId = this.selectedInventoryItem;
      
      // 1. Remove ghost placeholder from scene
      const ghostMesh = this.ghosts[itemId];
      if (ghostMesh) {
        this.threeScene.scene.remove(ghostMesh);
        delete this.ghosts[itemId];
      }

      // 2. Make real organelle visible again
      this.makeOrganelleVisible(itemId);

      // 3. Update Inventory UI
      const invGrid = document.getElementById("bio-inventory");
      const invItem = invGrid.querySelector(`[data-id="${itemId}"]`);
      if (invItem) {
        invItem.classList.remove("selected");
        invItem.classList.add("placed");
        invItem.querySelector(".item-status").textContent = "Assembled";
      }

      this.ui.showToast(`Placed ${itemId.replace("_", " ").toUpperCase()} successfully!`, "success");
      this.placedCount++;
      this.selectedInventoryItem = null;

      // Celebrate single placement
      const confGeo = new THREE.SphereGeometry(0.1, 4, 4);
      const confMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
      const confParticles = [];
      const sparkCount = 15;
      
      for(let i=0; i<sparkCount; i++) {
        const p = new THREE.Mesh(confGeo, confMat);
        p.position.copy(clickedObj.position);
        this.threeScene.scene.add(p);
        confParticles.push({
          mesh: p,
          vel: new THREE.Vector3((Math.random()-0.5)*0.2, (Math.random()-0.5)*0.2 + 0.1, (Math.random()-0.5)*0.2),
          life: 30
        });
      }

      const sparkLoop = () => {
        let alive = false;
        confParticles.forEach(part => {
          if (part.life > 0) {
            part.mesh.position.add(part.vel);
            part.vel.y -= 0.005; // gravity
            part.life--;
            alive = true;
          } else {
            this.threeScene.scene.remove(part.mesh);
          }
        });
        if (alive) requestAnimationFrame(sparkLoop);
      };
      sparkLoop();

    } else {
      // WRONG PLACEMENT
      this.ui.showToast(`Incorrect! That is the placeholder for the ${ghostName.replace("ghost_", "").replace("_", " ")}.`, "error");
    }
  }

  makeOrganelleVisible(itemId) {
    if (itemId === "nucleus") {
      this.organelles["nucleus"].scale.set(1, 1, 1);
    } else if (itemId === "golgi_apparatus") {
      this.golgiContainer.scale.set(1, 1, 1);
    } else if (itemId === "mitochondria") {
      this.mitochondriaMeshes.forEach(m => m.scale.set(1, 1, 1));
    } else if (itemId === "endoplasmic_reticulum") {
      this.erMeshes.forEach(m => m.scale.set(1, 1, 1));
    } else if (itemId === "ribosomes") {
      this.ribosomeGroup.scale.set(1, 1, 1);
    }
  }

  verifyAssembly() {
    if (this.placedCount >= 5) {
      this.ui.showToast("Congratulations! Cell structural assembly complete!", "success");
      // Open learn pane and show beautiful completion markdown
      this.ui.switchTab("learn");
      const content = document.getElementById("explain-content");
      const intro = document.getElementById("explain-intro");
      intro.classList.add("hidden");
      content.classList.remove("hidden");
      
      content.innerHTML = `
        <h3>Assembly Certified!</h3>
        <p>You have successfully placed all major organelles in eukaryotic cytoplasm structure.</p>
        <blockquote>
          [!TIP]
          Now that you've completed the Cell Builder, take the <strong>Interactive Quiz</strong> on the right panel to solidify your understanding and unlock your biology badge!
        </blockquote>
      `;
      this.placedCount = 0;
      this.isActivityActive = false;
    } else {
      this.ui.showToast(`Assembly incomplete. Please place all 5 organelles! (${this.placedCount}/5 completed)`, "warning");
    }
  }

  resetBuild() {
    this.startActivity();
    this.ui.showToast("Cell workspace reset.");
  }

  // ==========================================================================
  // MODULE QUIZ CONTROLS
  // ==========================================================================

  startQuiz() {
    this.currentQuestionIndex = 0;
    this.score = 0;
    this.loadQuestion();
    
    document.getElementById("quiz-setup-state").classList.add("hidden");
    document.getElementById("quiz-finished-state").classList.add("hidden");
    document.getElementById("quiz-active-state").classList.remove("hidden");
  }

  loadQuestion() {
    this.hasAnswered = false;
    const q = this.quizQuestions[this.currentQuestionIndex];
    
    // UI Update
    document.getElementById("question-text").textContent = q.question;
    
    // Progress
    const total = this.quizQuestions.length;
    const progressPercent = (this.currentQuestionIndex / total) * 100;
    document.getElementById("quiz-progress-bar").style.width = `${progressPercent}%`;
    document.getElementById("quiz-progress-text").textContent = `Question ${this.currentQuestionIndex + 1} of ${total}`;
    
    // Options
    const optContainer = document.getElementById("quiz-options-container");
    optContainer.innerHTML = "";
    
    q.options.forEach((opt, idx) => {
      const button = document.createElement("div");
      button.className = "quiz-option";
      button.dataset.index = idx;
      button.textContent = opt;
      
      button.addEventListener("click", () => {
        if (this.hasAnswered) return;
        
        // Select option
        const prev = optContainer.querySelector(".selected");
        if (prev) prev.classList.remove("selected");
        
        button.classList.add("selected");
        document.getElementById("btn-submit-answer").removeAttribute("disabled");
      });
      
      optContainer.appendChild(button);
    });

    // Reset controls
    document.getElementById("quiz-feedback").classList.add("hidden");
    document.getElementById("btn-submit-answer").classList.remove("hidden");
    document.getElementById("btn-submit-answer").setAttribute("disabled", "true");
    document.getElementById("btn-next-question").classList.add("hidden");
  }

  submitAnswer() {
    this.hasAnswered = true;
    const optContainer = document.getElementById("quiz-options-container");
    const selectedOpt = optContainer.querySelector(".selected");
    
    if (!selectedOpt) return;
    
    const userIndex = parseInt(selectedOpt.dataset.index);
    const q = this.quizQuestions[this.currentQuestionIndex];
    const correctIndex = q.answer;
    
    const feedbackBox = document.getElementById("quiz-feedback");
    const feedbackTitle = document.getElementById("feedback-title");
    const feedbackDesc = document.getElementById("feedback-desc");

    // Apply colors to list
    const options = optContainer.querySelectorAll(".quiz-option");
    options.forEach((opt, idx) => {
      opt.classList.remove("selected");
      if (idx === correctIndex) {
        opt.classList.add("correct");
      } else if (idx === userIndex) {
        opt.classList.add("incorrect");
      }
    });

    if (userIndex === correctIndex) {
      this.score++;
      feedbackBox.className = "quiz-feedback-box correct-feedback";
      feedbackTitle.textContent = "Correct!";
      document.getElementById("quiz-score").textContent = this.score;
    } else {
      feedbackBox.className = "quiz-feedback-box incorrect-feedback";
      feedbackTitle.textContent = "Incorrect";
    }

    feedbackDesc.textContent = q.explanation;
    feedbackBox.classList.remove("hidden");

    document.getElementById("btn-submit-answer").classList.add("hidden");
    document.getElementById("btn-next-question").classList.remove("hidden");
  }

  nextQuestion() {
    this.currentQuestionIndex++;
    if (this.currentQuestionIndex < this.quizQuestions.length) {
      this.loadQuestion();
    } else {
      this.finishQuiz();
    }
  }

  finishQuiz() {
    document.getElementById("quiz-active-state").classList.add("hidden");
    const finishState = document.getElementById("quiz-finished-state");
    finishState.classList.remove("hidden");
    
    const total = this.quizQuestions.length;
    const pct = (this.score / total) * 100;
    
    document.getElementById("quiz-final-score").textContent = `${this.score}/${total}`;
    
    let congrats = "";
    if (pct === 100) {
      congrats = "Perfect score! You are a master Cytologist. Cellular structures bow to your knowledge!";
    } else if (pct >= 60) {
      congrats = "Excellent job! You have a solid grasp of cell components and their properties.";
    } else {
      congrats = "Good try! Review the cell model organelles and their descriptions to perfect your score.";
    }
    
    document.getElementById("quiz-congrats").textContent = congrats;
  }

  // ==========================================================================
  // LIFE CYCLE MANAGEMENT
  // ==========================================================================

  initUI() {
    // Left panel interactions
    document.getElementById("btn-reset-bio").addEventListener("click", () => this.resetBuild());
    document.getElementById("btn-verify-bio").addEventListener("click", () => this.verifyAssembly());

    // Quiz triggers
    document.getElementById("btn-start-quiz").addEventListener("click", () => this.startQuiz());
    document.getElementById("btn-submit-answer").addEventListener("click", () => this.submitAnswer());
    document.getElementById("btn-next-question").addEventListener("click", () => this.nextQuestion());
    document.getElementById("btn-retry-quiz").addEventListener("click", () => this.startQuiz());
    
    // Set quiz stats
    document.getElementById("quiz-score").textContent = "0";
    document.getElementById("quiz-total").textContent = this.quizQuestions.length;
  }

  destroy() {
    this.cameraAnimationActive = false;
    this.stopActivity();

    // Remove 3D cell from scene
    if (this.cellGroup) {
      this.threeScene.scene.remove(this.cellGroup);
      this.cellGroup = null;
    }

    // Reset callbacks on the Three.js wrapper
    this.threeScene.clickCallbacks = [];
    this.threeScene.hoverCallbacks = [];
  }
}
