import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class ThreeScene {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container element with id '${containerId}' not found.`);
    }

    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;

    // 1. Initialize Core Three.js Components
    this.scene = new THREE.Scene();
    
    // Add subtle background fog
    this.scene.background = new THREE.Color(0x0a0b10);
    this.scene.fog = new THREE.FogExp2(0x0a0b10, 0.015);

    this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 100);
    this.camera.position.set(0, 5, 20);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Append to DOM
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // 2. Add Orbit Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 50;
    this.controls.minDistance = 2;

    // 3. Setup Default Studio Lights
    this.setupLights();

    // 4. Listeners & Raycasting
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.clickCallbacks = [];
    this.hoverCallbacks = [];
    this.hoveredObject = null;

    this.onResize = this.onResize.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);

    window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);

    // 5. Start Animation loop
    this.animationFrameId = null;
    this.animate = this.animate.bind(this);
    this.animate();
  }

  setupLights() {
    // Soft ambient light
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.ambientLight);

    // Key directional light representing the sun or standard room light
    this.dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    this.dirLight1.position.set(10, 15, 10);
    this.dirLight1.castShadow = true;
    this.dirLight1.shadow.mapSize.width = 1024;
    this.dirLight1.shadow.mapSize.height = 1024;
    this.scene.add(this.dirLight1);

    // Soft fill blue light from below
    this.dirLight2 = new THREE.DirectionalLight(0x3b82f6, 0.3);
    this.dirLight2.position.set(-10, -10, -10);
    this.scene.add(this.dirLight2);
  }

  onResize() {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;

    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(this.width, this.height);
  }

  // Raycasting for click events
  onPointerDown(event) {
    // Get mouse coordinates relative to container
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Find all meshes (recursive search)
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    if (intersects.length > 0) {
      // Fire all registered click callbacks
      for (const callback of this.clickCallbacks) {
        callback(intersects[0].object, intersects);
      }
    }
  }

  // Raycasting for hover effects
  onPointerMove(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    if (intersects.length > 0) {
      const targetObj = intersects[0].object;
      if (this.hoveredObject !== targetObj) {
        this.hoveredObject = targetObj;
        document.body.style.cursor = 'pointer';
        for (const cb of this.hoverCallbacks) {
          cb(targetObj, true);
        }
      }
    } else {
      if (this.hoveredObject) {
        this.hoveredObject = null;
        document.body.style.cursor = 'default';
        for (const cb of this.hoverCallbacks) {
          cb(null, false);
        }
      }
    }
  }

  // Register interactive callbacks
  onClick(callback) {
    this.clickCallbacks.push(callback);
  }

  onHover(callback) {
    this.hoverCallbacks.push(callback);
  }

  animate() {
    this.animationFrameId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // Clean resource disposal to avoid WebGL context leaks
  dispose() {
    cancelAnimationFrame(this.animationFrameId);
    
    window.removeEventListener('resize', this.onResize);
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
      this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    }

    // Traverse the scene and dispose of geometries, materials, and textures
    this.scene.traverse((object) => {
      if (!object.isMesh) return;

      object.geometry.dispose();

      if (Array.isArray(object.material)) {
        for (const mat of object.material) {
          this.disposeMaterial(mat);
        }
      } else {
        this.disposeMaterial(object.material);
      }
    });

    this.controls.dispose();
    this.renderer.dispose();

    // Clean DOM
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  disposeMaterial(mat) {
    mat.dispose();
    // Dispose textures
    for (const key of Object.keys(mat)) {
      const value = mat[key];
      if (value && typeof value.dispose === 'function') {
        value.dispose();
      }
    }
  }
}
