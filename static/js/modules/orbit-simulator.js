import * as THREE from 'three';
import { parseMarkdown } from '../api.js';

export class OrbitSimulator {
  constructor(threeScene, api, ui) {
    this.threeScene = threeScene;
    this.api = api;
    this.ui = ui;

    // Simulation Constants
    this.G = 1; // Gravitational constant scaled for screen coords
    this.dt = 0.05; // Time step
    this.isPaused = false;

    // Initial parameters (defaults)
    this.starMass = 100;
    this.initVelocity = 2.8;
    this.initRadius = 10;

    // Simulation state
    this.planetPos = new THREE.Vector3();
    this.planetVel = new THREE.Vector3();
    this.trailPoints = [];
    this.maxTrailPoints = 300;
    this.simTicks = 0;

    // State history for circularity check
    this.radiusHistory = [];
    this.hasCrashed = false;
    this.hasEscaped = false;
    
    // Quiz Data
    this.quizQuestions = [
      {
        question: "If a satellite's distance from a planet is doubled, what happens to the gravitational force between them?",
        options: ["It is doubled", "It remains the same", "It is halved", "It decreases to one-quarter"],
        answer: 3,
        explanation: "According to Newton's Inverse-Square Law, the force is inversely proportional to the square of the distance. Doubling the distance decreases the force to 1/(2^2) = 1/4 of its original value!"
      },
      {
        question: "What is Kepler's First Law of Planetary Motion?",
        options: [
          "Planets move in circular orbits with the sun at the center",
          "Planets move in elliptical orbits with the sun at one focus",
          "The square of the orbital period is proportional to the cube of the radius",
          "An imaginary line from the sun sweeps out equal areas in equal times"
        ],
        answer: 1,
        explanation: "Kepler's First Law states that orbits are elliptical (ovals) rather than perfect circles, with the central star sitting at one of the two focal points."
      },
      {
        question: "To escape a planet's gravitational pull entirely, a spacecraft must reach which threshold?",
        options: ["Terminal Velocity", "Orbital Velocity", "Escape Velocity", "Subsonic speed"],
        answer: 2,
        explanation: "Escape velocity is the minimum speed required for a non-propelled body to escape the gravitational influence of a primary body. For Earth, it is approximately 11.2 km/s."
      },
      {
        question: "What happens to a planet's orbital speed as it moves closer to the star in an elliptical orbit?",
        options: ["It slows down", "It speeds up", "It stays exactly constant", "It drops to zero"],
        answer: 1,
        explanation: "By Kepler's Second Law (Conservation of Angular Momentum), a planet travels faster when it is close to the star (periapsis) and slower when it is far away (apoapsis)."
      },
      {
        question: "What velocity is required to maintain a perfect circular orbit at radius 'r' around a star of mass 'M'?",
        options: ["v = sqrt(G*M/r)", "v = G*M/r^2", "v = sqrt(2*G*M/r)", "v = G*M*r"],
        answer: 0,
        explanation: "Equating centripetal force (mv^2/r) and gravitational force (G*M*m/r^2) yields the circular velocity formula: v = sqrt(G*M/r)."
      }
    ];

    this.currentQuestionIndex = 0;
    this.score = 0;
    this.hasAnswered = false;

    // Bind functions
    this.updatePhysics = this.updatePhysics.bind(this);
    this.resetSimulation = this.resetSimulation.bind(this);
    this.handle3DClick = this.handle3DClick.bind(this);
  }

  init() {
    this.threeScene.scene.background = new THREE.Color(0x07070a);
    this.threeScene.scene.fog = new THREE.FogExp2(0x07070a, 0.01);
    
    // Set camera
    this.threeScene.camera.position.set(0, 15, 25);
    this.threeScene.controls.target.set(0, 0, 0);

    // Build scene models
    this.buildSystem();

    // Hook logic updates
    this.physicsActive = true;
    this.animatePhysics();

    // Bind controls
    this.initUI();
  }

  buildSystem() {
    this.physicsGroup = new THREE.Group();
    this.threeScene.scene.add(this.physicsGroup);

    // 1. CENTRAL STAR (Glowing sphere)
    const starGeo = new THREE.SphereGeometry(2, 32, 32);
    const starMat = new THREE.MeshBasicMaterial({
      color: 0xffd54f,
      toneMapped: false
    });
    this.starMesh = new THREE.Mesh(starGeo, starMat);
    this.starMesh.name = "sun";
    this.physicsGroup.add(this.starMesh);

    // Star glow/corona using a semi-transparent outer sphere
    const coronaGeo = new THREE.SphereGeometry(2.4, 16, 16);
    const coronaMat = new THREE.MeshBasicMaterial({
      color: 0xffa000,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    this.coronaMesh = new THREE.Mesh(coronaGeo, coronaMat);
    this.coronaMesh.name = "sun";
    this.physicsGroup.add(this.coronaMesh);

    // PointLight to light up the orbiting planet
    this.starLight = new THREE.PointLight(0xffffff, 2.5, 50);
    this.starLight.position.set(0, 0, 0);
    this.starLight.castShadow = true;
    this.physicsGroup.add(this.starLight);

    // 2. ORBITING PLANET
    const planetGeo = new THREE.SphereGeometry(0.7, 32, 32);
    const planetMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.3,
      metalness: 0.1,
      bumpScale: 0.05
    });
    this.planetMesh = new THREE.Mesh(planetGeo, planetMat);
    this.planetMesh.name = "planet";
    this.planetMesh.castShadow = true;
    this.planetMesh.receiveShadow = true;
    this.physicsGroup.add(this.planetMesh);

    // 3. VECTOR INDICATORS (Arrow Helpers)
    // Red: Gravity force (acceleration)
    this.gravityArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      2.5,
      0xef4444,
      0.6,
      0.3
    );
    this.physicsGroup.add(this.gravityArrow);

    // Green: Velocity vector
    this.velocityArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
      2.5,
      0x10b981,
      0.6,
      0.3
    );
    this.physicsGroup.add(this.velocityArrow);

    // 4. ORBIT TRAIL
    const trailMat = new THREE.LineBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.6,
      linewidth: 2 // Note: linewidth standard WebGL might not scale
    });
    const trailGeo = new THREE.BufferGeometry();
    this.trailLine = new THREE.Line(trailGeo, trailMat);
    this.physicsGroup.add(this.trailLine);

    // Setup initial conditions
    this.resetSimulation();

    // Register click raycaster
    this.threeScene.onClick(this.handle3DClick);
  }

  // Numerical physics loop
  animatePhysics() {
    if (!this.physicsActive) return;
    requestAnimationFrame(this.animatePhysics.bind(this));

    if (!this.isPaused) {
      this.updatePhysics();
    }
  }

  updatePhysics() {
    if (this.hasCrashed || this.hasEscaped) return;

    this.simTicks++;

    // 1. Calculate gravity pull
    const rVector = new THREE.Vector3().subVectors(new THREE.Vector3(0, 0, 0), this.planetPos);
    const rDistance = rVector.length();

    // Handle Crash check
    if (rDistance < 2.3) {
      this.hasCrashed = true;
      this.ui.showToast("Alert: Gravitational Crash! The spacecraft burned in the star's corona.", "error");
      this.updateSimulationStateUI("crashed");
      this.triggerCrashExplosion();
      return;
    }

    // Handle Escape check
    if (rDistance > 32.0) {
      this.hasEscaped = true;
      this.ui.showToast("Alert: Escape Velocity exceeded! Spacecraft flying off into deep space.", "info");
      this.updateSimulationStateUI("escaped");
      return;
    }

    // Force equation: a = G * M / r^2 * normalized_r_direction
    const accelMagnitude = (this.G * this.starMass) / (rDistance * rDistance);
    const acceleration = rVector.clone().normalize().multiplyScalar(accelMagnitude);

    // 2. Integrate: v = v + a * dt
    this.planetVel.add(acceleration.clone().multiplyScalar(this.dt));

    // 3. Integrate: r = r + v * dt
    this.planetPos.add(this.planetVel.clone().multiplyScalar(this.dt));

    // 4. Update 3D mesh
    this.planetMesh.position.copy(this.planetPos);

    // 5. Update vector helpers position & direction
    this.gravityArrow.position.copy(this.planetPos);
    this.gravityArrow.setDirection(acceleration.clone().normalize());
    this.gravityArrow.setLength(Math.min(accelMagnitude * 2.0, 5.0), 0.5, 0.25);

    this.velocityArrow.position.copy(this.planetPos);
    this.velocityArrow.setDirection(this.planetVel.clone().normalize());
    this.velocityArrow.setLength(Math.min(this.planetVel.length() * 1.2, 5.0), 0.5, 0.25);

    // 6. Update orbit trail
    this.trailPoints.push(this.planetPos.clone());
    if (this.trailPoints.length > this.maxTrailPoints) {
      this.trailPoints.shift();
    }
    
    // Set geometry attributes
    const positions = new Float32Array(this.trailPoints.length * 3);
    for (let i = 0; i < this.trailPoints.length; i++) {
      positions[i * 3] = this.trailPoints[i].x;
      positions[i * 3 + 1] = this.trailPoints[i].y;
      positions[i * 3 + 2] = this.trailPoints[i].z;
    }
    this.trailLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.trailLine.geometry.computeBoundingBox();
    this.trailLine.geometry.computeBoundingSphere();
    this.trailLine.geometry.attributes.position.needsUpdate = true;

    // 7. Track radius metrics for circularity
    this.radiusHistory.push(rDistance);
    if (this.radiusHistory.length > 200) {
      this.radiusHistory.shift();
    }

    // Periodic evaluation of orbit state
    if (this.simTicks % 20 === 0) {
      this.evaluateOrbitState(rDistance);
    }
  }

  evaluateOrbitState(currentDistance) {
    if (this.radiusHistory.length < 50) return;

    // Calculate variance of radius
    const sum = this.radiusHistory.reduce((a, b) => a + b, 0);
    const avg = sum / this.radiusHistory.length;
    const sqDiffs = this.radiusHistory.map(v => Math.pow(v - avg, 2));
    const variance = sqDiffs.reduce((a, b) => a + b, 0) / this.radiusHistory.length;
    const stdDev = Math.sqrt(variance);

    let state = "stable";
    
    if (stdDev < 0.15) {
      state = "circular";
    } else if (stdDev < 1.5) {
      state = "elliptical";
    } else {
      state = "highly_eccentric";
    }

    this.updateSimulationStateUI(state, avg);
  }

  updateSimulationStateUI(state, avgRadius = 10) {
    const stateVal = document.getElementById("metric-state");
    const velVal = document.getElementById("metric-velocity");

    if (!stateVal || !velVal) return;

    // Speed text update
    const speed = this.planetVel.length();
    velVal.textContent = `${speed.toFixed(2)} units`;

    // State text/class updates
    if (state === "crashed") {
      stateVal.textContent = "CRASH COLLISION";
      stateVal.className = "metric-value decay-text";
    } else if (state === "escaped") {
      stateVal.textContent = "SYSTEM ESCAPED";
      stateVal.className = "metric-value escape-text";
    } else if (state === "circular") {
      stateVal.textContent = "CIRCULAR ORBIT";
      stateVal.className = "metric-value stable-text";
      
      // Check Insertion Challenge Success
      // Circular at radius 10 (M=100) -> circular speed matches target
      if (Math.abs(avgRadius - this.initRadius) < 1.0) {
        this.triggerChallengeSuccess();
      }
    } else if (state === "elliptical") {
      stateVal.textContent = "ELLIPTICAL ORBIT";
      stateVal.className = "metric-value stable-text";
      stateVal.style.color = "#a855f7"; // purple
    } else if (state === "highly_eccentric") {
      stateVal.textContent = "ECCENTRIC DECAY";
      stateVal.className = "metric-value decay-text";
    }
  }

  triggerChallengeSuccess() {
    if (this.challengeCompleted) return;
    this.challengeCompleted = true;
    
    this.ui.showToast("SUCCESS! Orbital Insertion Challenge completed!", "success");
    
    // Open learn pane and show beautiful completion markdown
    this.ui.switchTab("learn");
    const content = document.getElementById("explain-content");
    const intro = document.getElementById("explain-intro");
    intro.classList.add("hidden");
    content.classList.remove("hidden");
    
    content.innerHTML = `
      <h3>Challenge Completed!</h3>
      <p>You have successfully balanced gravitational pull and centrifugal inertia to establish a stable circular orbit at radius 10!</p>
      <blockquote>
        [!TIP]
        Circular orbital velocity is derived directly by equating centripetal acceleration ($a_c = v^2/r$) to gravity acceleration ($g = GM/r^2$). Solving for velocity gives:
        $v = \\sqrt{GM/r} = \\sqrt{100/10} = \\sqrt{10} \\approx 3.16$ units.
      </blockquote>
      <p>Try the <strong>Interactive Quiz</strong> on the right to complete this module!</p>
    `;
  }

  triggerCrashExplosion() {
    // Small flash effect
    const flashGeo = new THREE.SphereGeometry(3, 16, 16);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xff5722, transparent: true, opacity: 0.8 });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    this.threeScene.scene.add(flash);

    const fade = () => {
      if (flash.material.opacity > 0.05) {
        flash.material.opacity -= 0.05;
        flash.scale.addScalar(0.15);
        requestAnimationFrame(fade);
      } else {
        this.threeScene.scene.remove(flash);
        flash.geometry.dispose();
        flash.material.dispose();
      }
    };
    fade();
  }

  resetSimulation() {
    this.hasCrashed = false;
    this.hasEscaped = false;
    this.simTicks = 0;
    
    // Read sliders
    this.starMass = parseFloat(document.getElementById("slider-mass").value);
    this.initVelocity = parseFloat(document.getElementById("slider-speed").value);
    this.initRadius = parseFloat(document.getElementById("slider-radius").value);

    // Planet placement: starting at (radius, 0, 0)
    this.planetPos.set(this.initRadius, 0, 0);
    this.planetMesh.position.copy(this.planetPos);

    // Tangential Velocity: perpendicular to position, along Z axis
    this.planetVel.set(0, 0, this.initVelocity);

    // Reset trail
    this.trailPoints = [this.planetPos.clone()];
    this.radiusHistory = [];

    // Reset status UI
    this.updateSimulationStateUI("circular", this.initRadius);
  }

  // Handle Raycasting click on Sun/Planet
  handle3DClick(clickedObj) {
    if (!clickedObj || !clickedObj.name) return;
    const name = clickedObj.name;
    this.loadExplanation(name);
  }

  async loadExplanation(bodyName) {
    const intro = document.getElementById("explain-intro");
    const content = document.getElementById("explain-content");
    const loader = document.getElementById("explain-loading");
    
    intro.classList.add("hidden");
    content.classList.add("hidden");
    loader.classList.remove("hidden");

    try {
      const data = await this.api.fetchExplanation(bodyName, "physics");
      if (data.success) {
        content.innerHTML = parseMarkdown(data.explanation);
        loader.classList.add("hidden");
        content.classList.remove("hidden");
      }
    } catch (err) {
      loader.classList.add("hidden");
      content.innerHTML = `<blockquote class="alert-warning"><p><strong>Error:</strong> Failed to fetch explanation.</p></blockquote>`;
      content.classList.remove("hidden");
    }
  }

  // Triggers deep AI orbit parameters analysis
  async analyzeCurrentOrbit() {
    const intro = document.getElementById("explain-intro");
    const content = document.getElementById("explain-content");
    const loader = document.getElementById("explain-loading");
    
    intro.classList.add("hidden");
    content.classList.add("hidden");
    loader.classList.remove("hidden");

    const context = {
      mass: this.starMass,
      velocity: this.planetVel.length(),
      radius: this.planetPos.length(),
      crashed: this.hasCrashed,
      escaped: this.hasEscaped
    };

    try {
      const data = await this.api.fetchExplanation("orbit_analysis", "physics", context);
      if (data.success) {
        content.innerHTML = parseMarkdown(data.explanation);
        loader.classList.add("hidden");
        content.classList.remove("hidden");
      }
    } catch (err) {
      loader.classList.add("hidden");
      content.innerHTML = `<blockquote class="alert-warning"><p><strong>Error:</strong> Failed to analyze current orbit parameters.</p></blockquote>`;
      content.classList.remove("hidden");
    }
  }

  // ==========================================================================
  // QUIZ ENGINE
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
      congrats = "Fantastic! You've mastered gravity and Kepler's laws. NASA awaits!";
    } else if (pct >= 60) {
      congrats = "Great job! You have a strong grasp of orbital mechanics.";
    } else {
      congrats = "Review planetary dynamics and try again to improve your score.";
    }
    
    document.getElementById("quiz-congrats").textContent = congrats;
  }

  // ==========================================================================
  // SETUP UI LISTENERS & LIFECYCLE
  // ==========================================================================

  initUI() {
    // Simulation controls listeners
    const sliderMass = document.getElementById("slider-mass");
    const sliderSpeed = document.getElementById("slider-speed");
    const sliderRadius = document.getElementById("slider-radius");

    const valMass = document.getElementById("val-mass");
    const valSpeed = document.getElementById("val-speed");
    const valRadius = document.getElementById("val-radius");

    // Sliders input
    const onSliderInput = () => {
      valMass.textContent = sliderMass.value;
      valSpeed.textContent = sliderSpeed.value;
      valRadius.textContent = sliderRadius.value;
      
      this.resetSimulation();
    };

    sliderMass.addEventListener("input", onSliderInput);
    sliderSpeed.addEventListener("input", onSliderInput);
    sliderRadius.addEventListener("input", onSliderInput);

    // Initial label text sync
    valMass.textContent = sliderMass.value;
    valSpeed.textContent = sliderSpeed.value;
    valRadius.textContent = sliderRadius.value;

    // Simulation action buttons
    const playBtn = document.getElementById("btn-play-sim");
    playBtn.onclick = () => {
      this.isPaused = !this.isPaused;
      playBtn.innerHTML = this.isPaused ? `<i data-lucide="play"></i> Resume` : `<i data-lucide="pause"></i> Pause`;
      lucide.createIcons();
    };

    document.getElementById("btn-reset-sim").onclick = () => {
      this.resetSimulation();
      this.ui.showToast("Simulation state reset.");
    };

    document.getElementById("btn-analyze-orbit").onclick = () => this.analyzeCurrentOrbit();

    // Quiz triggers
    document.getElementById("btn-start-quiz").onclick = () => this.startQuiz();
    document.getElementById("btn-submit-answer").onclick = () => this.submitAnswer();
    document.getElementById("btn-next-question").onclick = () => this.nextQuestion();
    document.getElementById("btn-retry-quiz").onclick = () => this.startQuiz();

    // Set quiz stats
    document.getElementById("quiz-score").textContent = "0";
    document.getElementById("quiz-total").textContent = this.quizQuestions.length;

    // Show challenge banner
    const banner = document.getElementById("challenge-banner");
    document.getElementById("challenge-text").textContent = "Challenge: Stabilize a circular orbit at radius 10!";
    banner.classList.remove("hidden");
  }

  destroy() {
    this.physicsActive = false;
    
    // Hide banner
    document.getElementById("challenge-banner").classList.add("hidden");

    // Clean up models
    if (this.physicsGroup) {
      this.threeScene.scene.remove(this.physicsGroup);
      this.physicsGroup = null;
    }

    // Reset controls
    this.threeScene.clickCallbacks = [];
    this.threeScene.hoverCallbacks = [];
  }
}
