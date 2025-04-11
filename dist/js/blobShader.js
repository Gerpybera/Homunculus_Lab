/**
 * Magenta blob animation shader
 * Creates an animated blob effect with black background and magenta color
 */

// Vertex shader code
const blobVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

// Fragment shader code
const blobFragmentShader = `
uniform float time;
uniform vec2 resolution; // Add resolution uniform to handle aspect ratio
varying vec2 vUv;

// Simple random function
float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

// Smoothstep-based noise
float noise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  
  vec2 u = f * f * (3.0 - 2.0 * f);
  
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// Function to generate the blob shape
float blob(vec2 st, float t) {
  // Create multiple noise layers at different scales and speeds
  float n = 0.0;
  n += 0.5 * noise(st * 3.0 + vec2(t * 0.2, t * 0.3));
  n += 0.25 * noise(st * 6.0 + vec2(t * -0.3, t * 0.2));
  n += 0.125 * noise(st * 12.0 + vec2(t * 0.4, t * -0.1));
  n += 0.0625 * noise(st * 24.0 + vec2(t * -0.1, t * 0.4));
  
  // Center and scale
  st = st * 2.0 - 1.0;
  
  // Distance from center
  float dist = length(st);
  
  // Create blob shape with gradient from center to edge
  // First get the basic shape with sharp edge
  float blobShape = smoothstep(0.3 + n * 0.2, 0.1 + n * 0.1, dist);
  
  // Then add gradient - strongest in center, fading to edge
  float gradient = 1.0 - smoothstep(0.0, 0.3 + n * 0.2, dist);
  
  // Combine shape and gradient
  return blobShape * gradient;
}

// Function to create a single tiny blob at position pos with scale s
// Modified to handle aspect ratio
float tinyBlob(vec2 uv, vec2 pos, float scale, float t, vec2 aspect) {
  // Apply aspect ratio correction to UV coordinates
  vec2 aspectCorrectedUV = uv * aspect;
  vec2 aspectCorrectedPos = pos * aspect;
  
  // Move the coordinate system to create a blob at position pos
  vec2 st = (aspectCorrectedUV - aspectCorrectedPos) / scale;
  
  // Create the blob with some animation based on time
  return blob(st, t + 10.0 * random(pos)); // Different time offset for each blob
}

void main() {
  // Calculate aspect ratio
  float aspectRatio = resolution.x / resolution.y;
  vec2 aspect = vec2(min(aspectRatio, 1.0), min(1.0 / aspectRatio, 1.0));
  
  // Purple color (RGB: 128, 0, 200) normalized to 0-1
  vec3 purple = vec3(0.5, 0.0, 0.8);
  
  // Initialize color with black background
  vec3 color = vec3(0.0);
  float alpha = 0.0; // Start with fully transparent
  
  // Number of blobs
  const int numBlobs = 12;
  
  // Create multiple blobs
  for(int i = 0; i < numBlobs; i++) {
    // Random position based on blob index
    vec2 pos = vec2(
      0.5 + 0.8 * cos(float(i) * 1.0 + time * 0.2),
      0.5 + 0.8 * sin(float(i) * 1.5 + time * 0.3)
    ) * 0.5;
    
    // Larger scale for each blob
    float scale = 0.25 + 0.35 * random(vec2(float(i), 23.45));
    
    // Create blob and add to color
    float blobValue = tinyBlob(vUv, pos, scale, time, aspect);
    
    // Add this blob's contribution to the final color with slight variation
    color += purple * blobValue * (0.7 + 0.3 * sin(float(i)));
    
    // Accumulate alpha (opacity) value
    alpha += blobValue;
  }
  
  // Ensure color and alpha values don't exceed 1.0
  color = min(color, 1.0);
  alpha = min(alpha, 1.0);
  
  gl_FragColor = vec4(color, alpha);
}
`;

// Export shader code
export { blobVertexShader, blobFragmentShader };
