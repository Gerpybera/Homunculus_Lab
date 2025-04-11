/**
 * Fallback texture generator for the body customizer application
 *
 * This script creates procedural textures that can be used when
 * actual texture files are not available.
 */

import * as THREE from "three";

// Generate procedural textures for each type
export function generateFallbackTextures() {
  const textures = {};
  const textureSize = 256;

  // Fabric texture (checkered pattern)
  textures.Fabric = createProceduralTexture(textureSize, (ctx) => {
    const squareSize = 16;
    for (let x = 0; x < textureSize; x += squareSize) {
      for (let y = 0; y < textureSize; y += squareSize) {
        const isEven =
          Math.floor(x / squareSize) % 2 === Math.floor(y / squareSize) % 2;
        ctx.fillStyle = isEven ? "#e0e0e0" : "#a0a0a0";
        ctx.fillRect(x, y, squareSize, squareSize);
      }
    }
  });

  // Metal texture (gradients with highlights)
  textures.Metal = createProceduralTexture(textureSize, (ctx) => {
    const gradient = ctx.createLinearGradient(0, 0, textureSize, textureSize);
    gradient.addColorStop(0, "#909090");
    gradient.addColorStop(0.5, "#d0d0d0");
    gradient.addColorStop(1, "#808080");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, textureSize, textureSize);

    // Add some scratches
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      const x1 = Math.random() * textureSize;
      const y1 = Math.random() * textureSize;
      const x2 = x1 + (Math.random() - 0.5) * 100;
      const y2 = y1 + (Math.random() - 0.5) * 100;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  });

  // Wood texture (lines)
  textures.Wood = createProceduralTexture(textureSize, (ctx) => {
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(0, 0, textureSize, textureSize);

    ctx.strokeStyle = "#603000";
    for (let i = 0; i < textureSize; i += 8) {
      ctx.beginPath();
      ctx.lineWidth = 1;
      ctx.moveTo(0, i);
      ctx.lineTo(textureSize, i + 10 * Math.sin(i / 10));
      ctx.stroke();
    }
  });

  // Stone texture (noise pattern)
  textures.Stone = createProceduralTexture(textureSize, (ctx) => {
    ctx.fillStyle = "#707070";
    ctx.fillRect(0, 0, textureSize, textureSize);

    const imageData = ctx.getImageData(0, 0, textureSize, textureSize);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const noise = Math.random() * 40 - 20;
      imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
      imageData.data[i + 1] = Math.max(
        0,
        Math.min(255, imageData.data[i + 1] + noise)
      );
      imageData.data[i + 2] = Math.max(
        0,
        Math.min(255, imageData.data[i + 2] + noise)
      );
    }
    ctx.putImageData(imageData, 0, 0);
  });

  // Leather texture (small bumps)
  textures.Leather = createProceduralTexture(textureSize, (ctx) => {
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(0, 0, textureSize, textureSize);

    for (let i = 0; i < 2000; i++) {
      const x = Math.random() * textureSize;
      const y = Math.random() * textureSize;
      const radius = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(60, 30, 10, ${Math.random() * 0.3})`;
      ctx.fill();
    }
  });

  return textures;
}

// Helper function to create a procedural texture
function createProceduralTexture(size, drawFunction) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  drawFunction(ctx);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;

  return texture;
}
