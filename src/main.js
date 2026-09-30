import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// ==========================================
// 1. DYNAMIC UI & CLEANUP (Nukes old UI completely)
// ==========================================
const uiCSS = `
  /* Erase all old HTML buttons and containers */
  button, .old-ui, #ui-container, #app { display: none !important; }

  /* Premium Glassmorphism UI */
  #bh-controls {
    position: absolute; top: 20px; right: 20px; width: 320px;
    background: rgba(15, 15, 20, 0.7); border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 20px; border-radius: 12px; font-family: 'Courier New', monospace;
    color: #fff; z-index: 9999; box-shadow: 0 8px 32px rgba(0,0,0,0.8);
    backdrop-filter: blur(10px); pointer-events: auto; user-select: none;
  }
  #bh-controls h3 { margin: 0 0 5px 0; font-size: 16px; text-align: center; letter-spacing: 2px; color: #ff9933; text-transform: uppercase; }
  .hint { text-align: center; font-size: 11px; color: #aaa; margin-bottom: 20px; font-style: italic; }
  .slider-group { margin-bottom: 15px; }
  .slider-group label { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; }
  .slider-group input[type=range] { width: 100%; cursor: pointer; accent-color: #ff9933; height: 4px; background: #333; outline: none; border-radius: 2px; -webkit-appearance: none; }
  .slider-group input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; background: #ff9933; border-radius: 50%; }
  
  body { margin: 0; overflow: hidden; background: #000; cursor: grab; }
  body:active { cursor: grabbing; }
`;
const styleTag = document.createElement('style');
styleTag.innerHTML = uiCSS;
document.head.appendChild(styleTag);

const uiHTML = `
  <div id="bh-controls" onmousedown="event.stopPropagation()">
    <h3>Singularity Engine</h3>
    <div class="hint">Click & Drag to Orbit • Smoothed Inertia</div>
    <div class="slider-group"><label><span>Mass (Size)</span><span id="val-mass">1.00</span></label><input type="range" id="mass" min="0.5" max="2.2" step="0.05" value="1.0"></div>
    <div class="slider-group"><label><span>Spin Speed</span><span id="val-spin">2.00</span></label><input type="range" id="spin" min="0.0" max="8.0" step="0.1" value="2.0"></div>
    <div class="slider-group"><label><span>Luminosity</span><span id="val-lum">1.00</span></label><input type="range" id="lum" min="0.1" max="3.0" step="0.1" value="1.0"></div>
    <div class="slider-group"><label><span>Doppler Beaming</span><span id="val-doppler">0.50</span></label><input type="range" id="doppler" min="0.0" max="2.0" step="0.1" value="0.5"></div>
    <div class="slider-group"><label><span>Disk Gap</span><span id="val-gap">1.50</span></label><input type="range" id="gap" min="1.0" max="3.0" step="0.1" value="1.5"></div>
    <div class="slider-group"><label><span>Stellar Temp</span><span id="val-color">M87*</span></label><input type="range" id="color-temp" min="0" max="1" step="0.01" value="0.0"></div>
  </div>
`;
const uiDiv = document.createElement('div');
uiDiv.innerHTML = uiHTML;
document.body.appendChild(uiDiv);

// ==========================================
// 2. THREE.JS SCENE & COMPOSER SETUP
// ==========================================
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;

const renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance', antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// Finely tuned bloom: High threshold keeps the void black, wide radius creates the cinematic glow
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.6, 0.7, 0.85);
composer.addPass(bloomPass);

// ==========================================
// 3. SMOOTH KINEMATIC MOUSE CONTROLS
// ==========================================
let targetPitch = 0.15;
let targetYaw = 0.0;
let currentPitch = 0.15;
let currentYaw = 0.0;
let isDragging = false;
let previousMouse = { x: 0, y: 0 };

document.addEventListener('mousedown', (e) => {
  if (e.target.tagName !== 'INPUT') isDragging = true;
});
document.addEventListener('mouseup', () => isDragging = false);
document.addEventListener('mousemove', (e) => {
  if (isDragging) {
    const dx = e.offsetX - previousMouse.x;
    const dy = e.offsetY - previousMouse.y;
    targetYaw -= dx * 0.006;
    targetPitch += dy * 0.006;
    // Lock pitch so the camera doesn't flip upside down
    targetPitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, targetPitch));
  }
  previousMouse = { x: e.offsetX, y: e.offsetY };
});

// ==========================================
// 4. THE "SUPER SPECIAL" RELATIVISTIC SHADER
// ==========================================
const uniforms = {
  uTime: { value: 0.0 },
  uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  uCamPitch: { value: currentPitch },
  uCamYaw: { value: currentYaw },
  uMass: { value: 1.0 },
  uSpinSpeed: { value: 2.0 },
  uLuminosity: { value: 1.0 }, 
  uDoppler: { value: 0.5 },
  uDiskInner: { value: 1.5 },
  uColorTemp: { value: 0.0 }
};

const fragmentShader = `
  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uCamPitch;
  uniform float uCamYaw;
  uniform float uMass;
  uniform float uSpinSpeed;
  uniform float uLuminosity;
  uniform float uDoppler;
  uniform float uDiskInner;
  uniform float uColorTemp;

  #define MAX_STEPS 250
  #define STEP_SIZE 0.04

  mat2 rot(float a) {
      float s = sin(a), c = cos(a);
      return mat2(c, -s, s, c);
  }

  // Fast hash for the starfield
  float hash13(vec3 p3) {
      p3  = fract(p3 * .1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
      
      vec3 ro = vec3(0.0, 0.0, -8.0); 
      vec3 rd = normalize(vec3(uv, 1.0));
      
      // Apply smoothed interactive rotation
      rd.yz *= rot(-uCamPitch);
      ro.yz *= rot(-uCamPitch);
      rd.xz *= rot(-uCamYaw);
      ro.xz *= rot(-uCamYaw);

      vec3 p = ro;
      vec3 color = vec3(0.0);
      float transmittance = 1.0;
      bool hitBH = false;

      float h2 = dot(cross(ro, rd), cross(ro, rd)); 
      float rs = uMass; 
      
      // -- RELATIVISTIC RAYMARCHING --
      for(int i = 0; i < MAX_STEPS; i++) {
          float r = length(p);
          
          // The Event Horizon
          if(r < rs * 0.98) {
              hitBH = true;
              break;
          }

          // Einstein Geodesic Curvature (Light bending)
          vec3 accel = -1.5 * h2 * rs * p / pow(r, 5.0);
          rd = normalize(rd + accel * STEP_SIZE);
          p += rd * STEP_SIZE;

          float rDisk = length(p.xz);
          float distToPlane = abs(p.y);
          
          float innerEdge = rs * uDiskInner; 
          float outerEdge = rs * 6.5;

          // Accretion Disk Volumetrics
          if(rDisk > innerEdge && rDisk < outerEdge && distToPlane < 0.25) {
              
              // Differential Keplerian Rotation
              float angle = atan(p.z, p.x);
              float velocity = pow(rs / rDisk, 0.5); 
              float spin = angle - uTime * uSpinSpeed * velocity;
              
              // Restored volumetric clumps (creates the stormy, shifting gas look)
              float clumps = sin(spin * 10.0 + rDisk * 5.0) * 0.5 + 0.5;
              clumps *= sin(spin * 25.0 - rDisk * 2.0) * 0.5 + 0.5;
              
              // Restored geometric dust lanes (the sharp black rings)
              float band1 = sin(rDisk * 8.0) * 0.5 + 0.5;
              float band2 = sin(rDisk * 20.0) * 0.5 + 0.5;
              float rings = smoothstep(0.1, 0.9, band1 * band2);
              
              // Smooth bounds
              float verticalProfile = exp(-distToPlane * 40.0);
              float radialProfile = smoothstep(innerEdge, innerEdge + 0.3, rDisk) * smoothstep(outerEdge, outerEdge - 2.0, rDisk);
              
              // Final dense gas texture
              float density = radialProfile * verticalProfile * mix(0.15, 1.0, rings) * mix(0.4, 1.0, clumps) * 2.5;
              
              float absorption = exp(-density * STEP_SIZE * 5.0);
              transmittance *= absorption;
              
              // Doppler Beaming
              vec3 diskVelocityVec = normalize(vec3(-p.z, 0.0, p.x)) * velocity;
              float dopplerFactor = 1.0 + dot(rd, diskVelocityVec) * uDoppler;
              
              // Color Palettes
              vec3 copperCore = vec3(1.0, 0.85, 0.6);
              vec3 copperDust = vec3(0.8, 0.3, 0.05);
              
              vec3 blueCore = vec3(0.7, 0.9, 1.0);
              vec3 blueDust = vec3(0.1, 0.3, 0.9);
              
              vec3 activeCore = mix(copperCore, blueCore, uColorTemp);
              vec3 activeDust = mix(copperDust, blueDust, uColorTemp);
              
              // Calculate emission based on temperature gradient
              float temp = smoothstep(outerEdge, innerEdge, rDisk);
              vec3 emission = mix(activeDust, activeCore, temp) * pow(dopplerFactor, 3.0) * uLuminosity;
              
              color += emission * density * STEP_SIZE * 10.0 * transmittance;
              
              if (transmittance < 0.01) break;
          }
      }

      // -- GRAVITATIONAL STARFIELD --
      // If the ray escapes the black hole, render the background stars.
      // Because 'rd' was bent by gravity in the loop above, the stars will realistically warp!
      if (!hitBH && transmittance > 0.01) {
          float starMap = hash13(rd * 150.0);
          // Only show the brightest 0.2% of noise as stars
          if (starMap > 0.998) {
              float starIntensity = (starMap - 0.998) * 500.0;
              // Add a slight blue/white flicker to the stars
              vec3 starColor = mix(vec3(0.8, 0.9, 1.0), vec3(1.0, 0.8, 0.6), hash13(rd * 100.0));
              color += starColor * starIntensity * transmittance;
          }
      }

      if (hitBH) color = vec3(0.0);

      // Deep space vignette
      color *= smoothstep(1.8, 0.2, length(uv)); 
      
      // ACES Tone Mapping
      color = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);
      
      gl_FragColor = vec4(color, 1.0);
  }
`;

const shaderMat = new THREE.ShaderMaterial({ 
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`, 
  fragmentShader, uniforms 
});
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shaderMat));

// ==========================================
// 5. EVENT LISTENERS FOR CUSTOM UI
// ==========================================
const setupSlider = (id, uniformKey, isColor = false) => {
  const slider = document.getElementById(id);
  const label = document.getElementById('val-' + id.split('-').pop().substring(0,4));
  
  slider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    uniforms[uniformKey].value = val;
    
    if (isColor) {
      if(val < 0.33) label.innerText = "M87*";
      else if(val < 0.66) label.innerText = "WHITE";
      else label.innerText = "BLUE GIANT";
    } else {
      label.innerText = val.toFixed(2);
    }
  });
};

setupSlider('mass', 'uMass');
setupSlider('spin', 'uSpinSpeed');
setupSlider('lum', 'uLuminosity');
setupSlider('doppler', 'uDoppler');
setupSlider('gap', 'uDiskInner');
setupSlider('color-temp', 'uColorTemp', true);

// ==========================================
// 6. ANIMATION & RESIZE LOOP
// ==========================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  
  // Lerp (smoothly interpolate) current camera angles toward target angles
  currentPitch += (targetPitch - currentPitch) * 0.05;
  currentYaw += (targetYaw - currentYaw) * 0.05;
  
  // Feed the smoothed angles to the GPU
  uniforms.uCamPitch.value = currentPitch;
  uniforms.uCamYaw.value = currentYaw;
  
  uniforms.uTime.value = clock.getElapsedTime();
  composer.render();
}
animate();

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
});