import * as THREE from "three";
import { GLTFExporter } from "../node_modules/three/examples/jsm/exporters/GLTFExporter.js";

/**
 * Prepares a mesh for Blender-compatible export
 *
 * @param {THREE.Mesh} originalMesh - The original mesh to prepare
 * @param {String} name - The name for the exported mesh
 * @returns {THREE.Mesh} A new mesh prepared for export
 */
export function prepareForExport(originalMesh, name) {
  // Clone the geometry
  const geometry = originalMesh.geometry.clone();

  // Create a new material that works well in Blender
  const material = new THREE.MeshStandardMaterial({
    color: originalMesh.material.color
      ? originalMesh.material.color.clone()
      : 0xffffff,
    roughness: 0.7,
    metalness: 0.0,
  });

  // Handle texture properly for Blender
  if (originalMesh.material.map) {
    // Get the image data from the original texture
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = originalMesh.material.map.image;

    if (img) {
      // Set canvas dimensions to match the image
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw the image on the canvas
      ctx.drawImage(img, 0, 0);

      // Create a new texture from this canvas
      const newTexture = new THREE.CanvasTexture(canvas);
      newTexture.flipY = false; // Critical for Blender compatibility
      newTexture.wrapS = THREE.RepeatWrapping;
      newTexture.wrapT = THREE.RepeatWrapping;
      newTexture.needsUpdate = true;

      material.map = newTexture;
    }
  }

  // Create the new mesh
  const exportMesh = new THREE.Mesh(geometry, material);
  exportMesh.name = name;
  exportMesh.position.copy(originalMesh.position);
  exportMesh.rotation.copy(originalMesh.rotation);
  exportMesh.scale.copy(originalMesh.scale);

  return exportMesh;
}

/**
 * Exports a group of meshes as a GLB file
 *
 * @param {Object} meshes - Object containing meshes to export
 * @param {Function} onComplete - Callback function when export completes
 * @param {Function} onError - Callback function when export fails
 */
export function exportToGLB(meshes, onComplete, onError) {
  const bodyGroup = new THREE.Group();

  // Process each mesh for better Blender compatibility
  Object.entries(meshes).forEach(([name, mesh]) => {
    const exportMesh = prepareForExport(mesh, name);
    bodyGroup.add(exportMesh);
  });

  const exporter = new GLTFExporter();

  // Enhanced export options for Blender compatibility
  const exportOptions = {
    binary: true,
    embedImages: true,
    forceIndices: true,
    includeCustomExtensions: false,
    onlyVisible: false,
  };

  try {
    exporter.parse(
      bodyGroup,
      function (gltf) {
        if (gltf) {
          const blob = new Blob([gltf], { type: "application/octet-stream" });
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = "custom_body.glb";
          link.click();
          URL.revokeObjectURL(link.href);

          if (onComplete) onComplete();
        } else {
          if (onError) onError("No data was generated");
        }
      },
      function (error) {
        if (onError) onError(error);
      },
      exportOptions
    );
  } catch (e) {
    if (onError) onError(e.message);
  }
}
