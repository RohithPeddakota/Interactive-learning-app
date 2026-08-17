import * as THREE from 'three';
import { parseMarkdown } from '../api.js';

export class MoleculeBuilder {
  constructor(threeScene, api, ui) {
    this.threeScene = threeScene;
    this.api = api;
    this.ui = ui;

    // Molecular sandbox state
    this.atoms = []; // Array of { id, element, mesh, bonds: [] }
    this.bonds = []; // Array of { id, atom1, atom2, order (1, 2, 3), mesh }
    
    this.nextAtomId = 1;
    this.nextBondId = 1;

    this.selectedAtom1 = null;
    this.selectedAtom2 = null;

    // Valence limits (max covalent bonds)
    this.valences = {
      'H': 1, // Hydrogen
      'O': 2, // Oxygen
      'N': 3, // Nitrogen
      'C': 4  // Carbon
    };

    // CPK Colors for atoms
    this.colors = {
      'H': 0xffffff, // White
      'C': 0x374151, // Dark gray (almost black)
      'O': 0xef4444, // Red
      'N': 0x3b82f6  // Blue
    };

    // Radii of atoms
    this.radii = {
      'H': 0.45,
      'C': 0.75,
      'O': 0.65,
      'N': 0.70
    };

    // Active synthesis challenge
    this.targetCompound = "carbon_dioxide"; // Target formula
    this.challengeCompleted = false;

    // Quiz Data
    this.quizQuestions = [
      {
        question: "How many valence electrons does a Carbon atom possess?",
        options: ["2", "4", "6", "8"],
        answer: 1,
        explanation: "Carbon sits in Group 14 of the periodic table, meaning it has 4 valence electrons and requires 4 more to complete its octet (octet rule)."
      },
      {
        question: "What is the molecular geometry of a water (H2O) molecule?",
        options: ["Linear", "Trigonal Planar", "Bent", "Tetrahedral"],
        answer: 2,
        explanation: "Due to the two non-bonding lone pairs on the Oxygen atom repelling the Hydrogen-Oxygen bonds, water takes on a 'Bent' shape with a bond angle of about 104.5 degrees."
      },
      {
        question: "What type of chemical bond is formed when two atoms share electrons?",
        options: ["Ionic Bond", "Covalent Bond", "Hydrogen Bond", "Metallic Bond"],
        answer: 1,
        explanation: "Covalent bonding involves the sharing of electron pairs between non-metal atoms, allowing each atom to achieve a stable outer shell."
      },
      {
        question: "Which of these molecules contains a double covalent bond?",
        options: ["Hydrogen gas (H2)", "Water (H2O)", "Methane (CH4)", "Carbon Dioxide (CO2)"],
        answer: 3,
        explanation: "In Carbon Dioxide (CO2), the central Carbon shares 4 electrons with each Oxygen atom, forming two separate double covalent bonds (O=C=O)."
      },
      {
        question: "According to VSEPR theory, why do electron pairs around a central atom arrange themselves as far apart as possible?",
        options: [
          "To maximize gravitational attraction",
          "To minimize electrostatic repulsion",
          "To form magnetic alignments",
          "To increase temperature"
        ],
        answer: 1,
        explanation: "Valence Shell Electron Pair Repulsion (VSEPR) theory states that because electron pairs have negative charges, they naturally repel each other and adjust their 3D angles to minimize this repulsion."
      }
    ];

    this.currentQuestionIndex = 0;
    this.score = 0;
    this.hasAnswered = false;

    // Bindings
    this.handle3DClick = this.handle3DClick.bind(this);
  }

  init() {
    this.threeScene.scene.background = new THREE.Color(0x0a0a0f);
    this.threeScene.scene.fog = new THREE.FogExp2(0x0a0a0f, 0.01);

    this.threeScene.camera.position.set(0, 10, 15);
    this.threeScene.controls.target.set(0, 0, 0);

    // Build grid floor helper
    this.buildGrid();

    // Setup raycasting click listeners
    this.threeScene.onClick(this.handle3DClick);

    this.initUI();
    this.resetWorkspace();
  }

  buildGrid() {
    this.chemGroup = new THREE.Group();
    this.threeScene.scene.add(this.chemGroup);

    // Grid representing builder canvas
    this.gridHelper = new THREE.GridHelper(24, 24, 0x3b82f6, 0x222538);
    this.gridHelper.position.y = -1.5;
    this.chemGroup.add(this.gridHelper);
  }

  // Add a new unbonded atom onto the grid
  addAtom(element) {
    const radius = this.radii[element];
    const color = this.colors[element];

    // Create 3D mesh
    const geo = new THREE.SphereGeometry(radius, 32, 32);
    const mat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.2,
      metalness: 0.1,
      bumpScale: 0.05
    });
    
    // Add carbon-specific textures or highlights
    if (element === 'C') {
      mat.roughness = 0.6;
      mat.metalness = 0.3;
    }

    const mesh = new THREE.Mesh(geo, mat);
    
    // Position near center with slight offset to prevent stacking
    const offsetAngle = Math.random() * Math.PI * 2;
    const offsetDist = Math.random() * 1.5;
    mesh.position.set(Math.cos(offsetAngle) * offsetDist, 0, Math.sin(offsetAngle) * offsetDist);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    mesh.name = `atom_${this.nextAtomId}`;
    this.chemGroup.add(mesh);

    const atomNode = {
      id: this.nextAtomId++,
      element: element,
      mesh: mesh,
      bonds: [] // references to connected bonds
    };

    this.atoms.push(atomNode);
    
    // Auto-select the newly added atom
    this.selectAtom(atomNode);
    this.ui.showToast(`Added ${element} atom.`);

    this.applyVseprLayout();
  }

  // Atom selection raycast response
  handle3DClick(clickedObj) {
    if (!clickedObj || !clickedObj.name) {
      // Clicked empty space: deselect all
      this.deselectAll();
      return;
    }

    if (clickedObj.name.startsWith("atom_")) {
      const atomId = parseInt(clickedObj.name.replace("atom_", ""));
      const atom = this.atoms.find(a => a.id === atomId);
      if (atom) {
        this.selectAtom(atom);
      }
    } else {
      this.deselectAll();
    }
  }

  selectAtom(atom) {
    // 1. If same atom clicked twice: deselect it
    if (this.selectedAtom1 === atom) {
      this.deselectAtom(1);
      return;
    }
    if (this.selectedAtom2 === atom) {
      this.deselectAtom(2);
      return;
    }

    // 2. Assign selection slots
    if (!this.selectedAtom1) {
      this.selectedAtom1 = atom;
      this.highlightMesh(atom.mesh, true, 0x3b82f6); // Blue outline
      document.getElementById("btn-delete-atom").removeAttribute("disabled");
    } else if (!this.selectedAtom2) {
      this.selectedAtom2 = atom;
      this.highlightMesh(atom.mesh, true, 0xf59e0b); // Amber outline
      document.getElementById("btn-form-bond").removeAttribute("disabled");
    } else {
      // Both selected: replace slot 2
      this.deselectAtom(2);
      this.selectedAtom2 = atom;
      this.highlightMesh(atom.mesh, true, 0xf59e0b);
    }
  }

  deselectAtom(slotNum) {
    if (slotNum === 1 && this.selectedAtom1) {
      this.highlightMesh(this.selectedAtom1.mesh, false);
      this.selectedAtom1 = null;
      document.getElementById("btn-delete-atom").setAttribute("disabled", "true");
      if (!this.selectedAtom2) {
        document.getElementById("btn-form-bond").setAttribute("disabled", "true");
      }
    } else if (slotNum === 2 && this.selectedAtom2) {
      this.highlightMesh(this.selectedAtom2.mesh, false);
      this.selectedAtom2 = null;
      document.getElementById("btn-form-bond").setAttribute("disabled", "true");
    }
  }

  deselectAll() {
    this.deselectAtom(1);
    this.deselectAtom(2);
  }

  highlightMesh(mesh, highlight, colorHex = 0xffffff) {
    if (!mesh || !mesh.material) return;
    if (highlight) {
      mesh.material.emissive.setHex(colorHex);
      mesh.material.emissiveIntensity = 0.25;
    } else {
      mesh.material.emissive.setHex(0x000000);
      mesh.material.emissiveIntensity = 0;
    }
  }

  // Create covalent bond
  createCovalentBond() {
    if (!this.selectedAtom1 || !this.selectedAtom2) return;

    const a1 = this.selectedAtom1;
    const a2 = this.selectedAtom2;

    // 1. Valence limit validation
    const a1CurrentBondsCount = this.getValenceUsed(a1);
    const a2CurrentBondsCount = this.getValenceUsed(a2);

    const a1Max = this.valences[a1.element];
    const a2Max = this.valences[a2.element];

    // Check if bond already exists (increase bond order)
    const existingBond = this.bonds.find(b => 
      (b.atom1 === a1 && b.atom2 === a2) || (b.atom1 === a2 && b.atom2 === a1)
    );

    if (existingBond) {
      if (existingBond.order >= 3) {
        this.ui.showToast("Cannot exceed triple bond order!", "error");
        return;
      }
      if (a1CurrentBondsCount + 1 > a1Max) {
        this.ui.showToast(`${a1.element} cannot exceed ${a1Max} covalent bonds!`, "warning");
        return;
      }
      if (a2CurrentBondsCount + 1 > a2Max) {
        this.ui.showToast(`${a2.element} cannot exceed ${a2Max} covalent bonds!`, "warning");
        return;
      }

      existingBond.order++;
      this.rebuildBondMesh(existingBond);
      this.ui.showToast(`Increased covalent bond order to double/triple.`);
    } else {
      // Create new bond
      if (a1CurrentBondsCount + 1 > a1Max) {
        this.ui.showToast(`${a1.element} has met its valence octet limit of ${a1Max} bonds!`, "warning");
        return;
      }
      if (a2CurrentBondsCount + 1 > a2Max) {
        this.ui.showToast(`${a2.element} has met its valence octet limit of ${a2Max} bonds!`, "warning");
        return;
      }

      const bond = {
        id: this.nextBondId++,
        atom1: a1,
        atom2: a2,
        order: 1,
        mesh: null
      };

      this.bonds.push(bond);
      a1.bonds.push(bond);
      a2.bonds.push(bond);

      this.rebuildBondMesh(bond);
      this.ui.showToast(`Formed covalent bond.`);
    }

    this.deselectAll();
    this.applyVseprLayout();
  }

  getValenceUsed(atom) {
    // Sum the order of all bonds connected to this atom
    return atom.bonds.reduce((sum, b) => sum + b.order, 0);
  }

  // Draw cylinders representing single/double bonds
  rebuildBondMesh(bond) {
    if (bond.mesh) {
      this.chemGroup.remove(bond.mesh);
      bond.mesh.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
    }

    const meshGroup = new THREE.Group();
    bond.mesh = meshGroup;
    this.chemGroup.add(meshGroup);

    const pos1 = bond.atom1.mesh.position;
    const pos2 = bond.atom2.mesh.position;

    // Draw cylinders depending on bond order
    const numCylinders = bond.order;
    const bondRadius = 0.08;

    for (let i = 0; i < numCylinders; i++) {
      // Offset cylinders side-by-side for double/triple bonds
      let offset = new THREE.Vector3();
      if (numCylinders > 1) {
        // Calculate a perpendicular vector for offset
        const dir = new THREE.Vector3().subVectors(pos2, pos1).normalize();
        const perp = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
        if (perp.lengthSq() < 0.01) {
          perp.copy(new THREE.Vector3(0, 0, 1).cross(dir).normalize());
        }
        
        // Single spacing offset
        const spacing = 0.16;
        if (numCylinders === 2) {
          offset.copy(perp).multiplyScalar((i === 0 ? -0.5 : 0.5) * spacing);
        } else if (numCylinders === 3) {
          offset.copy(perp).multiplyScalar((i - 1) * spacing);
        }
      }

      const start = pos1.clone().add(offset);
      const end = pos2.clone().add(offset);

      const distance = start.distanceTo(end);
      const cylinderGeo = new THREE.CylinderGeometry(bondRadius, bondRadius, distance, 12);
      
      // Standard gray bond color
      const cylinderMat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.5,
        metalness: 0.2
      });

      const cyl = new THREE.Mesh(cylinderGeo, cylinderMat);

      // Position in the center of start and end
      cyl.position.copy(start).add(end).multiplyScalar(0.5);

      // Align cylinder orientation with bond direction
      const direction = new THREE.Vector3().subVectors(end, start).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
      cyl.setRotationFromQuaternion(quaternion);

      meshGroup.add(cyl);
    }
  }

  // Delete selected atom and associated bonds
  deleteSelectedAtom() {
    if (!this.selectedAtom1) return;
    const target = this.selectedAtom1;

    // 1. Delete associated bonds
    const bondsToRemove = [...target.bonds];
    bondsToRemove.forEach(b => this.removeBond(b));

    // 2. Remove mesh
    this.chemGroup.remove(target.mesh);
    target.mesh.geometry.dispose();
    target.mesh.material.dispose();

    // 3. Remove node from state list
    this.atoms = this.atoms.filter(a => a !== target);

    this.deselectAll();
    this.ui.showToast("Deleted atom.");
    
    this.applyVseprLayout();
  }

  removeBond(bond) {
    // Remove mesh
    if (bond.mesh) {
      this.chemGroup.remove(bond.mesh);
      bond.mesh.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
    }

    // Remove references in bonded atoms
    bond.atom1.bonds = bond.atom1.bonds.filter(b => b.id !== bond.id);
    bond.atom2.bonds = bond.atom2.bonds.filter(b => b.id !== bond.id);

    // Remove from main list
    this.bonds = this.bonds.filter(b => b.id !== bond.id);
  }

  clearSandbox() {
    // Clean up all bonds
    [...this.bonds].forEach(b => this.removeBond(b));

    // Clean up all atoms
    this.atoms.forEach(a => {
      this.chemGroup.remove(a.mesh);
      a.mesh.geometry.dispose();
      a.mesh.material.dispose();
    });

    this.atoms = [];
    this.nextAtomId = 1;
    this.nextBondId = 1;
    this.deselectAll();
    
    this.ui.showToast("Sandbox cleared.");
  }

  // ==========================================================================
  // VSEPR MOLECULAR GEOMETRY SOLVER
  // ==========================================================================

  applyVseprLayout() {
    if (this.atoms.length === 0) return;

    // We implement procedural layout templates for standard small molecules
    // Identify formula components
    const formulaMap = {};
    this.atoms.forEach(a => {
      formulaMap[a.element] = (formulaMap[a.element] || 0) + 1;
    });

    // Detect central Carbon or Nitrogen
    const centralC = this.atoms.find(a => a.element === 'C');
    const centralN = this.atoms.find(a => a.element === 'N');
    const centralO = this.atoms.find(a => a.element === 'O' && a.bonds.length >= 2);

    const bondDist = 1.8; // standard visual bond distance

    // Case 1: WATER (H2O)
    if (formulaMap['H'] === 2 && formulaMap['O'] === 1 && centralO) {
      const hAtoms = this.atoms.filter(a => a.element === 'H');
      // Position O at center
      centralO.mesh.position.set(0, 0, 0);
      
      // Position H atoms at Bent 104.5 degrees angle
      const halfAngle = (104.5 * Math.PI) / 360; // 52.25 deg in radians
      hAtoms[0].mesh.position.set(Math.cos(halfAngle) * bondDist, Math.sin(halfAngle) * bondDist, 0);
      hAtoms[1].mesh.position.set(-Math.cos(halfAngle) * bondDist, Math.sin(halfAngle) * bondDist, 0);
    }
    
    // Case 2: CARBON DIOXIDE (CO2)
    else if (formulaMap['C'] === 1 && formulaMap['O'] === 2 && centralC) {
      const oAtoms = this.atoms.filter(a => a.element === 'O');
      centralC.mesh.position.set(0, 0, 0);
      
      // Linear 180 deg
      oAtoms[0].mesh.position.set(bondDist, 0, 0);
      oAtoms[1].mesh.position.set(-bondDist, 0, 0);
    }

    // Case 3: METHANE (CH4)
    else if (formulaMap['C'] === 1 && formulaMap['H'] === 4 && centralC) {
      const hAtoms = this.atoms.filter(a => a.element === 'H');
      centralC.mesh.position.set(0, 0, 0);

      // Tetrahedral coordinates (109.5 degrees separation)
      hAtoms[0].mesh.position.set(0, bondDist, 0);
      hAtoms[1].mesh.position.set(bondDist * 0.94, -bondDist * 0.33, 0);
      hAtoms[2].mesh.position.set(-bondDist * 0.47, -bondDist * 0.33, bondDist * 0.82);
      hAtoms[3].mesh.position.set(-bondDist * 0.47, -bondDist * 0.33, -bondDist * 0.82);
    }

    // Case 4: AMMONIA (NH3)
    else if (formulaMap['N'] === 1 && formulaMap['H'] === 3 && centralN) {
      const hAtoms = this.atoms.filter(a => a.element === 'H');
      centralN.mesh.position.set(0, bondDist * 0.2, 0);

      // Trigonal Pyramidal coordinates (approx 107 degrees)
      hAtoms[0].mesh.position.set(bondDist * 0.94, -bondDist * 0.3, 0);
      hAtoms[1].mesh.position.set(-bondDist * 0.47, -bondDist * 0.3, bondDist * 0.81);
      hAtoms[2].mesh.position.set(-bondDist * 0.47, -bondDist * 0.3, -bondDist * 0.81);
    }

    // Case 5: OXYGEN GAS (O2)
    else if (formulaMap['O'] === 2 && this.atoms.length === 2) {
      this.atoms[0].mesh.position.set(-bondDist * 0.5, 0, 0);
      this.atoms[1].mesh.position.set(bondDist * 0.5, 0, 0);
    }

    // For any unhandled structure: simple circular layout ring around center
    else {
      // Basic circle layout for any unbonded / custom molecules
      this.atoms.forEach((atom, idx) => {
        // Only adjust atoms that have no custom VSEPR trigger
        // Just spread them in a nice circle if they have bonds
        if (atom.bonds.length > 0) {
          const angle = (idx / this.atoms.length) * Math.PI * 2;
          const targetX = Math.cos(angle) * 2;
          const targetZ = Math.sin(angle) * 2;
          // Smoothly move towards position
          atom.mesh.position.set(targetX, 0, targetZ);
        }
      });
    }

    // Update all bond cylinder positions & rotations to match updated positions
    this.bonds.forEach(b => this.rebuildBondMesh(b));
  }

  // ==========================================================================
  // ANALYSIS & SYNTHESIS VERIFICATION
  // ==========================================================================

  getMoleculeKey() {
    // 1. Collect atom counts
    const counts = {};
    this.atoms.forEach(a => counts[a.element] = (counts[a.element] || 0) + 1);

    // 2. Identify molecule configuration
    // Water: 2 H, 1 O
    if (counts['H'] === 2 && counts['O'] === 1) {
      // Check if both H are bonded to O
      const centralO = this.atoms.find(a => a.element === 'O');
      if (centralO && centralO.bonds.length === 2) {
        return "water";
      }
    }
    // Carbon Dioxide: 1 C, 2 O
    if (counts['C'] === 1 && counts['O'] === 2) {
      const centralC = this.atoms.find(a => a.element === 'C');
      // check double bonds
      if (centralC && centralC.bonds.length === 2 && centralC.bonds.every(b => b.order === 2)) {
        return "carbon_dioxide";
      }
    }
    // Methane: 1 C, 4 H
    if (counts['C'] === 1 && counts['H'] === 4) {
      const centralC = this.atoms.find(a => a.element === 'C');
      if (centralC && centralC.bonds.length === 4) {
        return "methane";
      }
    }
    // Ammonia: 1 N, 3 H
    if (counts['N'] === 1 && counts['H'] === 3) {
      const centralN = this.atoms.find(a => a.element === 'N');
      if (centralN && centralN.bonds.length === 3) {
        return "ammonia";
      }
    }
    // Oxygen Gas: 2 O double bonded
    if (counts['O'] === 2 && this.atoms.length === 2) {
      if (this.bonds.length === 1 && this.bonds[0].order === 2) {
        return "oxygen_gas";
      }
    }

    return null;
  }

  async analyzeMolecule() {
    const intro = document.getElementById("explain-intro");
    const content = document.getElementById("explain-content");
    const loader = document.getElementById("explain-loading");

    intro.classList.add("hidden");
    content.classList.add("hidden");
    loader.classList.remove("hidden");

    // Get molecule compound key
    const compoundKey = this.getMoleculeKey();
    let topicName = compoundKey || "unknown";

    // Build formula details context for custom compilation
    const counts = {};
    this.atoms.forEach(a => counts[a.element] = (counts[a.element] || 0) + 1);
    
    // Construct simple formula string e.g., C1H4 -> CH4
    const formulaList = [];
    Object.keys(counts).sort().forEach(el => {
      const count = counts[el];
      formulaList.push(`${el}${count > 1 ? count : ''}`);
    });
    const formulaStr = formulaList.join('') || "No atoms";

    const context = {
      formula: formulaStr,
      atomsCount: this.atoms.length,
      bondsCount: this.bonds.length,
      graph: this.atoms.map(a => ({
        element: a.element,
        connections: a.bonds.map(b => (b.atom1 === a ? b.atom2.element : b.atom1.element))
      }))
    };

    if (!compoundKey) {
      topicName = `custom molecule (${formulaStr})`;
    }

    try {
      const data = await this.api.fetchExplanation(topicName, "chemistry", context);
      if (data.success) {
        content.innerHTML = parseMarkdown(data.explanation);
        loader.classList.add("hidden");
        content.classList.remove("hidden");
      }
      
      // Challenge validation
      if (compoundKey === this.targetCompound) {
        this.triggerChallengeSuccess();
      }
    } catch (err) {
      loader.classList.add("hidden");
      content.innerHTML = `<blockquote class="alert-warning"><p><strong>Error:</strong> Failed to fetch molecule analysis.</p></blockquote>`;
      content.classList.remove("hidden");
    }
  }

  triggerChallengeSuccess() {
    if (this.challengeCompleted) return;
    this.challengeCompleted = true;

    this.ui.showToast("SUCCESS! Carbon Dioxide double-bond synthesis verified!", "success");

    this.ui.switchTab("learn");
    const content = document.getElementById("explain-content");
    const intro = document.getElementById("explain-intro");
    intro.classList.add("hidden");
    content.classList.remove("hidden");

    content.innerHTML = `
      <h3>Synthesis Success!</h3>
      <p>Excellent work! You constructed a balanced Carbon Dioxide ($CO_2$) molecule with two double bonds ($O=C=O$).</p>
      <blockquote>
        [!IMPORTANT]
        Carbon dioxide is double bonded because carbon requires 4 electrons to satisfy its outer shell, and each oxygen requires 2 electrons. Sharing four electrons per C=O bond achieves octet stability for all three atoms!
      </blockquote>
      <p>Now, test your understanding on chemical covalent bonding with the <strong>Chemistry Quiz</strong> on the right panel!</p>
    `;
  }

  resetWorkspace() {
    this.clearSandbox();
    this.challengeCompleted = false;

    // Show challenge banner
    const banner = document.getElementById("challenge-banner");
    document.getElementById("challenge-text").textContent = "Synthesis Challenge: Construct Carbon Dioxide (CO2) with double bonds!";
    banner.classList.remove("hidden");
  }

  // ==========================================================================
  // QUIZ SYSTEM
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
    
    document.getElementById("question-text").textContent = q.question;
    
    const total = this.quizQuestions.length;
    const progressPercent = (this.currentQuestionIndex / total) * 100;
    document.getElementById("quiz-progress-bar").style.width = `${progressPercent}%`;
    document.getElementById("quiz-progress-text").textContent = `Question ${this.currentQuestionIndex + 1} of ${total}`;
    
    const optContainer = document.getElementById("quiz-options-container");
    optContainer.innerHTML = "";
    
    q.options.forEach((opt, idx) => {
      const button = document.createElement("div");
      button.className = "quiz-option";
      button.dataset.index = idx;
      button.textContent = opt;
      
      button.addEventListener("click", () => {
        if (this.hasAnswered) return;
        
        const prev = optContainer.querySelector(".selected");
        if (prev) prev.classList.remove("selected");
        
        button.classList.add("selected");
        document.getElementById("btn-submit-answer").removeAttribute("disabled");
      });
      
      optContainer.appendChild(button);
    });

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
      congrats = "Excellent! Perfect score on molecular structures and covalent bonds!";
    } else if (pct >= 60) {
      congrats = "Great job! You have a solid grasp of atomic geometry and orbital sharing.";
    } else {
      congrats = "Review octet sharing rules and VSEPR angles to improve your score.";
    }
    
    document.getElementById("quiz-congrats").textContent = congrats;
  }

  // ==========================================================================
  // INITIALIZE LISTENERS & DESTRUCTION
  // ==========================================================================

  initUI() {
    // Add atom buttons
    const atomButtons = document.querySelectorAll(".add-atom-btn");
    atomButtons.forEach(btn => {
      btn.onclick = () => this.addAtom(btn.dataset.element);
    });

    // Action buttons
    document.getElementById("btn-form-bond").onclick = () => this.createCovalentBond();
    document.getElementById("btn-delete-atom").onclick = () => this.deleteSelectedAtom();
    document.getElementById("btn-clear-chem").onclick = () => this.clearSandbox();
    document.getElementById("btn-analyze-chem").onclick = () => this.analyzeMolecule();

    // Quiz buttons
    document.getElementById("btn-start-quiz").onclick = () => this.startQuiz();
    document.getElementById("btn-submit-answer").onclick = () => this.submitAnswer();
    document.getElementById("btn-next-question").onclick = () => this.nextQuestion();
    document.getElementById("btn-retry-quiz").onclick = () => this.startQuiz();

    // Reset quiz stats
    document.getElementById("quiz-score").textContent = "0";
    document.getElementById("quiz-total").textContent = this.quizQuestions.length;
  }

  destroy() {
    // Hide banner
    document.getElementById("challenge-banner").classList.add("hidden");

    // Clean up Group
    if (this.chemGroup) {
      this.threeScene.scene.remove(this.chemGroup);
      this.chemGroup = null;
    }

    // Reset listeners
    this.threeScene.clickCallbacks = [];
    this.threeScene.hoverCallbacks = [];
  }
}
