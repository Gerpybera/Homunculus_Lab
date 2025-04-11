import * as THREE from "three";
import { OrbitControls } from "../node_modules/three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "../node_modules/three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "../node_modules/three/examples/jsm/exporters/GLTFExporter.js";
import { FBXLoader } from "../node_modules/three/examples/jsm/loaders/FBXLoader.js"; // Add FBXLoader for armature and animations
import { blobVertexShader, blobFragmentShader } from "./blobShader.js";

// Function to ensure stylesheets are loaded
function ensureStylesheetsLoaded() {
  // Add Google Font for Inter font family if not already added
  if (
    !document.querySelector(
      'link[href*="fonts.googleapis.com/css2?family=Inter"]'
    )
  ) {
    const fontLink = document.createElement("link");
    fontLink.rel = "stylesheet";
    fontLink.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@300;700&display=swap";
    document.head.appendChild(fontLink);
  }

  // Add our UI components stylesheet if not already added
  if (!document.querySelector('link[href*="css/ui-components.css"]')) {
    const styleLink = document.createElement("link");
    styleLink.rel = "stylesheet";
    styleLink.href = "./css/ui-components.css"; // Fixed path to use relative to root
    document.head.appendChild(styleLink);
  }

  // Add our main styles stylesheet if not already added
  if (!document.querySelector('link[href*="css/main-styles.css"]')) {
    const mainStyleLink = document.createElement("link");
    mainStyleLink.rel = "stylesheet";
    mainStyleLink.href = "./css/main-styles.css"; // Fixed path to use relative to root
    document.head.appendChild(mainStyleLink);
  }

  // Add unrig button stylesheet if not already added
  if (!document.querySelector('link[href*="css/unrig-button.css"]')) {
    const unrigButtonStyle = document.createElement("link");
    unrigButtonStyle.rel = "stylesheet";
    unrigButtonStyle.href = "./css/unrig-button.css";
    document.head.appendChild(unrigButtonStyle);
  }

  // Remove old unrig button style if it exists
  const oldStyle = document.querySelector("style#unrig-button-style");
  if (oldStyle) {
    document.head.removeChild(oldStyle);
  }

  // Add style for disabled body part labels
  if (!document.querySelector("style#disabled-labels-style")) {
    const disabledStyle = document.createElement("style");
    disabledStyle.id = "disabled-labels-style";
    disabledStyle.textContent = `
      .disabled-label {
        cursor: default !important;
        filter: grayscale(50%);
        transition: opacity 0.3s ease;
      }
    `;
    document.head.appendChild(disabledStyle);
  }
}

function createShaderBackground() {
  // Create a camera with orthographic projection for the background
  const bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Create shader material with uniforms
  const shaderMaterial = new THREE.ShaderMaterial({
    vertexShader: blobVertexShader,
    fragmentShader: blobFragmentShader,
    uniforms: {
      time: { value: 0.0 },
    },
    // Set depthWrite to false so it doesn't interfere with the scene depth
    depthWrite: false,
    // Set renderOrder to a negative number to ensure it renders behind everything
    renderOrder: -1,
  });

  // Create a plane geometry that fills the screen
  const planeGeometry = new THREE.PlaneGeometry(2, 2);

  // Create a mesh with the plane geometry and shader material
  const backgroundMesh = new THREE.Mesh(planeGeometry, shaderMaterial);

  // Set renderOrder to ensure it renders first (behind everything else)
  backgroundMesh.renderOrder = -1;

  // Create a separate scene for the background
  const backgroundScene = new THREE.Scene();
  backgroundScene.add(backgroundMesh);

  return {
    update: function (time) {
      shaderMaterial.uniforms.time.value = time;
    },
    render: function (renderer) {
      // Set autoClear to false to prevent clearing the depth buffer between renders
      renderer.autoClear = false;
      // Clear color buffer but not depth buffer
      renderer.clearColor();
      // Render background scene
      renderer.render(backgroundScene, bgCamera);
    },
  };
}
// Call this function early in your code
ensureStylesheetsLoaded();

// Scene setup
const scene = new THREE.Scene();
// Initialize shader background
const shaderBackground = createShaderBackground();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 1, 2); // Position camera in front of model
camera.rotation.set(0, 0, 0); // Set camera rotation to look directly along Z-axis

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Add raycaster for object selection
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Track if mouse is currently over a body part
let isOverBodyPart = false;

// Add event listeners
renderer.domElement.addEventListener("click", onCanvasClick);
renderer.domElement.addEventListener("mousemove", onMouseMove);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 1, 0); // Set orbit target to the center of the model
controls.rotateSpeed = 0.5; // Slow down rotation speed
controls.zoomSpeed = 0.7; // Slow down zoom speed
controls.panSpeed = 0.5; // Slow down pan speed
controls.minDistance = 1; // Minimum zoom distance
controls.maxDistance = 10; // Maximum zoom distance

// Add variables for rigging and animation
let armature = null;
let mixer = null;
let animations = [];
let currentAnimation = null;
let clock = new THREE.Clock();
let shaderClock = new THREE.Clock(); // Add separate clock for shader animations
let isRigged = false;

// Predefined dance animations (with correct file paths)
const danceAnimations = [
  { name: "Dance 1", path: "../asset/body rig/dances/dance1.fbx" },
  { name: "Dance 2", path: "../asset/body rig/dances/dance2.fbx" },
  { name: "Dance 3", path: "../asset/body rig/dances/dance3.fbx" },
];

// Add armature name mapping to handle node name mismatches
const armatureNameMapping = {
  Armature001: "mixamorigHips", // Map Armature001 to the root bone in your armature
  Armature002: "mixamorigHips",
  Armature003: "mixamorigHips",
  // Add more mappings if needed
};

// Function to handle clicks on the canvas
function onCanvasClick(event) {
  // Skip interaction if character is rigged
  if (isRigged) return;

  // Skip if we're in orbit control mode (if user is dragging)
  if (controls.enabled && controls.isDragging) return;

  // Calculate mouse position in normalized device coordinates (-1 to +1)
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  // Update the raycaster
  raycaster.setFromCamera(mouse, camera);

  // Find all objects intersecting the ray
  const intersects = raycaster.intersectObjects(scene.children, true);

  if (intersects.length > 0) {
    // Find the first intersected object that belongs to a body part
    for (let i = 0; i < intersects.length; i++) {
      // Get the object
      const object = intersects[i].object;

      // Check if we clicked directly on a body part
      if (object.name && Object.keys(bodyParts).includes(object.name)) {
        console.log(`Clicked on body part: ${object.name}`);

        // Update UI to show this body part is selected
        updateSelectedBodyPart(object.name);

        // Focus camera on this part
        focusOnBodyPart(object.name);
        return;
      }

      // If not, check the mesh name (which we set to the body part name)
      if (object.name) {
        // Try to find the corresponding body part
        for (const partName of Object.keys(bodyParts)) {
          if (object.name === partName) {
            console.log(`Clicked on mesh of body part: ${partName}`);

            // Update UI to show this body part is selected
            updateSelectedBodyPart(partName);

            // Focus camera on this part
            focusOnBodyPart(partName);
            return;
          }
        }
      }

      // If we still haven't found it, check parents
      let parent = object.parent;
      while (parent && parent !== scene) {
        if (parent.name && Object.keys(bodyParts).includes(parent.name)) {
          console.log(`Clicked on child of body part: ${parent.name}`);

          // Update UI to show this body part is selected
          updateSelectedBodyPart(parent.name);

          // Focus camera on this part
          focusOnBodyPart(parent.name);
          return;
        }
        parent = parent.parent;
      }
    }
  }
}

// Function to handle mouse movement for hover effects
function onMouseMove(event) {
  // Skip showing pointer cursor if character is rigged
  if (isRigged) {
    if (isOverBodyPart) {
      document.body.style.cursor = "auto";
      isOverBodyPart = false;
    }
    return;
  }

  // Calculate mouse position in normalized device coordinates (-1 to +1)
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  // Update the raycaster
  raycaster.setFromCamera(mouse, camera);

  // Find all objects intersecting the ray
  const intersects = raycaster.intersectObjects(scene.children, true);

  let hoveredBodyPart = false;

  if (intersects.length > 0) {
    // Check if any of the intersected objects belongs to a body part
    for (let i = 0; i < intersects.length; i++) {
      const object = intersects[i].object;

      // Check if the object itself is a body part
      if (object.name && Object.keys(bodyParts).includes(object.name)) {
        hoveredBodyPart = true;
        break;
      }

      // Check if the object has the same name as a body part
      if (
        object.name &&
        Object.keys(bodyParts).some((part) => part === object.name)
      ) {
        hoveredBodyPart = true;
        break;
      }

      // Check if any parent of the object is a body part
      let parent = object.parent;
      while (parent && parent !== scene) {
        if (parent.name && Object.keys(bodyParts).includes(parent.name)) {
          hoveredBodyPart = true;
          break;
        }
        parent = parent.parent;
      }

      // If we found a body part, stop checking
      if (hoveredBodyPart) break;
    }
  }

  // Update cursor style based on whether we're hovering over a body part
  if (hoveredBodyPart && !isOverBodyPart) {
    document.body.style.cursor = "pointer";
    isOverBodyPart = true;
  } else if (!hoveredBodyPart && isOverBodyPart) {
    document.body.style.cursor = "auto";
    isOverBodyPart = false;
  }
}

// Function to update which body part is selected and update UI accordingly
function updateSelectedBodyPart(partName) {
  // Hide instruction block when a part is selected
  const instructionBlock = document.getElementById("instructionBlock");
  if (instructionBlock) {
    instructionBlock.style.opacity = "0";
  }

  // Update label highlighting
  document.querySelectorAll(".body-part-label").forEach((btn) => {
    const btnId = btn.id.replace("label-", "");
    btn.classList.remove("selected-part");

    if (btnId === partName) {
      // Highlight the selected part
      btn.classList.add("selected-part");
    }
  });

  // Hide the randomize button when a body part is selected
  const randomizeButton = document.getElementById("randomizeAllButton");
  if (randomizeButton && document.body.contains(randomizeButton)) {
    randomizeButton.style.opacity = "0";
    setTimeout(() => {
      if (document.body.contains(randomizeButton)) {
        randomizeButton.style.display = "none";
      }
    }, 300); // Match transition duration
  }

  // Hide the rig button when a body part is selected
  const continueButton = document.getElementById("continueButton");
  if (continueButton && document.body.contains(continueButton)) {
    continueButton.style.opacity = "0";
    setTimeout(() => {
      if (document.body.contains(continueButton)) {
        continueButton.style.display = "none";
      }
    }, 300); // Match transition duration
  }

  // Show customization panel for this part
  showCustomizationPanel(partName);

  // Show reset view panel
  createResetViewPanel();
}

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(1, 1, 1);
scene.add(directionalLight);

// Body parts representation with model paths
const bodyParts = {
  head: {
    position: new THREE.Vector3(0, 0, 0),
    uiPosition: new THREE.Vector3(0, 2, 0), // Position for the head UI button
    radius: 0.5,
    modelPath: "../asset/models/head.glb",
    type: 0, // Changed from 1 to 0 to represent default model
    typeCount: 10,
    baseModelPath: "../asset/models/types/",
  },
  torso: {
    position: new THREE.Vector3(0, 0, 0),
    uiPosition: new THREE.Vector3(0, 1.3, 0), // Position for the torso UI button
    radius: 0.8,
    modelPath: "../asset/models/torso.glb",
    type: 0, // Changed from 1 to 0 to represent default model
    typeCount: 10,
    baseModelPath: "../asset/models/types/",
  },
  leftArm: {
    position: new THREE.Vector3(0, 0, 0),
    uiPosition: new THREE.Vector3(-0.5, 1.5, 0), // Position for the left arm UI button
    radius: 0.3,
    modelPath: "../asset/models/left_arm.glb",
    type: 0, // Changed from 1 to 0 to represent default model
    typeCount: 10,
    baseModelPath: "../asset/models/types/",
  },
  rightArm: {
    position: new THREE.Vector3(0, 0, 0),
    uiPosition: new THREE.Vector3(0.5, 1.5, 0), // Position for the right arm UI button
    radius: 0.3,
    modelPath: "../asset/models/right_arm.glb",
    type: 0, // Changed from 1 to 0 to represent default model
    typeCount: 10,
    baseModelPath: "../asset/models/types/",
  },
  leftLeg: {
    position: new THREE.Vector3(0, 0, 0),
    uiPosition: new THREE.Vector3(-0.3, 0.5, 0), // Position for the left leg UI button
    radius: 0.4,
    modelPath: "../asset/models/left_leg.glb",
    type: 0, // Changed from 1 to 0 to represent default model
    typeCount: 10,
    baseModelPath: "../asset/models/types/",
  },
  rightLeg: {
    position: new THREE.Vector3(0, 0, 0),
    uiPosition: new THREE.Vector3(0.3, 0.5, 0), // Position for the right leg UI button
    radius: 0.4,
    modelPath: "../asset/models/right_leg.glb",
    type: 0, // Changed from 1 to 0 to represent default model
    typeCount: 10,
    baseModelPath: "../asset/models/types/",
  },
};

// Store original camera position and target
const originalCameraPosition = new THREE.Vector3(0, 1, 2);
const originalCameraTarget = new THREE.Vector3(0, 1, 0);
let cameraAnimationId = null;

// Function to animate camera movement
function animateCamera(targetPosition, targetLookAt) {
  // Cancel any ongoing camera animation
  if (cameraAnimationId) {
    cancelAnimationFrame(cameraAnimationId);
  }

  const startPosition = camera.position.clone();
  const startTarget = controls.target.clone();
  const duration = 1000; // milliseconds
  const startTime = performance.now();

  function updateCamera(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Easing function for smoother animation
    const easeProgress = 1 - Math.pow(1 - progress, 3); // Cubic ease-out

    // Interpolate camera position
    camera.position.lerpVectors(startPosition, targetPosition, easeProgress);

    // Interpolate orbit controls target
    controls.target.lerpVectors(startTarget, targetLookAt, easeProgress);
    controls.update();

    if (progress < 1) {
      cameraAnimationId = requestAnimationFrame(updateCamera);
    } else {
      cameraAnimationId = null;
    }
  }

  cameraAnimationId = requestAnimationFrame(updateCamera);
}

// Function to focus camera on a specific body part
function focusOnBodyPart(partName) {
  const part = bodyParts[partName];
  if (!part) return;

  // Calculate focus position (slightly away from the part)
  const focusPosition = part.uiPosition.clone();
  const lookAtPosition = part.uiPosition.clone();

  // Position camera based on part's position
  let cameraOffset;

  // Adjust camera position based on which body part we're focusing on
  switch (partName) {
    case "head":
      cameraOffset = new THREE.Vector3(0, 0, 1.2);
      break;
    case "torso":
      cameraOffset = new THREE.Vector3(0, 0, 1.5);
      break;
    case "leftArm":
      cameraOffset = new THREE.Vector3(-0.3, 0, 1.2);
      break;
    case "rightArm":
      cameraOffset = new THREE.Vector3(0.3, 0, 1.2);
      break;
    case "leftLeg":
      cameraOffset = new THREE.Vector3(-0.1, -0.3, 1.2);
      break;
    case "rightLeg":
      cameraOffset = new THREE.Vector3(0.1, -0.3, 1.2);
      break;
    default:
      cameraOffset = new THREE.Vector3(0, 0, 1.5);
  }

  const targetPosition = new THREE.Vector3().addVectors(
    focusPosition,
    cameraOffset
  );

  // Animate camera to new position
  animateCamera(targetPosition, lookAtPosition);
}

// Function to reset camera to original position
function resetCameraView() {
  // Animate camera back to original position
  animateCamera(originalCameraPosition, originalCameraTarget);

  // Show the randomize button again when view is reset, but only if not rigged
  if (!isRigged) {
    const randomizeButton = document.getElementById("randomizeAllButton");
    if (randomizeButton) {
      randomizeButton.style.display = "block";
      setTimeout(() => {
        randomizeButton.style.opacity = "1";
      }, 10);
    }

    // Show the continue/rig button again when view is reset, but only if not rigged
    const continueButton = document.getElementById("continueButton");
    if (continueButton) {
      continueButton.style.display = "block";
      setTimeout(() => {
        continueButton.style.opacity = "1";
      }, 10);
    } else {
      // Re-create the button if it doesn't exist anymore
      const rigButton = document.createElement("div");
      rigButton.id = "continueButton";
      rigButton.classList.add("simple-continue-button");
      rigButton.textContent = "Continuer";
      rigButton.style.opacity = "0"; // Start hidden for the fade-in effect

      // Add click event for rigging
      rigButton.addEventListener("click", () => {
        autoRigCharacter();
      });

      document.body.appendChild(rigButton);

      // Fade in the button
      setTimeout(() => {
        rigButton.style.opacity = "1";
      }, 50);
    }

    // Show instruction block again when view is reset but only if not rigged
    const instructionBlock = document.getElementById("instructionBlock");
    if (instructionBlock) {
      instructionBlock.style.opacity = "1";
    }
  }

  // Hide the customization panel when resetting camera view
  const existingPanel = document.getElementById("customizationPanel");
  if (existingPanel) {
    existingPanel.style.opacity = "0";
    setTimeout(() => {
      if (document.body.contains(existingPanel)) {
        document.body.removeChild(existingPanel);
      }
    }, 300);
  }

  // Also remove the random options panel
  const randomPanel = document.getElementById("randomOptionsPanel");
  if (randomPanel) {
    document.body.removeChild(randomPanel);
  }

  // Remove reset view panel when resetting
  const resetViewPanel = document.getElementById("resetViewPanel");
  if (resetViewPanel) {
    resetViewPanel.style.opacity = "0";
    setTimeout(() => {
      if (document.body.contains(resetViewPanel)) {
        document.body.removeChild(resetViewPanel);
      }
    }, 300);
  }

  // Reset all label styles
  document.querySelectorAll(".body-part-label").forEach((btn) => {
    btn.classList.remove("selected-part");
  });
}

// Function to create reset view panel with same styling as other panels
function createResetViewPanel() {
  // Remove existing reset view panel if any
  const existingResetPanel = document.getElementById("resetViewPanel");
  if (existingResetPanel) {
    existingResetPanel.style.opacity = "0";
    setTimeout(() => {
      if (document.body.contains(existingResetPanel)) {
        document.body.removeChild(existingResetPanel);
      }
      createAndShowPanel();
    }, 300);
  } else {
    createAndShowPanel();
  }

  function createAndShowPanel() {
    // Create new panel with matching design
    const resetPanel = document.createElement("div");
    resetPanel.id = "resetViewPanel";
    resetPanel.classList.add("panel-base", "reset-view-panel");

    // Create reset view text option
    const resetViewText = document.createElement("div");
    resetViewText.textContent = "Reset View";
    resetViewText.classList.add("panel-option", "white-text");
    resetViewText.addEventListener("click", resetCameraView);

    resetPanel.appendChild(resetViewText);
    document.body.appendChild(resetPanel);

    // Fade in the panel
    setTimeout(() => {
      resetPanel.style.opacity = "1";
    }, 10);
  }
}

// Texture options for each body part
const textureOptions = [
  { name: "Fabric", url: "textures/fabric.jpg" },
  { name: "Metal", url: "textures/metal.jpg" },
  { name: "Wood", url: "textures/wood.jpg" },
  { name: "Stone", url: "textures/stone.jpg" },
  { name: "Leather", url: "textures/leather.jpg" },

  // 15 new textures with customizable names
  { name: "Stone 2", url: "textures/texture6.jpg" },
  { name: "Scales", url: "textures/texture7.jpg" },
  { name: "Denim", url: "textures/texture8.jpg" },
  { name: "Marble", url: "textures/texture9.jpg" },
  { name: "Fur", url: "textures/texture10.jpg" },
  { name: "Crystal", url: "textures/texture11.jpg" },
  { name: "Circuit", url: "textures/texture12.jpg" },
  { name: "Lava", url: "textures/texture13.jpg" },
  { name: "Camouflage", url: "textures/texture14.jpg" },
  { name: "Liquid", url: "textures/texture15.jpg" },
  { name: "Carbon", url: "textures/texture16.jpg" },
  { name: "Glitch", url: "textures/texture17.jpg" },
  { name: "Rust", url: "textures/texture18.jpg" },
  { name: "Silk", url: "textures/texture19.jpg" },
  { name: "Metallic", url: "textures/texture20.jpg" },
];

// Store meshes and their currently applied textures
const bodyPartMeshes = {};
const bodyPartTextures = {};
const textureLoader = new THREE.TextureLoader();

// Load textures in advance
const loadedTextures = {};
textureOptions.forEach((texture) => {
  // Use onload event to properly handle texture loading
  const tex = textureLoader.load(
    texture.url,
    function (loadedTexture) {
      console.log(`Texture ${texture.name} loaded successfully`);
      loadedTexture.wrapS = THREE.RepeatWrapping;
      loadedTexture.wrapT = THREE.RepeatWrapping;
      // Update any meshes that are already using this texture
      Object.entries(bodyPartTextures).forEach(([partName, texName]) => {
        if (texName === texture.name && bodyPartMeshes[partName]) {
          bodyPartMeshes[partName].material.map = loadedTexture;
          bodyPartMeshes[partName].material.needsUpdate = true;
        }
      });
    },
    undefined,
    function (error) {
      console.error(`Error loading texture ${texture.url}:`, error);
    }
  );
  loadedTextures[texture.name] = tex;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
});

// Initialize the application - now simpler because no menu interaction is needed
function initApp() {
  console.log("Initializing 3D application directly...");

  // Start the body creation process immediately
  // We're in the application.html page now, no need to look for menu elements
  createBody();
}

// Function to load a specific body part model based on type
function loadBodyPartModel(partName, typeNumber) {
  const data = bodyParts[partName];

  // Update the current type in our data structure
  data.type = typeNumber;

  // Determine the model path based on type
  let modelPath;
  if (typeNumber === 0) {
    // Use the default model from the models folder
    modelPath = data.modelPath;
  } else {
    // Use type-specific model from types folder
    // Convert leftArm to left_arm, rightLeg to right_leg, etc.
    const partFileName = partName.replace(/([A-Z])/g, "_$1").toLowerCase();
    modelPath = `${data.baseModelPath}${typeNumber}/${partFileName}.glb`;
  }

  console.log(`Loading model: ${modelPath} (type: ${typeNumber})`);

  const gltfLoader = new GLTFLoader();

  // Remove existing model if it exists
  if (bodyPartMeshes[partName] && bodyPartMeshes[partName].model) {
    scene.remove(bodyPartMeshes[partName].model);
  }

  // Show loading indicator for this specific part
  const loadingIndicator = document.createElement("div");
  loadingIndicator.id = `loading-${partName}`;
  loadingIndicator.classList.add("inline-loading-indicator");

  if (typeNumber === 0) {
    loadingIndicator.textContent = `Loading default ${partName}...`;
  } else {
    loadingIndicator.textContent = `Loading ${partName} (type ${typeNumber})...`;
  }

  document.body.appendChild(loadingIndicator);

  gltfLoader.load(
    modelPath,
    function (gltf) {
      // Remove the loading indicator
      if (document.body.contains(loadingIndicator)) {
        document.body.removeChild(loadingIndicator);
      }

      // Get the model from the loaded GLTF
      const model = gltf.scene;

      // Set the position as defined in bodyParts
      model.position.copy(data.position);
      model.name = partName; // Make sure name is set at the top level

      // Find all meshes in the model to apply materials to
      let meshes = [];
      model.traverse(function (child) {
        if (child.isMesh) {
          meshes.push(child);
          child.material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.7,
            metalness: 0.0,
          });
          // Set the same name on child meshes to help with raycasting
          child.name = partName;
        }
      });

      // Store the model and its meshes
      bodyPartMeshes[partName] = {
        model: model,
        meshes: meshes,
      };

      // Add to scene
      scene.add(model);

      // Apply previously selected texture or default
      const textureName = bodyPartTextures[partName] || "Fabric";
      applyTexture(partName, textureName);

      // Update the type display in the UI if it exists
      const typeDisplay = document.getElementById(`type-display-${partName}`);
      if (typeDisplay) {
        typeDisplay.textContent = typeNumber;
      }

      // Update the type slider in the UI if it exists
      const typeSlider = document.getElementById(`type-slider-${partName}`);
      if (typeSlider) {
        typeSlider.value = typeNumber;
      }
    },
    function (xhr) {
      // Loading progress for individual model
      const progress = Math.floor((xhr.loaded / xhr.total) * 100);
      console.log(
        `${partName} model (type ${typeNumber}): ${progress}% loaded`
      );
    },
    function (error) {
      // Remove loading indicator
      if (document.body.contains(loadingIndicator)) {
        document.body.removeChild(loadingIndicator);
      }

      console.error(
        `Error loading type ${typeNumber} model for ${partName} from ${modelPath}:`,
        error
      );

      // Try fallback based on current mode
      if (typeNumber !== 0) {
        console.warn(
          `Attempting to load default model for ${partName} instead...`
        );
        showNotification(
          `Type ${typeNumber} not found for ${partName}, using default model`,
          "warning"
        );

        // Switch to default model and reload
        loadBodyPartModel(partName, 0);
      } else {
        // If default already failed, use a sphere as fallback
        useSphereAsFallback(partName, data);
      }
    }
  );
}

// Helper function to use a sphere as fallback
function useSphereAsFallback(partName, data) {
  console.warn(`Using sphere as fallback for ${partName}`);

  // Create a sphere
  const geometry = new THREE.SphereGeometry(data.radius, 32, 32);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(data.position);
  mesh.name = partName;

  scene.add(mesh);
  bodyPartMeshes[partName] = {
    model: mesh,
    meshes: [mesh],
  };

  // Apply texture
  const textureName = bodyPartTextures[partName] || "Fabric";
  applyTexture(partName, textureName);
}

// Create body parts using GLB models
function createBody() {
  // Track loading progress
  let totalModels = Object.keys(bodyParts).length;
  let loadedModels = 0;

  // Create a loading indicator
  const loadingDiv = document.createElement("div");
  loadingDiv.id = "main-loading";
  loadingDiv.classList.add("loading-indicator");
  loadingDiv.innerHTML = "Loading models: 0%";
  document.body.appendChild(loadingDiv);

  // Load each model with the default model first (not from types folder)
  Object.keys(bodyParts).forEach((name) => {
    const modelPath = bodyParts[name].modelPath;
    const gltfLoader = new GLTFLoader();

    gltfLoader.load(
      modelPath,
      function (gltf) {
        // Get the model from the loaded GLTF
        const model = gltf.scene;

        // Set the position as defined in bodyParts
        model.position.copy(bodyParts[name].position);
        model.name = name; // Make sure name is set at the top level

        // Find all meshes in the model to apply materials to
        let meshes = [];
        model.traverse(function (child) {
          if (child.isMesh) {
            meshes.push(child);
            child.material = new THREE.MeshStandardMaterial({
              color: 0xffffff,
              roughness: 0.7,
              metalness: 0.0,
            });
            // Set the same name on child meshes to help with raycasting
            child.name = name;
          }
        });

        // Store the model and its meshes
        bodyPartMeshes[name] = {
          model: model,
          meshes: meshes,
        };

        // Add to scene
        scene.add(model);

        // Apply default texture
        applyTexture(name, "Fabric");

        // Update loading progress
        loadedModels++;
        const progress = Math.floor((loadedModels / totalModels) * 100);
        loadingDiv.innerHTML = `Loading models: ${progress}%`;

        // If all models are loaded, remove the loading indicator and create UI
        if (loadedModels === totalModels) {
          document.body.removeChild(loadingDiv);
          createBodyPartUI();
        }
      },
      function (xhr) {
        // Loading progress for individual model
        const progress = Math.floor((xhr.loaded / xhr.total) * 100);
        console.log(`${name} model: ${progress}% loaded`);
      },
      function (error) {
        console.error(`Error loading model ${name} from ${modelPath}:`, error);

        // If model fails to load, use a sphere as fallback
        console.warn(`Using sphere as fallback for ${name}`);

        const geometry = new THREE.SphereGeometry(
          bodyParts[name].radius,
          32,
          32
        );
        const material = new THREE.MeshStandardMaterial({
          color: 0xffffff,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(bodyParts[name].position);
        mesh.name = name;

        scene.add(mesh);
        bodyPartMeshes[name] = {
          model: mesh,
          meshes: [mesh],
        };

        // Apply default texture
        applyTexture(name, "Fabric");

        // Update loading progress even if there's an error
        loadedModels++;
        const progress = Math.floor((loadedModels / totalModels) * 100);
        loadingDiv.innerHTML = `Loading models: ${progress}%`;

        if (loadedModels === totalModels) {
          document.body.removeChild(loadingDiv);
          createBodyPartUI();
        }
      }
    );
  });
}

// Create UI with buttons for each body part
function createBodyPartUI() {
  // Create 3D positioned labels instead of traditional UI
  createBodyPartLabels();

  // Add instruction text block
  createInstructionBlock();

  // Don't auto-select any body part at the beginning
  // The UI will appear only when a part is clicked
}

// Function to create instruction text block
function createInstructionBlock() {
  // Remove existing instruction block if any
  const existingBlock = document.getElementById("instructionBlock");
  if (existingBlock) {
    document.body.removeChild(existingBlock);
  }

  // Create the instruction block
  const instructionBlock = document.createElement("div");
  instructionBlock.id = "instructionBlock";
  instructionBlock.className = "instruction-block";
  instructionBlock.textContent =
    "Modifiez votre personnage en cliquant sur une des parties du corps.";

  document.body.appendChild(instructionBlock);

  // Hide instruction when a part is selected or when rigged
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("body-part-label") || isRigged) {
      instructionBlock.style.opacity = "0";
    }
  });

  // Also hide the instruction block when character is rigged
  if (isRigged) {
    instructionBlock.style.opacity = "0";
  }
}

// Function to create animation instruction text block
function createAnimationInstructionBlock() {
  // Remove existing animation instruction block if any
  const existingBlock = document.getElementById("animationInstructionBlock");
  if (existingBlock) {
    document.body.removeChild(existingBlock);
  }

  // Create the animation instruction block
  const animationInstructionBlock = document.createElement("div");
  animationInstructionBlock.id = "animationInstructionBlock";
  animationInstructionBlock.className = "animation-instruction-block";
  animationInstructionBlock.textContent =
    "Choisissez une animation pour votre personnage";

  document.body.appendChild(animationInstructionBlock);

  // Show it initially (when called)
  setTimeout(() => {
    animationInstructionBlock.style.opacity = "1";
  }, 10);
}

// Show customization panel for the selected body part
function showCustomizationPanel(partName) {
  // Remove existing panel if any
  const existingPanel = document.getElementById("customizationPanel");
  const existingRandomPanel = document.getElementById("randomOptionsPanel");

  if (existingPanel) {
    existingPanel.style.opacity = "0";
    if (existingRandomPanel) {
      existingRandomPanel.style.opacity = "0";
    }

    setTimeout(() => {
      if (document.body.contains(existingPanel)) {
        document.body.removeChild(existingPanel);
      }
      if (document.body.contains(existingRandomPanel)) {
        document.body.removeChild(existingRandomPanel);
      }
      createAndShowPanels();
    }, 300); // Same duration as the CSS transition
  } else {
    // If existing random panel exists but main panel doesn't, remove it
    if (existingRandomPanel) {
      document.body.removeChild(existingRandomPanel);
    }
    createAndShowPanels();
  }

  function createAndShowPanels() {
    // Add the custom CSS file if not already added
    if (!document.querySelector('link[href="../css/custom-panel.css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "../css/custom-panel.css";
      document.head.appendChild(link);
    }

    // Add Google Font for Inter font family
    if (
      !document.querySelector(
        'link[href*="fonts.googleapis.com/css2?family=Inter"]'
      )
    ) {
      const fontLink = document.createElement("link");
      fontLink.rel = "stylesheet";
      fontLink.href =
        "https://fonts.googleapis.com/css2?family=Inter:wght@300;700&display=swap";
      document.head.appendChild(fontLink);
    }

    // Create both panels at the same time
    createMainPanel();
    createRandomOptionsPanel(partName);

    // Fade in both panels simultaneously
    setTimeout(() => {
      const mainPanel = document.getElementById("customizationPanel");
      const randomPanel = document.getElementById("randomOptionsPanel");

      if (mainPanel) mainPanel.style.opacity = "1";
      if (randomPanel) mainPanel.style.opacity = "1";
    }, 10);
  }

  function createMainPanel() {
    // Create new panel with Figma design
    const panel = document.createElement("div");
    panel.id = "customizationPanel";
    panel.classList.add("customization-panel");

    // Create the texture parent container
    const textureParent = document.createElement("div");
    textureParent.className = "texture-parent";

    // Create row container for Type label and value
    const typeRow = document.createElement("div");
    typeRow.className = "panel-row";

    // Create Type label
    const typeLabel = document.createElement("div");
    typeLabel.className = "type panel-label";
    typeLabel.textContent = "Type:"; // Removed colon and space
    typeRow.appendChild(typeLabel);

    // Create Type value (clickable)
    const typeValue = document.createElement("div");
    typeValue.className = "div1 clickable-value panel-value";
    typeValue.id = `type-display-${partName}`;
    typeValue.textContent = bodyParts[partName].type;

    // Add click event to cycle through type options
    typeValue.addEventListener("click", (event) => {
      // Get current type
      let currentType = bodyParts[partName].type;
      // Move to next type, wrapping around to 0 if we reach the max
      let nextType = (currentType + 1) % (bodyParts[partName].typeCount + 1);
      // Load the new model type
      loadBodyPartModel(partName, nextType);

      event.stopPropagation(); // Prevent other click handlers
    });

    typeRow.appendChild(typeValue);
    textureParent.appendChild(typeRow);

    // Create row container for Texture label and value
    const textureRow = document.createElement("div");
    textureRow.className = "panel-row";

    // Create Texture label
    const textureLabel = document.createElement("div");
    textureLabel.className = "texture panel-label";
    textureLabel.textContent = "Texture:"; // Removed colon and space
    textureRow.appendChild(textureLabel);

    // Create Texture value (clickable)
    const textureValue = document.createElement("div");
    textureValue.className = "div clickable-value panel-value";
    textureValue.id = `texture-display-${partName}`;

    // Get the current texture name
    const currentTextureName = bodyPartTextures[partName] || "Fabric";
    textureValue.textContent = currentTextureName;

    // Make texture value clickable to cycle through textures
    textureValue.addEventListener("click", (event) => {
      // Find current texture index
      let currentIndex = textureOptions.findIndex(
        (tex) => tex.name === textureValue.textContent
      );
      if (currentIndex === -1) currentIndex = 0;

      // Get next texture
      let nextIndex = (currentIndex + 1) % textureOptions.length;
      const nextTexture = textureOptions[nextIndex];

      // Apply next texture
      textureValue.textContent = nextTexture.name;
      applyTexture(partName, nextTexture.name);

      event.stopPropagation(); // Prevent other click handlers
    });

    textureRow.appendChild(textureValue);
    textureParent.appendChild(textureRow);

    panel.appendChild(textureParent);
    document.body.appendChild(panel);

    // No longer need to add inline styles since they're in the CSS file
  }
}

// Function to create a separate panel for random options
function createRandomOptionsPanel(partName) {
  const randomPanel = document.createElement("div");
  randomPanel.id = "randomOptionsPanel";
  randomPanel.classList.add("panel-base", "random-options-panel");

  // Random Type text option
  const randomTypeButton = document.createElement("div");
  randomTypeButton.textContent = "Random Type";
  randomTypeButton.classList.add("panel-option", "white-text");

  randomTypeButton.addEventListener("click", () => {
    // Choose random type
    const randomType = Math.floor(
      Math.random() * (bodyParts[partName].typeCount + 1)
    );
    loadBodyPartModel(partName, randomType);
  });

  randomPanel.appendChild(randomTypeButton);

  // Random Texture text option
  const randomTextureButton = document.createElement("div");
  randomTextureButton.textContent = "Random Texture";
  randomTextureButton.classList.add("panel-option", "white-text");

  randomTextureButton.addEventListener("click", () => {
    const randomTextureIndex = Math.floor(
      Math.random() * textureOptions.length
    );
    const randomTexture = textureOptions[randomTextureIndex].name;
    applyTexture(partName, randomTexture);

    // Update texture display if panel is open
    const textureValueElement = document.getElementById(
      `texture-display-${partName}`
    );
    if (textureValueElement) {
      textureValueElement.textContent = randomTexture;
    }
  });

  randomPanel.appendChild(randomTextureButton);

  // Randomize Both text option
  const randomBothButton = document.createElement("div");
  randomBothButton.textContent = "Randomize Both";
  randomBothButton.classList.add("panel-option", "white-text");

  randomBothButton.addEventListener("click", () => {
    randomizeBodyPart(partName);
  });

  randomPanel.appendChild(randomBothButton);
  document.body.appendChild(randomPanel);

  // Ensure panel is visible
  setTimeout(() => {
    randomPanel.style.opacity = "1";
  }, 10);
}

// Add a function to randomize an individual body part
function randomizeBodyPart(partName) {
  // Choose random type
  const randomType = Math.floor(
    Math.random() * (bodyParts[partName].typeCount + 1)
  ); // +1 to include type 0

  // Choose random texture
  const randomTextureIndex = Math.floor(Math.random() * textureOptions.length);
  const randomTexture = textureOptions[randomTextureIndex].name;

  // Apply random type
  loadBodyPartModel(partName, randomType);

  // Apply random texture immediately after model loads
  setTimeout(() => {
    applyTexture(partName, randomTexture);

    // Update UI if panel is open for this part
    const textureValueElement = document.getElementById(
      `texture-display-${partName}`
    );
    if (textureValueElement) {
      textureValueElement.textContent = randomTexture;
    }
  }, 500); // Small delay to ensure model has loaded

  return { type: randomType, texture: randomTexture };
}

// Add a function to randomize all body parts
function randomizeAllBodyParts() {
  // Show loading indicator
  const loadingDiv = document.createElement("div");
  loadingDiv.id = "randomize-loading";
  loadingDiv.classList.add("loading-indicator", "transparent-loading");
  loadingDiv.textContent = "Randomizing character...";
  document.body.appendChild(loadingDiv);

  // Hide customization panel if open
  const existingPanel = document.getElementById("customizationPanel");
  if (existingPanel) {
    existingPanel.style.opacity = "0";
    setTimeout(() => {
      if (document.body.contains(existingPanel)) {
        document.body.removeChild(existingPanel);
      }
    }, 300);
  }

  // Get all parts and randomize each one
  const parts = Object.keys(bodyParts);
  let completed = 0;

  // Process parts sequentially to avoid resource issues
  function processNextPart(index) {
    if (index >= parts.length) {
      // All parts processed, remove loading indicator
      setTimeout(() => {
        if (document.body.contains(loadingDiv)) {
          document.body.removeChild(loadingDiv);
        }
        showNotification("Your character has been randomized!", "success");
      }, 500);
      return;
    }

    const partName = parts[index];
    randomizeBodyPart(partName);

    // Process next part after a delay
    setTimeout(() => {
      processNextPart(index + 1);
    }, 200);
  }

  // Start processing parts
  processNextPart(0);
}

// Apply texture to a body part
function applyTexture(partName, textureName) {
  const modelData = bodyPartMeshes[partName];
  const texture = loadedTextures[textureName];

  if (modelData && texture) {
    // Check if texture is loaded
    if (texture.image) {
      // Apply texture to all meshes in the model
      modelData.meshes.forEach((mesh) => {
        mesh.material.map = texture;
        mesh.material.needsUpdate = true;
      });
      bodyPartTextures[partName] = textureName;
    } else {
      // Texture not loaded yet, set a temporary color
      modelData.meshes.forEach((mesh) => {
        mesh.material.color.set(0xcccccc);
      });
      bodyPartTextures[partName] = textureName;
      // Will be updated when texture loads via the callback in the texture loading section
    }
  }
}

// Export scene to GLB
function exportToGLB() {
  // Create a group containing all body parts
  const bodyGroup = new THREE.Group();

  // Process each model for Blender compatibility
  Object.entries(bodyPartMeshes).forEach(([partName, modelData]) => {
    // Clone the model
    const originalModel = modelData.model;
    const clonedModel = originalModel.clone();

    // Process all meshes in the cloned model
    clonedModel.traverse((child) => {
      if (child.isMesh) {
        // Create a new material specifically for export
        const material = new THREE.MeshStandardMaterial({
          color: child.material.color ? child.material.color.clone() : 0xffffff,
          roughness: 0.7,
          metalness: 0.0,
        });

        // Handle texture properly for Blender compatibility
        if (child.material.map) {
          const texture = child.material.map.clone();
          texture.flipY = false; // Critical for Blender compatibility
          texture.needsUpdate = true;
          material.map = texture;
        }

        child.material = material;
      }
    });

    bodyGroup.add(clonedModel);
  });

  // Add progress indicator
  const progressDiv = document.createElement("div");
  progressDiv.classList.add("loading-indicator", "transparent-loading");
  progressDiv.textContent = "Exporting GLB...";
  document.body.appendChild(progressDiv);

  const exporter = new GLTFExporter();

  // Enhanced export options for Blender compatibility
  const exportOptions = {
    binary: true,
    embedImages: true,
    forceIndices: true,
    includeCustomExtensions: false,
    trs: false, // Use matrix transforms
  };

  try {
    exporter.parse(
      bodyGroup,
      function (gltf) {
        document.body.removeChild(progressDiv); // Remove progress indicator

        if (gltf) {
          const blob = new Blob([gltf], { type: "application/octet-stream" });
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = "custom_body.glb";
          link.click();
          URL.revokeObjectURL(link.href);

          // Display success message
          showNotification("Export successful!", "success");
        } else {
          console.error("GLB export failed: No data was generated");
          showNotification("Export failed: No data was generated", "error");
        }
      },
      function (error) {
        document.body.removeChild(progressDiv); // Remove progress indicator
        console.error("GLB export error:", error);
        showNotification("Export failed: " + error, "error");
      },
      exportOptions
    );
  } catch (e) {
    document.body.removeChild(progressDiv); // Remove progress indicator
    console.error("Export exception:", e);
    showNotification("Export failed: " + e.message, "error");
  }
}

// Helper function to show notifications
function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.classList.add("notification", `notification-${type}`);
  notification.textContent = message;
  document.body.appendChild(notification);

  // Remove after 3 seconds
  setTimeout(() => {
    if (document.body.contains(notification)) {
      document.body.removeChild(notification);
    }
  }, 3000);
}

// Resize handler
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Update label positions after resize
  updateLabelPositions();
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  // Use dedicated shader clock for background
  const shaderTime = shaderClock.getElapsedTime();
  shaderBackground.update(shaderTime);

  // Clear everything first
  renderer.clear();

  // Render the background first - pass renderer explicitly
  shaderBackground.render(renderer);

  // Then render the scene with the character (don't clear buffers)
  renderer.clearDepth();
  renderer.render(scene, camera);

  // Update the positions of the 3D labels in screen space
  updateLabelPositions();

  // Update animation mixer with its own delta time calculation
  // This ensures animations run at correct speed regardless of shader performance
  if (mixer) {
    const delta = clock.getDelta();
    mixer.update(delta);
  }
}

// Function to create floating control panel for reset view, randomize and export
function createBodyPartLabels() {
  // Remove existing body part labels if any
  document.querySelectorAll(".body-part-label").forEach((label) => {
    if (document.body.contains(label)) {
      document.body.removeChild(label);
    }
  });

  // Remove existing body part container if exists
  const existingContainer = document.getElementById("bodyPartContainer");
  if (existingContainer) {
    document.body.removeChild(existingContainer);
  }

  // Ensure styles are loaded
  ensureStylesheetsLoaded();

  // Create new buttons in 3D space
  Object.keys(bodyParts).forEach((partName) => {
    // Create button element
    const button = document.createElement("div");
    button.className = "body-part-label";
    button.id = `label-${partName}`;

    // Format button text (e.g., "leftArm" -> "Bras Gauche" instead of "Gauche Bras")
    let formattedName = partName;

    // First convert the part name to proper words
    if (partName.includes("left")) {
      if (partName.includes("Arm")) {
        formattedName = "Bras Gauche"; // Changed from "Gauche Bras" to "Bras Gauche"
      } else if (partName.includes("Leg")) {
        formattedName = "Jambe Gauche"; // Changed from "Gauche Jambe" to "Jambe Gauche"
      } else {
        formattedName = "Gauche"; // Keep "Gauche" for other parts
      }
    } else if (partName.includes("right")) {
      if (partName.includes("Arm")) {
        formattedName = "Bras Droit"; // Changed from "Droit Bras" to "Bras Droit"
      } else if (partName.includes("Leg")) {
        formattedName = "Jambe Droite"; // Changed from "Droit Jambe" to "Jambe Droite" (using feminine form)
      } else {
        formattedName = "Droit"; // Keep "Droit" for other parts
      }
    } else if (partName === "head") {
      formattedName = "Tête";
    } else if (partName === "torso") {
      formattedName = "Torse";
    }

    button.textContent = formattedName.trim();

    // If character is rigged, make buttons visually inactive
    if (isRigged) {
      button.classList.add("disabled-label");
      button.style.opacity = "0";
      button.style.pointerEvents = "none"; // This makes the button unclickable
    } else {
      // Add click event only when character is not rigged
      button.addEventListener("click", (e) => {
        e.preventDefault();
        updateSelectedBodyPart(partName);
        focusOnBodyPart(partName);
      });
    }

    document.body.appendChild(button);
  });

  // Create simplified randomize button with new styling, but only if not rigged
  if (!isRigged) {
    const randomizeButton = document.createElement("div");
    randomizeButton.id = "randomizeAllButton";
    randomizeButton.classList.add("simple-randomize-button");
    randomizeButton.textContent = "Aléatoire";

    // Add transition for smooth fade in/out
    randomizeButton.style.transition = "opacity 0.3s ease";

    // Add click event
    randomizeButton.addEventListener("click", randomizeAllBodyParts);

    document.body.appendChild(randomizeButton);

    // Ensure it's visible
    setTimeout(() => {
      randomizeButton.style.opacity = "1";
    }, 10);
  }

  // Replace control panel with a styled "Continuer" button
  const rigButton = document.createElement("div");
  rigButton.id = "continueButton";
  rigButton.classList.add("simple-continue-button");
  rigButton.textContent = "Continuer";

  // Add click event for rigging
  rigButton.addEventListener("click", () => {
    autoRigCharacter();
  });

  document.body.appendChild(rigButton);

  // Remove the old control panel if it exists
  const existingPanel = document.getElementById("controlPanel");
  if (existingPanel) {
    document.body.removeChild(existingPanel);
  }

  // If the character is already rigged, add the export button
  if (isRigged) {
    const exportButton = document.createElement("div");
    exportButton.id = "exportButton";
    exportButton.classList.add("simple-export-button");
    exportButton.textContent = "Exporter";
    exportButton.addEventListener("click", exportToGLB);
    document.body.appendChild(exportButton);

    // Also add the unrig button if character is rigged
    createUnrigButton();
  }
}

// Function to update label positions based on 3D projection
function updateLabelPositions() {
  // If character is rigged, don't update label positions (they're hidden)
  if (isRigged) return;

  Object.keys(bodyParts).forEach((partName) => {
    const label = document.getElementById(`label-${partName}`);
    if (!label) return;

    const position = bodyParts[partName].uiPosition.clone();

    // Convert the 3D position to screen coordinates
    const vector = position.clone();
    vector.project(camera);

    // Convert the normalized device coordinates to CSS pixels
    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-(vector.y * 0.5) + 0.5) * window.innerHeight;

    // Check if the point is in front of the camera (z between -1 and 1)
    if (vector.z > -1 && vector.z < 1) {
      label.style.display = "block";
      // We need to include the translate in our transform to offset the element correctly
      label.style.transform = `translate(-50%, -50%)`;
      label.style.left = `${x}px`;
      label.style.top = `${y}px`;

      // Optional: Scale based on distance to create perspective effect
      const scale = 1 + (1 - Math.abs(vector.z)) * 0.2;
      label.style.fontSize = `${Math.max(12, 14 * scale)}px`;

      // Optional: Adjust opacity based on distance
      const opacity = Math.min(1, Math.max(0.3, 1 - Math.abs(vector.z) * 0.5));
      if (!label.classList.contains("selected-part")) {
        label.style.opacity = opacity.toString();
      }
    } else {
      // Hide label if it's behind the camera
      label.style.display = "none";
    }
  });
}

// Function to auto-rig character with loaded armature
function autoRigCharacter() {
  if (!armature) {
    showNotification("Armature not loaded. Loading now...", "info");
    loadArmature();
    return;
  }

  // Completely remove the randomize button when rigging the character
  const randomizeButton = document.getElementById("randomizeAllButton");
  if (randomizeButton && document.body.contains(randomizeButton)) {
    // First fade it out for visual smoothness
    randomizeButton.style.opacity = "0";

    // Then completely remove it from the DOM
    setTimeout(() => {
      if (document.body.contains(randomizeButton)) {
        document.body.removeChild(randomizeButton);
      }
    }, 300);
  }

  // Create a loading indicator
  const riggingDiv = document.createElement("div");
  riggingDiv.id = "rigging-progress";
  riggingDiv.classList.add("loading-indicator");
  riggingDiv.textContent = "Building unified character mesh...";
  document.body.appendChild(riggingDiv);

  // Store the original body parts before rigging
  window.originalBodyPartMeshes = JSON.parse(JSON.stringify(bodyPartMeshes));

  // First load the reference armature, then rig
  loadReferenceArmature()
    .then((referenceData) => {
      try {
        // First, merge all body parts into a single coherent character
        const unifiedCharacter = createUnifiedCharacterMesh();

        // Then apply the armature to the unified character, using reference data
        applyArmatureToCharacter(unifiedCharacter, referenceData);

        // Set isRigged flag to true
        isRigged = true;

        // Disable and hide body part labels
        document.querySelectorAll(".body-part-label").forEach((label) => {
          label.classList.add("disabled-label");
          label.style.opacity = "0"; // Make completely invisible
          label.style.pointerEvents = "none"; // Prevent clicks
        });

        // Remove rigging indicator
        document.body.removeChild(riggingDiv);

        showNotification("Character successfully rigged!", "success");

        // Remove the "Continue" button as it's no longer needed
        const continueButton = document.getElementById("continueButton");
        if (continueButton) {
          continueButton.style.opacity = "0";
          setTimeout(() => {
            if (document.body.contains(continueButton)) {
              document.body.removeChild(continueButton);
            }
          }, 300);
        }

        // Add export button
        setTimeout(() => {
          const exportButton = document.createElement("div");
          exportButton.id = "exportButton";
          exportButton.classList.add("simple-export-button");
          exportButton.textContent = "Exporter";
          exportButton.addEventListener("click", exportToGLB);
          document.body.appendChild(exportButton);
        }, 300);

        // Show animation controls - with auto-play of first animation
        createAnimationControls();

        // Show animation instruction text after rigging is complete
        createAnimationInstructionBlock();

        // Auto-play the first animation after a short delay
        setTimeout(() => {
          if (animations.length > 0) {
            playDanceAnimation(0);
            showNotification(
              "Dance animation started automatically!",
              "success"
            );
          }
        }, 800);

        // Hide instruction block when character is rigged
        const instructionBlock = document.getElementById("instructionBlock");
        if (instructionBlock) {
          instructionBlock.style.opacity = "0";
        }
      } catch (error) {
        document.body.removeChild(riggingDiv);
        console.error("Error during auto-rigging:", error);
        showNotification(
          "Failed to auto-rig character: " + error.message,
          "error"
        );
      }
    })
    .catch((error) => {
      document.body.removeChild(riggingDiv);
      console.error("Error loading reference:", error);
      showNotification(
        "Failed to load reference armature. Attempting standard rigging.",
        "warning"
      );

      // Fallback to standard rigging
      try {
        const unifiedCharacter = createUnifiedCharacterMesh();
        applyArmatureToCharacter(unifiedCharacter);
        isRigged = true;
        createAnimationControls();
      } catch (e) {
        console.error("Fallback rigging failed:", e);
        showNotification("Rigging failed completely: " + e.message, "error");
      }
    });
}

// Function to unrig the character and restore original body parts
function unrigCharacter() {
  if (!isRigged) {
    showNotification("Character is not rigged", "warning");
    return;
  }

  // Create a loading indicator
  const unriggingDiv = document.createElement("div");
  unriggingDiv.id = "unrigging-progress";
  unriggingDiv.classList.add("loading-indicator");
  unriggingDiv.textContent = "Unrigging character...";
  document.body.appendChild(unriggingDiv);

  try {
    // Stop any playing animation
    if (currentAnimation) {
      currentAnimation.stop();
      currentAnimation = null;
    }

    // Remove the rigged character from the scene
    scene.traverse((node) => {
      if (node.name === "riggedCharacter") {
        scene.remove(node);
      }
    });

    // Clear the mixer
    if (mixer) {
      mixer.stopAllAction();
      mixer = null;
    }

    // Restore original body parts from before rigging
    Object.entries(bodyPartMeshes).forEach(([partName, partData]) => {
      // Re-create the original models and add them back to the scene
      loadBodyPartModel(partName, bodyParts[partName].type);
    });

    // Set rigged state to false
    isRigged = false;

    // Remove any existing body part labels before recreating them
    document.querySelectorAll(".body-part-label").forEach((label) => {
      if (document.body.contains(label)) {
        document.body.removeChild(label);
      }
    });

    // Re-create body part labels (which will also create the randomize button since isRigged is now false)
    createBodyPartLabels();

    // Remove animation controls
    const animationButtons = document.querySelectorAll(".animation-button");
    animationButtons.forEach((button) => {
      if (document.body.contains(button)) {
        document.body.removeChild(button);
      }
    });

    // Remove export button
    const exportButton = document.getElementById("exportButton");
    if (exportButton) {
      document.body.removeChild(exportButton);
    }

    // Remove unrig button
    const unrigButton = document.getElementById("unrigButton");
    if (unrigButton) {
      document.body.removeChild(unrigButton);
    }

    // Add back the continue button
    const continueButton = document.getElementById("continueButton");
    if (!continueButton) {
      const rigButton = document.createElement("div");
      rigButton.id = "continueButton";
      rigButton.classList.add("simple-continue-button");
      rigButton.textContent = "Continuer";

      // Add click event for rigging
      rigButton.addEventListener("click", () => {
        autoRigCharacter();
      });

      document.body.appendChild(rigButton);
    }

    // Show the randomize button again
    const randomizeButton = document.getElementById("randomizeAllButton");
    if (randomizeButton) {
      // First ensure it exists in the DOM and set its display property
      randomizeButton.style.display = "block";

      // Then fade it in after a short delay to ensure the display property has been applied
      setTimeout(() => {
        if (document.body.contains(randomizeButton)) {
          randomizeButton.style.opacity = "1";
        }
      }, 10);
    } else {
      // If the button doesn't exist (first time unrigging), create it
      const newRandomizeButton = document.createElement("div");
      newRandomizeButton.id = "randomizeAllButton";
      newRandomizeButton.classList.add("simple-randomize-button");
      newRandomizeButton.textContent = "Aléatoire";
      newRandomizeButton.style.transition = "opacity 0.3s ease";
      newRandomizeButton.addEventListener("click", randomizeAllBodyParts);

      document.body.appendChild(newRandomizeButton);

      // Fade it in
      setTimeout(() => {
        newRandomizeButton.style.opacity = "1";
      }, 10);
    }

    // Hide animation instruction block when unrigging
    const animationInstructionBlock = document.getElementById(
      "animationInstructionBlock"
    );
    if (animationInstructionBlock) {
      animationInstructionBlock.style.opacity = "0";
      setTimeout(() => {
        if (document.body.contains(animationInstructionBlock)) {
          document.body.removeChild(animationInstructionBlock);
        }
      }, 300);
    }

    // Show instruction block again when unrigging
    setTimeout(() => {
      const instructionBlock = document.getElementById("instructionBlock");
      if (instructionBlock) {
        instructionBlock.style.opacity = "1";
      } else {
        createInstructionBlock();
      }
    }, 500);

    // Remove the unrigging indicator
    document.body.removeChild(unriggingDiv);

    showNotification("Character successfully unrigged!", "success");
  } catch (error) {
    // Remove the unrigging indicator
    if (document.body.contains(unriggingDiv)) {
      document.body.removeChild(unriggingDiv);
    }

    console.error("Error during unrigging:", error);
    showNotification("Failed to unrig character: " + error.message, "error");
  }
}

// Function to create an unrig button using the CSS class
function createUnrigButton() {
  // Remove existing unrig button if there is one
  const existingUnrigButton = document.getElementById("unrigButton");
  if (existingUnrigButton) {
    document.body.removeChild(existingUnrigButton);
  }

  // Create unrig button with CSS styling
  const unrigButton = document.createElement("div");
  unrigButton.id = "unrigButton";

  // Use dedicated CSS class for styling
  unrigButton.classList.add("unrig-button");

  // Add transition for smooth fade in/out
  unrigButton.style.transition = "opacity 0.3s ease";

  // Set the bottom position directly in the inline style
  unrigButton.style.bottom = "5%"; // Set bottom position explicitly

  unrigButton.textContent = "Remodifier";

  // Add click event
  unrigButton.addEventListener("click", () => {
    unrigCharacter();
  });

  document.body.appendChild(unrigButton);
}

// Add function to load reference armature for alignment info
function loadReferenceArmature() {
  return new Promise((resolve, reject) => {
    const fbxLoader = new FBXLoader();
    fbxLoader.load(
      "../asset/body rig/armature_reference.fbx",
      (reference) => {
        console.log("Reference armature loaded successfully");

        // Extract useful information from the reference
        const refData = {};
        reference.traverse((node) => {
          if (node.isBone) {
            refData[node.name] = {
              matrix: node.matrix.clone(),
              quaternion: node.quaternion.clone(),
              position: node.position.clone(),
              rotation: node.rotation.clone(),
              worldMatrix: node.matrixWorld.clone(),
            };
          }
        });

        resolve(refData);
      },
      undefined,
      (error) => {
        console.error("Error loading reference armature:", error);
        reject(error);
      }
    );
  });
}

// Helper function to create a unified character mesh from all body parts
function createUnifiedCharacterMesh() {
  console.log(
    "Creating unified character mesh with preserved scales and positions..."
  );

  // Create a group to hold all the body parts
  const unifiedCharacter = new THREE.Group();
  unifiedCharacter.name = "unifiedCharacter";

  // Keep track of individual meshes for potential texture updates later
  const allMeshes = [];

  // Define default positions for each body part to ensure proper placement
  const defaultPositions = {
    head: new THREE.Vector3(0, 0, 0),
    torso: new THREE.Vector3(0, 0, 0),
    leftArm: new THREE.Vector3(0, 0, 0),
    rightArm: new THREE.Vector3(0, 0, 0),
    leftLeg: new THREE.Vector3(0, 0, 0),
    rightLeg: new THREE.Vector3(0, 0, 0),
  };

  const defaultScales = {
    head: new THREE.Vector3(1, 1, 1),
    torso: new THREE.Vector3(1, 1, 1),
    leftArm: new THREE.Vector3(1, 1, 1),
    rightArm: new THREE.Vector3(1, 1, 1),
    leftLeg: new THREE.Vector3(1, 1, 1),
    rightLeg: new THREE.Vector3(1, 1, 1),
  };

  // Store original positions and scales of all body parts before moving them
  const originalTransforms = {};

  Object.entries(bodyPartMeshes).forEach(([partName, partData]) => {
    if (partData && partData.model) {
      // Store original position, rotation and scale
      originalTransforms[partName] = {
        position: partData.model.position.clone(),
        rotation: partData.model.rotation.clone(),
        scale: partData.model.scale.clone(),
        worldMatrix: partData.model.matrixWorld.clone(),
      };
    }
  });

  // Now add body parts to unified character with consistent transforms
  Object.entries(bodyPartMeshes).forEach(([partName, partData]) => {
    if (partData && partData.model) {
      // Remove the original model from the scene
      scene.remove(partData.model);

      // Clone the model to add to our unified character
      const modelClone = partData.model.clone();

      // Set position based on our predefined positions (more reliable than original transforms)
      modelClone.position.copy(
        defaultPositions[partName] || new THREE.Vector3(0, 0, 0)
      );
      // Keep original rotation
      if (originalTransforms[partName]) {
        modelClone.rotation.copy(originalTransforms[partName].rotation);
      }
      // Use a consistent scale to avoid the scaling issues
      modelClone.scale.copy(
        defaultScales[partName] || new THREE.Vector3(1, 1, 1)
      );

      // Store the original transforms in userData for reference
      modelClone.userData.originalTransform = originalTransforms[partName];

      // Set the name of the model to ensure we can identify it
      modelClone.name = partName;

      // Add the model to the unified character
      unifiedCharacter.add(modelClone);

      // Record all meshes for potential texture updates
      modelClone.traverse((child) => {
        if (child.isMesh) {
          child.userData.bodyPart = partName;
          allMeshes.push(child);

          // Ensure each mesh knows which body part it belongs to
          child.name = partName;
        }
      });
    }
  });

  // Position the unified character at the origin
  unifiedCharacter.position.set(0, 0, 0);
  // Ensure uniform scale
  unifiedCharacter.scale.set(1, 1, 1);

  // Add the unified character to the scene
  scene.add(unifiedCharacter);

  console.log(`Created unified character with ${allMeshes.length} meshes`);

  return {
    group: unifiedCharacter,
    meshes: allMeshes,
    originalTransforms: originalTransforms,
  };
}

// Helper function to apply armature to the unified character
function applyArmatureToCharacter(unifiedCharacter, referenceData = null) {
  console.log("Applying armature to unified character...");

  // Create a group for the rigged character
  const riggedCharacter = new THREE.Group();
  riggedCharacter.name = "riggedCharacter";

  // Clone the armature for use with this character
  const riggedArmature = armature.clone();
  riggedArmature.position.set(0, 0, 0);

  // Increase the scale of the armature by 100 times from the original 0.01
  // This fixes the issue where dance animations are scaled down by 100x
  riggedArmature.scale.set(1, 1, 1); // Change from 0.01 to 1 (100x increase)

  // Add the armature to our rigged character group
  riggedCharacter.add(riggedArmature);

  // Set up animation references
  Object.keys(armatureNameMapping).forEach((armatureName) => {
    const referenceObj = new THREE.Object3D();
    referenceObj.name = armatureName;
    riggedCharacter.add(referenceObj);

    const targetBoneName = armatureNameMapping[armatureName];
    let targetBone = null;

    riggedArmature.traverse((bone) => {
      if (bone.isBone && bone.name.includes(targetBoneName)) {
        targetBone = bone;
        referenceObj.userData.targetBone = bone;
      }
    });

    if (targetBone) {
      referenceObj.position.copy(targetBone.position);
      referenceObj.quaternion.copy(targetBone.quaternion);
      referenceObj.scale.copy(targetBone.scale);
    }
  });

  // Get the unified character from the creation function
  const characterGroup = unifiedCharacter.group;
  const characterMeshes = unifiedCharacter.meshes;
  const originalTransforms = unifiedCharacter.originalTransforms;

  // Remove the unified character from the scene since we'll add it to the rigged character
  scene.remove(characterGroup);

  // Create a map of bone names to body parts and their specific attachments
  const boneToPartMap = {
    Hips: {
      part: "torso",
      offset: new THREE.Vector3(0, 0, 0),
    },
    Spine: {
      part: "torso",
      offset: new THREE.Vector3(0, 0, 0),
    },
    Head: {
      part: "head",
      offset: new THREE.Vector3(0, 0, 0),
    },
    LeftArm: {
      part: "leftArm",
      offset: new THREE.Vector3(0, 0.2, 0),
      meshRotation: new THREE.Euler(Math.PI, 0, 0),
    },
    RightArm: {
      part: "rightArm",
      offset: new THREE.Vector3(0, 0.2, 0),
      meshRotation: new THREE.Euler(Math.PI, 0, 0),
    },
    LeftUpLeg: {
      part: "leftLeg",
      offset: new THREE.Vector3(0, 0.1, 0),
      // Using zero rotation since we'll use bindMatrix instead of explicit rotation
      meshRotation: new THREE.Euler(0, 0, 0),
    },
    RightUpLeg: {
      part: "rightLeg",
      offset: new THREE.Vector3(0, 0.1, 0),
      // Using zero rotation since we'll use bindMatrix instead of explicit rotation
      meshRotation: new THREE.Euler(0, 0, 0),
    },
  };

  // Create a map for mixamo-named bones with the same offsets
  const mixamoBoneMap = {};
  Object.entries(boneToPartMap).forEach(([boneName, data]) => {
    mixamoBoneMap[`mixamorig${boneName}`] = data;
  });

  // Group meshes by body part to ensure we attach all meshes of a part to the same bone
  const meshGroups = {};
  characterMeshes.forEach((mesh) => {
    const bodyPart = mesh.userData.bodyPart;
    if (!meshGroups[bodyPart]) {
      meshGroups[bodyPart] = [];
    }
    meshGroups[bodyPart].push(mesh);
  });

  // Add all body parts to appropriate bones on the armature
  Object.entries(meshGroups).forEach(([bodyPart, meshes]) => {
    // Determine which bone this body part should be attached to
    let targetBone = null;
    let offsetPosition = new THREE.Vector3(0, 0, 0);
    let meshRotation = null;
    let isLeg = bodyPart === "leftLeg" || bodyPart === "rightLeg";

    // Search for the appropriate bone
    riggedArmature.traverse((bone) => {
      if (!bone.isBone) return;

      const boneName = bone.name;

      // Check direct mapping first
      if (
        boneToPartMap[boneName] &&
        boneToPartMap[boneName].part === bodyPart
      ) {
        targetBone = bone;
        offsetPosition =
          boneToPartMap[boneName].offset || new THREE.Vector3(0, 0, 0);
        meshRotation = boneToPartMap[boneName].meshRotation;
      }
      // Then check mixamo naming
      else if (
        mixamoBoneMap[boneName] &&
        mixamoBoneMap[boneName].part === bodyPart
      ) {
        targetBone = bone;
        offsetPosition =
          mixamoBoneMap[boneName].offset || new THREE.Vector3(0, 0, 0);
        meshRotation = mixamoBoneMap[boneName].meshRotation;
      }
      // Finally check if the bone name contains the part name
      else if (
        boneName.includes(bodyPart) ||
        (bodyPart === "leftArm" && boneName.includes("LeftArm")) ||
        (bodyPart === "rightArm" && boneName.includes("RightArm")) ||
        (bodyPart === "leftLeg" && boneName.includes("LeftUpLeg")) ||
        (bodyPart === "rightLeg" && boneName.includes("RightUpLeg"))
      ) {
        targetBone = bone;

        if (bodyPart === "leftArm" || bodyPart === "rightArm") {
          meshRotation = new THREE.Euler(Math.PI, 0, 0);
        } else if (bodyPart === "leftLeg" || bodyPart === "rightLeg") {
          // For legs, we'll set up special handling
          isLeg = true;
        }
      }
    });

    if (targetBone) {
      console.log(`Attaching ${bodyPart} to bone: ${targetBone.name}`);

      // Get reference data for this bone if available
      const refBoneData = referenceData && referenceData[targetBone.name];

      if (isLeg) {
        // Special case for legs
        const legContainer = new THREE.Group();
        legContainer.name = `${bodyPart}Container`;

        // Apply position offset
        legContainer.position.copy(offsetPosition);

        // Add container directly to bone without setting rotation
        targetBone.add(legContainer);

        // For legs, use a special attachment method
        const meshContainer = new THREE.Group();
        meshContainer.name = `${bodyPart}MeshGroup`;

        // Set up transformation for legs that doesn't affect bone animation
        if (bodyPart === "leftLeg") {
          // For left leg - Add rotation needed for alignment
          meshContainer.rotation.set(Math.PI, Math.PI, 0);
        } else if (bodyPart === "rightLeg") {
          // For right leg - Add rotation needed for alignment
          meshContainer.rotation.set(Math.PI, Math.PI, 0);
        }

        // Add meshes to mesh container
        meshes.forEach((mesh) => {
          if (mesh.parent) {
            mesh.parent.remove(mesh);
          }
          mesh.position.set(0, 0, 0);
          meshContainer.add(mesh);
        });

        // Add mesh container to leg container
        legContainer.add(meshContainer);

        console.log(`Applied special leg handling for ${bodyPart}`);
      } else {
        // For non-leg parts, use standard attachment
        const container = new THREE.Group();
        container.name = `${bodyPart}Container`;

        // Apply position offset
        container.position.copy(offsetPosition);

        // Add to bone
        targetBone.add(container);

        // Apply mesh rotation if needed
        if (meshRotation) {
          const rotationContainer = new THREE.Group();
          rotationContainer.name = `${bodyPart}RotationGroup`;
          rotationContainer.rotation.copy(meshRotation);
          container.add(rotationContainer);

          // Add meshes to rotation container
          meshes.forEach((mesh) => {
            if (mesh.parent) {
              mesh.parent.remove(mesh);
            }
            mesh.position.set(0, 0, 0);
            rotationContainer.add(mesh);
          });

          console.log(
            `Applied rotation for ${bodyPart}: (${meshRotation.x}, ${meshRotation.y}, ${meshRotation.z})`
          );
        } else {
          // Add meshes directly to container if no rotation needed
          meshes.forEach((mesh) => {
            if (mesh.parent) {
              mesh.parent.remove(mesh);
            }
            container.add(mesh);
          });
        }
      }

      console.log(
        `Successfully attached ${meshes.length} meshes for ${bodyPart}`
      );
    } else {
      // Fallback code for when no matching bone is found
      console.warn(`Could not find bone for ${bodyPart}, adding to root`);

      const fallbackGroup = new THREE.Group();
      fallbackGroup.name = `${bodyPart}Fallback`;

      meshes.forEach((mesh) => {
        if (mesh.parent) {
          mesh.parent.remove(mesh);
        }
        fallbackGroup.add(mesh);
      });

      riggedCharacter.add(fallbackGroup);
    }
  });

  // Add the rigged character to the scene
  scene.add(riggedCharacter);

  // Set up animation mixer on the armature
  mixer = new THREE.AnimationMixer(riggedArmature);

  // Load animations
  loadDanceAnimations();

  // Store the rigged character for exporting with animation later
  window.riggedCharacterForExport = riggedCharacter;

  // Add an unrig button now that character is rigged
  createUnrigButton();

  return riggedCharacter;
}

// Function to normalize skeleton weights to prevent warnings
function normalizeSkeletonWeights(object) {
  object.traverse((node) => {
    if (node.isSkinnedMesh && node.geometry && node.geometry.attributes) {
      const skinWeights = node.geometry.attributes.skinWeight;
      if (skinWeights) {
        // Process each vertex's weights
        for (let i = 0; i < skinWeights.count; i++) {
          // Get the 4 skin weights for this vertex
          let w1 = skinWeights.getX(i);
          let w2 = skinWeights.getY(i);
          let w3 = skinWeights.getZ(i);
          let w4 = skinWeights.getW(i);

          // Normalize weights so they sum to 1
          const sum = w1 + w2 + w3 + w4;
          if (sum > 0) {
            // Avoid division by zero
            w1 = w1 / sum;
            w2 = w2 / sum;
            w3 = w3 / sum;
            w4 = w4 / sum;

            // Update the weights
            skinWeights.setXYZW(i, w1, w2, w3, w4);
          }
        }

        // Mark the attribute as needing update
        skinWeights.needsUpdate = true;
      }
    }
  });
}

// Function to load armature from FBX file
function loadArmature() {
  // Create a loading indicator
  const loadingDiv = document.createElement("div");
  loadingDiv.id = "armature-loading";
  loadingDiv.classList.add("loading-indicator");
  loadingDiv.textContent = "Loading armature...";
  document.body.appendChild(loadingDiv);

  const fbxLoader = new FBXLoader();
  const armaturePath = "../asset/body rig/armature.fbx";

  fbxLoader.load(
    armaturePath,
    function (fbx) {
      // Remove loading indicator
      document.body.removeChild(loadingDiv);

      // Process the armature to normalize weights
      normalizeSkeletonWeights(fbx);

      // Store the loaded armature
      armature = fbx;

      // Log bone names for debugging
      armature.traverse((child) => {
        if (child.isBone) {
          console.log(`Bone loaded: ${child.name}`);
        }
      });

      showNotification("Armature loaded successfully!", "success");

      // Continue with auto-rigging since armature is now loaded
      autoRigCharacter();
    },
    function (xhr) {
      // Loading progress
      const progress = Math.floor((xhr.loaded / xhr.total) * 100);
      loadingDiv.textContent = `Loading armature: ${progress}%`;
    },
    function (error) {
      // Remove loading indicator
      document.body.removeChild(loadingDiv);
      console.error("Error loading armature:", error);
      showNotification("Failed to load armature: " + error.message, "error");
    }
  );
}

// Function to load dance animations from FBX files
function loadDanceAnimations() {
  // Create a notification
  showNotification("Loading dance animations...", "info");

  // Track loading progress
  let loadedCount = 0;
  const totalAnimations = danceAnimations.length;

  // Clear existing animations
  animations = [];

  // Load each animation from FBX file
  danceAnimations.forEach((danceData, index) => {
    const fbxLoader = new FBXLoader();

    fbxLoader.load(
      danceData.path,
      (fbx) => {
        console.log(`Loaded animation: ${danceData.name}`);

        // Normalize skinning weights in animation models too
        normalizeSkeletonWeights(fbx);

        // Extract animation clips
        if (fbx.animations && fbx.animations.length > 0) {
          const clip = fbx.animations[0];
          console.log(`Animation clip name: ${clip.name}`);
          console.log(`Animation duration: ${clip.duration} seconds`);
          console.log(`Animation tracks: ${clip.tracks.length}`);

          // Store the animation
          animations.push({
            name: danceData.name,
            clip: retargetAnimation(clip), // Retarget animation to match armature
          });

          console.log(`Successfully added animation: ${danceData.name}`);
        } else {
          console.warn(`No animations found in ${danceData.path}`);
        }

        // Update progress
        loadedCount++;
        if (loadedCount === totalAnimations) {
          showNotification("All dance animations loaded!", "success");

          // If no animations were found, create simple ones
          if (animations.length === 0) {
            createFallbackAnimations();
          }

          // Update animation controls with newly loaded animations
          if (isRigged) {
            createAnimationControls();

            // Auto-select the first animation to get things going immediately
            setTimeout(() => {
              if (animations.length > 0) {
                playDanceAnimation(0);
              }
            }, 500);
          }
        }
      },
      (xhr) => {
        // Progress indication
        const percentage = Math.floor((xhr.loaded / xhr.total) * 100);
        console.log(`Loading ${danceData.name}: ${percentage}%`);
      },
      (error) => {
        console.error(`Error loading animation ${danceData.name}:`, error);

        // Update progress even on error
        loadedCount++;
        if (loadedCount === totalAnimations) {
          // If we failed to load any animations, create simple ones
          if (animations.length === 0) {
            createFallbackAnimations();
          }

          // Update animation controls with fallback animations
          if (isRigged) {
            createAnimationControls();

            // Auto-select the first animation
            setTimeout(() => {
              if (animations.length > 0) {
                playDanceAnimation(0);
              }
            }, 500);
          }
        }
      }
    );
  });
}

// Add the missing playDanceAnimation function
function playDanceAnimation(animationIndex) {
  if (!mixer || !isRigged) {
    showNotification(
      "Character must be rigged before playing animations",
      "warning"
    );
    return;
  }

  // Stop any currently playing animation
  if (currentAnimation) {
    currentAnimation.stop();
    currentAnimation = null;
  }

  if (animationIndex >= 0 && animationIndex < animations.length) {
    const animation = animations[animationIndex];
    console.log(`Playing animation: ${animation.name}`);

    try {
      // Handle fallback animations
      if (animation.type === "fallback") {
        createAndPlaySimpleAnimation(animation.index);
        updateAnimationButtonStyles(animationIndex);
        return;
      }

      // Apply the animation to the mixer
      if (animation.clip) {
        currentAnimation = mixer.clipAction(animation.clip);

        // Configure the animation
        currentAnimation.setLoop(THREE.LoopRepeat);
        currentAnimation.clampWhenFinished = false;
        currentAnimation.timeScale = 1.0;

        // Reset and fade in the animation
        currentAnimation.reset();
        currentAnimation.fadeIn(0.5);
        currentAnimation.play();

        // Update UI styles to highlight current animation
        updateAnimationButtonStyles(animationIndex);

        showNotification(`Playing: ${animation.name}`, "success");
      } else {
        createAndPlaySimpleAnimation(animationIndex);
        showNotification(
          `Using fallback animation for ${animation.name}`,
          "info"
        );
      }
    } catch (error) {
      console.error("Error playing animation:", error);
      showNotification("Animation error: " + error.message, "error");

      // Use fallback if regular animation fails
      createAndPlaySimpleAnimation(animationIndex);
    }
  } else {
    showNotification("Animation not found", "error");
  }
}

// Function to update animation button styles to highlight current animation
function updateAnimationButtonStyles(activeIndex) {
  const buttons = document.querySelectorAll(".animation-button");

  buttons.forEach((button) => {
    // Skip stop button
    if (button.classList.contains("stop-button")) return;

    const buttonIndex = parseInt(button.getAttribute("data-index"));

    if (buttonIndex === activeIndex) {
      button.classList.add("animation-active");
    } else {
      button.classList.remove("animation-active");
    }
  });
}

// Function to create and play a simple animation as fallback
function createAndPlaySimpleAnimation(danceNumber) {
  if (!mixer) return;

  console.log(`Creating simple fallback animation for dance ${danceNumber}`);

  try {
    // Find bones to animate
    const bones = [];
    let rootBone = null;

    // Find bones in the scene
    scene.traverse((node) => {
      if (node.isBone) {
        bones.push(node);
        if (node.name.includes("Hips") || node.name.includes("Root")) {
          rootBone = node;
        }
      }
    });

    if (bones.length === 0) {
      showNotification("No bones found for animation", "error");
      return;
    }

    // Create simple animation parameters
    const times = [0, 0.5, 1, 1.5, 2];
    const values = [];

    // Create different dance movements based on the dance number
    for (let t = 0; t < times.length; t++) {
      const factor = (danceNumber + 1) * 0.1;
      const angleY = Math.sin(t * Math.PI) * factor;
      const angleX = Math.sin(t * Math.PI * 2) * factor * 0.5;
      const angleZ = Math.cos(t * Math.PI * 2) * factor * 0.25;

      // Create a quaternion for this rotation
      const quat = new THREE.Quaternion();
      quat.setFromEuler(new THREE.Euler(angleX, angleY, angleZ));
      values.push(quat.x, quat.y, quat.z, quat.w);
    }

    // Create animation tracks
    const tracks = [];

    // Add a track for the root bone
    if (rootBone) {
      // Rotation track
      const rotTrack = new THREE.QuaternionKeyframeTrack(
        `${rootBone.name}.quaternion`,
        times,
        values
      );
      tracks.push(rotTrack);

      // Add a position track for some bounce
      const posValues = [];
      for (let t = 0; t < times.length; t++) {
        const bounce = Math.abs(Math.sin(t * Math.PI)) * 0.1;
        posValues.push(0, bounce, 0);
      }

      const posTrack = new THREE.VectorKeyframeTrack(
        `${rootBone.name}.position`,
        times,
        posValues
      );
      tracks.push(posTrack);
    }

    // Create animation clip
    const clip = new THREE.AnimationClip(
      `Simple Dance ${danceNumber + 1}`,
      2,
      tracks
    );

    // Play the animation
    currentAnimation = mixer.clipAction(clip);
    currentAnimation.setLoop(THREE.LoopRepeat);
    currentAnimation.play();

    showNotification(`Playing fallback dance ${danceNumber + 1}`, "info");
  } catch (error) {
    console.error("Error creating fallback animation:", error);
    showNotification("Couldn't create fallback animation", "error");
  }
}

// Retarget animation to our armature
function retargetAnimation(clip) {
  console.log("Retargeting animation to match our armature...");

  // Create new tracks array
  const newTracks = [];

  // Track stats
  let matchedTracks = 0;
  let remappedTracks = 0;
  let skippedTracks = 0;

  // Process each animation track
  clip.tracks.forEach((track) => {
    // Parse track name (format: "boneName.property")
    const dotIndex = track.name.indexOf(".");
    if (dotIndex === -1) {
      skippedTracks++;
      return;
    }

    const boneName = track.name.substring(0, dotIndex);
    const property = track.name.substring(dotIndex); // Includes the dot

    // Check if this is an armature we need to remap
    if (armatureNameMapping[boneName]) {
      const targetBoneName = armatureNameMapping[boneName];
      const newName = targetBoneName + property;

      // Create a new track with the updated name
      let newTrack;
      if (track instanceof THREE.QuaternionKeyframeTrack) {
        newTrack = new THREE.QuaternionKeyframeTrack(
          newName,
          track.times.slice(),
          track.values.slice()
        );
      } else if (track instanceof THREE.VectorKeyframeTrack) {
        newTrack = new THREE.VectorKeyframeTrack(
          newName,
          track.times.slice(),
          track.values.slice()
        );
      } else {
        // For other track types (like NumberKeyframeTracks)
        newTrack = track.clone();
        newTrack.name = newName;
      }

      newTracks.push(newTrack);
      remappedTracks++;
    }
    // Otherwise just keep the track as is
    else {
      newTracks.push(track.clone());
      matchedTracks++;
    }
  });

  console.log(
    `Retargeting stats: ${matchedTracks} matched, ${remappedTracks} remapped, ${skippedTracks} skipped`
  );

  // Create a new clip with the retargeted tracks
  return new THREE.AnimationClip(clip.name, clip.duration, newTracks);
}

// Function to create fallback animations if no dance files are found
function createFallbackAnimations() {
  console.warn("Creating fallback animations since no dance files were loaded");

  // Create 3 simple dance animations
  for (let i = 0; i < 3; i++) {
    animations.push({
      name: `Dance ${i + 1} (Fallback)`,
      type: "fallback",
      index: i,
    });
  }

  showNotification("Created fallback dance animations", "info");
}

// Function to export a character with its animations
function exportAnimatedCharacter() {
  if (!isRigged || !window.riggedCharacterForExport) {
    showNotification(
      "Character must be rigged before exporting animations",
      "warning"
    );
    return;
  }

  // Ask user which format they want to export
  const formatDialog = document.createElement("div");
  formatDialog.classList.add("format-dialog");

  const title = document.createElement("h3");
  title.textContent = "Choose Export Format";
  formatDialog.appendChild(title);

  // Create button container for better layout
  const buttonContainer = document.createElement("div");
  buttonContainer.classList.add("button-container");

  const glbButton = document.createElement("button");
  glbButton.textContent = "GLB Format";
  glbButton.classList.add("export-button", "glb-button");
  glbButton.addEventListener("click", () => {
    document.body.removeChild(formatDialog);
    exportToGLTFWithAnimations();
  });
  buttonContainer.appendChild(glbButton);

  const fbxButton = document.createElement("button");
  fbxButton.textContent = "FBX Format";
  fbxButton.classList.add("export-button", "fbx-button");
  fbxButton.addEventListener("click", () => {
    document.body.removeChild(formatDialog);
    exportToFBXWithAnimations();
  });
  buttonContainer.appendChild(fbxButton);

  const cancelButton = document.createElement("button");
  cancelButton.textContent = "Cancel";
  cancelButton.classList.add("export-button", "cancel-button");
  cancelButton.addEventListener("click", () => {
    document.body.removeChild(formatDialog);
  });
  buttonContainer.appendChild(cancelButton);

  formatDialog.appendChild(buttonContainer);
  document.body.appendChild(formatDialog);
}

// Function to export animated character as GLB (existing functionality moved to a separate function)
function exportToGLTFWithAnimations() {
  // Show progress indicator
  const progressDiv = document.createElement("div");
  progressDiv.classList.add("loading-indicator");
  progressDiv.textContent = "Exporting animated character as GLB...";
  document.body.appendChild(progressDiv);

  try {
    // Create a clone of the rigged character
    const riggedCharacter = window.riggedCharacterForExport.clone();

    // Create a GLTFExporter
    const exporter = new GLTFExporter();

    // Add the current animation clip to the export if it exists
    const clips = [];
    if (currentAnimation && currentAnimation.getClip()) {
      clips.push(currentAnimation.getClip());
    } else if (animations.length > 0) {
      // If no current animation, add the first available one
      clips.push(animations[0].clip);
    }

    // Export options with animations included
    const exportOptions = {
      binary: true,
      animations: clips,
      embedImages: true,
      forceIndices: true,
      includeCustomExtensions: false,
      trs: false, // Use matrix transforms
    };

    // Export the character with animations
    exporter.parse(
      riggedCharacter,
      function (gltf) {
        document.body.removeChild(progressDiv); // Remove progress indicator

        if (gltf) {
          const blob = new Blob([gltf], { type: "application/octet-stream" });
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = "animated_character.glb";
          link.click();
          URL.revokeObjectURL(link.href);

          // Display success message
          showNotification(
            "Animated character exported successfully as GLB!",
            "success"
          );
        } else {
          console.error("GLB export failed: No data was generated");
          showNotification("Export failed: No data was generated", "error");
        }
      },
      function (error) {
        document.body.removeChild(progressDiv); // Remove progress indicator
        console.error("Export error:", error);
        showNotification("Export failed: " + error, "error");
      },
      exportOptions
    );
  } catch (e) {
    document.body.removeChild(progressDiv); // Remove progress indicator
    console.error("Export exception:", e);
    showNotification("Export failed: " + e.message, "error");
  }
}

// Function to export animated character as FBX
function exportToFBXWithAnimations() {
  // Show notification
  showNotification("Preparing FBX export...", "info");

  // Create progress indicator
  const progressDiv = document.createElement("div");
  progressDiv.classList.add("loading-indicator");
  progressDiv.textContent = "Exporting animated character as FBX...";
  document.body.appendChild(progressDiv);

  try {
    // Since there's no direct FBX exporter in Three.js, we'll use an alternative approach
    // We'll create a downloadable text file with instructions on how to export from the GLB

    // First export as GLB which we know works
    const riggedCharacter = window.riggedCharacterForExport.clone();
    const exporter = new GLTFExporter();

    // Add the current animation clip to the export
    const clips = [];
    if (currentAnimation && currentAnimation.getClip()) {
      clips.push(currentAnimation.getClip());
    } else if (animations.length > 0) {
      clips.push(animations[0].clip);
    }

    const exportOptions = {
      binary: true,
      animations: clips,
      embedImages: true,
      forceIndices: true,
    };

    exporter.parse(
      riggedCharacter,
      function (gltf) {
        // First save the GLB file
        const glbBlob = new Blob([gltf], { type: "application/octet-stream" });
        const glbLink = document.createElement("a");
        glbLink.href = URL.createObjectURL(glbBlob);
        glbLink.download = "for_conversion_to_fbx.glb";
        glbLink.click();

        // Then create instructions file
        const instructions = `
# Converting GLB to FBX

Since web browsers cannot directly export to FBX format, please follow these steps:

1. Use the saved GLB file "for_conversion_to_fbx.glb"
2. Convert it to FBX using one of these free tools:
   - Blender (free): Import the GLB and export as FBX
   - Online converter: https://www.mixamo.com/#/
   - Online converter: https://products.aspose.app/3d/conversion/glb-to-fbx
   
The GLB file already contains your character with animations!
        `;

        const instructionsBlob = new Blob([instructions], {
          type: "text/plain",
        });
        const instructionsLink = document.createElement("a");
        instructionsLink.href = URL.createObjectURL(instructionsBlob);
        instructionsLink.download = "fbx_conversion_instructions.txt";

        // Remove progress indicator
        document.body.removeChild(progressDiv);

        // Show completion notification
        showNotification(
          "GLB file saved! Downloading conversion instructions...",
          "success"
        );

        // Download instructions
        setTimeout(() => {
          instructionsLink.click();
          URL.revokeObjectURL(instructionsLink.href);
          URL.revokeObjectURL(glbLink.href);
        }, 1000);
      },
      function (error) {
        document.body.removeChild(progressDiv);
        console.error("Export error:", error);
        showNotification("Export failed: " + error, "error");
      },
      exportOptions
    );
  } catch (e) {
    document.body.removeChild(progressDiv);
    console.error("Export exception:", e);
    showNotification("Export failed: " + e.message, "error");
  }
}

// Function to create animation controls UI
function createAnimationControls() {
  // Remove existing controls if any
  const existingControls = document.querySelectorAll(".animation-button");
  existingControls.forEach((control) => {
    if (document.body.contains(control)) {
      document.body.removeChild(control);
    }
  });

  // Check if we have animations
  if (!animations || animations.length === 0) {
    showNotification("No animations available", "warning");
    return;
  }

  // Create independent animation buttons with new styling
  animations.forEach((animation, index) => {
    const button = document.createElement("button");
    button.textContent = animation.name || `Dance ${index + 1}`;
    button.className = "animation-button circular-button";
    button.setAttribute("data-index", index);

    // Position each button individually
    button.style.position = "fixed";
    button.style.top = `${170 + index * 125}px`; // Increased spacing between buttons from 60px to 100px
    button.style.right = "5%";
    button.style.zIndex = "100";

    button.addEventListener("click", () => {
      playDanceAnimation(index);
    });

    document.body.appendChild(button);
  });

  // Create stop button with matching style
  const stopButton = document.createElement("button");
  stopButton.textContent = "Stop";
  stopButton.classList.add(
    "stop-button",
    "circular-button",
    "animation-button"
  );

  // Position stop button at the bottom of the animation buttons with same width
  stopButton.style.position = "fixed";
  stopButton.style.top = `${170 + animations.length * 125}px`; // Updated spacing to match the animation buttons
  stopButton.style.right = "5%";
  stopButton.style.zIndex = "100";
  stopButton.style.width = "auto"; // Let width be determined by content like other buttons

  stopButton.addEventListener("click", () => {
    if (currentAnimation) {
      currentAnimation.stop();
      currentAnimation = null;
      showNotification("Animation stopped", "info");

      // Reset button styles
      const danceButtons = document.querySelectorAll(".animation-button");
      danceButtons.forEach((btn) => {
        if (!btn.classList.contains("stop-button")) {
          btn.classList.remove("animation-active");
        }
      });
    }
  });

  document.body.appendChild(stopButton);

  // Add the custom CSS styles for the buttons
  addAnimationButtonStyles();

  console.log(
    "Animation controls created with",
    animations.length,
    "independent buttons"
  );
}

// Function to add custom styles for animation buttons
function addAnimationButtonStyles() {
  // Ensure animation button styles are loaded
  if (!document.querySelector('link[href*="css/animation-buttons.css"]')) {
    const buttonStyleLink = document.createElement("link");
    buttonStyleLink.id = "animation-button-styles";
    buttonStyleLink.rel = "stylesheet";
    buttonStyleLink.href = "./css/animation-buttons.css";
    document.head.appendChild(buttonStyleLink);
  }

  // Ensure Inter font is loaded
  if (
    !document.querySelector(
      'link[href*="fonts.googleapis.com/css2?family=Inter:wght@300"]'
    )
  ) {
    const fontLink = document.createElement("link");
    fontLink.rel = "stylesheet";
    fontLink.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@300&display=swap";
    document.head.appendChild(fontLink);
  }
}

// Start the application - just create the body directly
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded, starting 3D application");
  initApp();

  // Start both clocks at application initialization
  clock.start();
  shaderClock.start();

  animate();
});

// Export necessary functions and objects
export { initApp, animate };
