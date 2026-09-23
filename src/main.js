import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;

const renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance', antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 2.2, 0.7, 0.05);
composer.addPass(bloomPass);

const fragmentShader = `
  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uSpinSpeed;
  uniform float uMass;
  uniform float uColorShift;
  uniform float uLuminosity; // New Light Multiplier
  
  mat2 rot(float a) {
      float s = sin(a), c = cos(a);
      return mat2(c, -s, s, c);
  }

  float hash(float n) { return fract(sin(n)*43758.5453); }
  float noise(vec3 x) {
      vec3 p = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
      float n = p.x + p.y*57.0 + 113.0*p.z;
      return mix(mix(mix( hash(n+0.0), hash(n+1.0),f.x), mix( hash(n+57.0), hash(n+58.0),f.x),f.y),
                 mix(mix( hash(n+113.0), hash(n+114.0),f.x), mix( hash(n+170.0), hash(n+171.0),f.x),f.y),f.z);
  }
  
  const mat3 m2 = mat3( 0.80, 0.60, 0.00, -0.60, 0.80, 0.00, 0.00, 0.00, 1.00 );
  float fbm(vec3 p) {
      float f = 0.0;
      f += 0.5000 * noise(p); p = m2 * p * 2.02;
      f += 0.2500 * noise(p); p = m2 * p * 2.03;
      f += 0.1250 * noise(p);
      return f;
  }

  void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
      
      vec3 ro = vec3(0.0, 0.4, -3.5); 
      vec3 rd = normalize(vec3(uv, 1.0));
      
      float t = 0.0;
      float accretionGlow = 0.0;
      float blackHoleHit = 0.0;
      vec3 p;
      
      for(int i = 0; i < 90; i++) {
          p = ro + rd * t;
          float distToCenter = length(p);
          
          float dEventHorizon = distToCenter - uMass;
          
          float gravityDrag = 1.0 / (distToCenter + 0.1);
          vec3 twistedP = p * 2.5;
          twistedP.xz *= rot(p.y * 3.0 - uTime * uSpinSpeed * gravityDrag);
          
          float dDisk = length(vec2(length(twistedP.xz) - (uMass * 2.5), twistedP.y * 3.0)) - 0.15;
          dDisk -= fbm(twistedP * 2.0 - vec3(0.0, uTime * 1.5, 0.0)) * 0.4;
          
          float d = min(dEventHorizon, dDisk);
          
          accretionGlow += 0.015 / (0.05 + abs(dDisk));
          
          if (d < 0.005) {
              if (d == dEventHorizon) blackHoleHit = 1.0;
              break;
          }
          if (t > 10.0) break;
          t += d * 0.5; 
      }

      vec3 color = vec3(0.0); 
      if (blackHoleHit == 1.0) color = vec3(0.0); 

      vec3 cDarkOrange = vec3(0.6, 0.1, 0.0);
      vec3 cGold       = vec3(1.0, 0.6, 0.0);
      vec3 cWhite      = vec3(1.0, 0.95, 0.9);
      
      vec3 cDeepBlue   = vec3(0.0, 0.1, 0.6);
      vec3 cCyan       = vec3(0.0, 0.8, 1.0);

      vec3 baseColor = mix(cDarkOrange, cDeepBlue, uColorShift);
      vec3 midColor  = mix(cGold, cCyan, uColorShift);
      vec3 coreColor = mix(cWhite, vec3(1.0), uColorShift);

      vec3 plasma = mix(baseColor, midColor, smoothstep(0.0, 2.5, accretionGlow));
      plasma = mix(plasma, coreColor, smoothstep(2.5, 6.0, accretionGlow));
      
      // Apply the Hyper-Luminosity multiplier here
      color += plasma * accretionGlow * 0.3 * uLuminosity;
      color *= smoothstep(1.3, 0.2, length(uv)); 
      
      gl_FragColor = vec4(color, 1.0);
  }
`;

const uniforms = {
  uTime: { value: 0.0 },
  uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  uSpinSpeed: { value: 3.5 },
  uMass: { value: 0.25 },
  uColorShift: { value: 0.0 },
  uLuminosity: { value: 1.0 }
};

const shaderMat = new THREE.ShaderMaterial({ 
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`, 
  fragmentShader, uniforms 
});
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shaderMat));

// --- BUTTON EVENT LISTENERS ---
let state = { 
    isSpinning: true, targetSpin: 3.5, 
    isShifted: false, targetColor: 0.0,
    targetMass: 0.25,
    isHyperLight: false, targetLuminosity: 1.0 
};

document.getElementById('btn-spin').addEventListener('click', (e) => {
    state.isSpinning = !state.isSpinning;
    state.targetSpin = state.isSpinning ? 3.5 : 0.2;
    e.target.classList.toggle('active');
    e.target.innerText = state.isSpinning ? "Spin: MAX" : "Spin: LOW";
});

document.getElementById('btn-color').addEventListener('click', (e) => {
    state.isShifted = !state.isShifted;
    state.targetColor = state.isShifted ? 1.0 : 0.0;
    if(state.isShifted) {
        e.target.classList.remove('active');
        e.target.classList.add('active-blue');
        e.target.innerText = "Shift: BLUE GIANT";
    } else {
        e.target.classList.remove('active-blue');
        e.target.innerText = "Shift: M87*";
    }
});

document.getElementById('btn-mass-up').addEventListener('click', () => {
    state.targetMass = Math.min(state.targetMass + 0.05, 0.5); 
});

document.getElementById('btn-mass-down').addEventListener('click', () => {
    state.targetMass = Math.max(state.targetMass - 0.05, 0.1); 
});

document.getElementById('btn-light').addEventListener('click', (e) => {
    state.isHyperLight = !state.isHyperLight;
    state.targetLuminosity = state.isHyperLight ? 4.5 : 1.0;
    if(state.isHyperLight) {
        e.target.classList.add('active-light');
        e.target.innerText = "Light: HYPER-LUMINOUS";
    } else {
        e.target.classList.remove('active-light');
        e.target.innerText = "Light: NORMAL";
    }
});

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  
  uniforms.uSpinSpeed.value += (state.targetSpin - uniforms.uSpinSpeed.value) * 0.05;
  uniforms.uColorShift.value += (state.targetColor - uniforms.uColorShift.value) * 0.05;
  uniforms.uMass.value += (state.targetMass - uniforms.uMass.value) * 0.08;
  uniforms.uLuminosity.value += (state.targetLuminosity - uniforms.uLuminosity.value) * 0.05;
  
  uniforms.uTime.value = clock.getElapsedTime();
  composer.render();
}
animate();

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
});