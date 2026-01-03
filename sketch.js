// --------------------------------------------------
// Browser-only p5.js orb
// Presence input: FACE DETECTION (MediaPipe, CDN)
// --------------------------------------------------

let presence = false;

// ––– TUNING –––
const maxPresence = 350;
const riseRate = 0.08;
const fallRate = 1.5;

let orb;
let particles = [];

let t = 0;
let hueShift = 0;
let presenceTime = 0;

// -----------------------------
// FACE PRESENCE (MediaPipe)
// -----------------------------
let camEl;
let faceDetector;
let mpCamera;

let presentCount = 0;
let absentCount = 0;
const ON_FRAMES = 6;
const OFF_FRAMES = 12;

let camReady = false;
let camError = null;
let statusMsg = "Initializing…";

function setup() {
  pixelDensity(1);
  createCanvas(windowWidth, windowHeight, P2D);
  frameRate(60);
  colorMode(HSB, 360, 100, 100, 100);

  orb = createGraphics(width, height);
  orb.pixelDensity(1);
  orb.colorMode(HSB, 360, 100, 100, 100);

  for (let i = 0; i < 150; i++) particles.push(new Particle());

  // Try fullscreen on first interaction (works on both desktop and mobile)
  document.addEventListener('click', enterFullscreen, { once: true });
  document.addEventListener('touchstart', enterFullscreen, { once: true });
  document.addEventListener('keydown', enterFullscreen, { once: true });

  setupFacePresence();
}

function enterFullscreen() {
  if (!document.fullscreenElement) {
    // Try multiple methods for better mobile compatibility
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(() => {});
    } else if (elem.webkitRequestFullscreen) { // Safari
      elem.webkitRequestFullscreen();
    } else if (elem.mozRequestFullScreen) { // Firefox
      elem.mozRequestFullScreen();
    } else if (elem.msRequestFullscreen) { // IE/Edge
      elem.msRequestFullscreen();
    }
  }
}

function keyPressed() {
  // Press 'F' to toggle fullscreen
  if (key === 'f' || key === 'F') {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }
}

function windowResized() {
  pixelDensity(1);
  resizeCanvas(windowWidth, windowHeight);

  orb = createGraphics(width, height);
  orb.pixelDensity(1);
  orb.colorMode(HSB, 360, 100, 100, 100);

  particles = [];
  for (let i = 0; i < 150; i++) particles.push(new Particle());
}

function setupFacePresence() {
  if (typeof FaceDetection !== "function") {
    statusMsg = "FaceDetection not loaded (check index.html scripts).";
    camError = new Error("FaceDetection is not defined");
    return;
  }
  if (typeof Camera !== "function") {
    statusMsg = "Camera utils not loaded (check index.html scripts).";
    camError = new Error("Camera is not defined");
    return;
  }

  statusMsg = "Starting camera…";

  // Create video element
  camEl = document.createElement("video");
  camEl.setAttribute("playsinline", "");
  camEl.muted = true;
  camEl.autoplay = true;
  camEl.style.position = "fixed";
  camEl.style.left = "-9999px";
  document.body.appendChild(camEl);

  // Initialize FaceDetection WITHOUT locateFile to use default CDN paths
  faceDetector = new FaceDetection({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4/${file}`;
    }
  });

  faceDetector.setOptions({
    model: 'short',
    minDetectionConfidence: 0.5
  });

  faceDetector.onResults((results) => {
    const seen = (results?.detections?.length || 0) > 0;

    if (seen) {
      presentCount++;
      absentCount = 0;
    } else {
      absentCount++;
      presentCount = 0;
    }

    if (!presence && presentCount >= ON_FRAMES) presence = true;
    if (presence && absentCount >= OFF_FRAMES) presence = false;

    camReady = true;
    statusMsg = "Running";
  });

  // Initialize camera
  mpCamera = new Camera(camEl, {
    onFrame: async () => {
      if (!faceDetector) return;
      
      try {
        await faceDetector.send({ image: camEl });
      } catch (e) {
        console.error("faceDetector.send error:", e);
        camError = e;
        statusMsg = "Face detector error. Try refreshing.";
      }
    },
    width: 640,
    height: 480,
  });

  mpCamera.start().catch((err) => {
    camError = err;
    presence = false;
    statusMsg = "Camera blocked/unavailable. Allow camera + reload.";
    console.error("Camera start failed:", err);
  });
}

function safeStopCamera() {
  try {
    if (mpCamera && typeof mpCamera.stop === "function") {
      mpCamera.stop();
    }
  } catch (e) {
    console.warn("Error stopping camera:", e);
  }

  try {
    if (camEl && camEl.srcObject) {
      const tracks = camEl.srcObject.getTracks?.() || [];
      tracks.forEach((t) => t.stop());
      camEl.srcObject = null;
    }
  } catch (e) {
    console.warn("Error stopping video tracks:", e);
  }

  try {
    if (camEl && camEl.parentNode) {
      camEl.parentNode.removeChild(camEl);
    }
  } catch (e) {
    console.warn("Error removing video element:", e);
  }

  mpCamera = null;
  camEl = null;
  faceDetector = null;
  camReady = false;
  presentCount = 0;
  absentCount = 0;
}

function draw() {
  background(0);

  presenceTime = presence
    ? min(presenceTime + riseRate, maxPresence)
    : max(presenceTime - fallRate, 0);

  const pct = presenceTime / maxPresence;

  const minDim = min(width, height);
  const baseRad = minDim * 0.25;
  const extraRad = minDim * 0.35;
  const radius = baseRad + pct * extraRad;

  const saturation = 80 + pct * 20;
  const brightness = 70 + pct * 30;
  const hueSpeed = 0.4 + pct * 1.5;
  hueShift = (hueShift + hueSpeed) % 360;

  drawOrganicOrb(
    orb,
    orb.width * 0.5,
    orb.height * 0.5,
    radius,
    hueShift,
    t,
    saturation,
    brightness,
    pct
  );

  image(orb, 0, 0);
  updateParticles(pct);

  drawStatusOverlay();

  t += 0.01;
}

// -----------------------------
// ORB RENDERING
// -----------------------------
function drawOrganicOrb(pg, cx, cy, baseRadius, hueBase, time, sat, bright, pct) {
  pg.clear();
  pg.noStroke();

  const layers = 80;
  for (let i = 1; i <= layers; i++) {
    const layerPct = i / layers;
    const r = baseRadius * layerPct;

    const alpha = 80 * pow(1 - layerPct, 1.2) * pct;
    const rawHue =
      (hueBase + layerPct * 360 + sin(time + layerPct * 2.0) * 60) % 360;

    pg.fill(rawHue, sat, bright, alpha);
    drawBlobbyShape(pg, cx, cy, r, time + i * 0.015);
  }
}

function drawBlobbyShape(pg, cx, cy, radius, time) {
  pg.beginShape();
  const step = 0.1;

  for (let a = 0; a < TWO_PI + step; a += step) {
    const xoff = cos(a) * 0.8 + time;
    const yoff = sin(a) * 0.8 + time;
    const n = noise(xoff, yoff);

    const rOff = map(n, 0, 1, -15, 15);
    const r = radius + rOff;

    pg.curveVertex(cx + cos(a) * r, cy + sin(a) * r);
  }
  pg.endShape(CLOSE);
}

// -----------------------------
// PARTICLES
// -----------------------------
class Particle {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = random(width);
    this.y = random(height);
    this.ang = random(TWO_PI);
    this.spd = random(0.2, 0.6);
    this.sz = random(1, 2);
    this.hu = random(360);
  }

  update() {
    this.x += cos(this.ang) * this.spd;
    this.y += sin(this.ang) * this.spd;
    if (this.x < 0 || this.x > width || this.y < 0 || this.y > height) {
      this.reset();
    }
  }

  display(pct) {
    const alpha = 5 + pct * 30;
    const bright = 80 + pct * 20;
    noStroke();
    fill(this.hu, 30, bright, alpha);
    ellipse(this.x, this.y, this.sz, this.sz);
  }
}

function updateParticles(pct) {
  blendMode(ADD);
  for (const p of particles) {
    p.update();
    p.display(pct);
  }
  blendMode(BLEND);
}

// -----------------------------
// STATUS OVERLAY
// -----------------------------
function drawStatusOverlay() {
  const show = !camReady || camError || statusMsg !== "Running";
  if (!show) return;

  push();
  noStroke();
  fill(0, 0, 0, 65);
  rect(0, 0, width, 90);

  fill(0, 0, 100, 90);
  textSize(14);
  textAlign(LEFT, TOP);

  const lines = [
    `presence: ${presence}`,
    `status: ${statusMsg}`,
  ];

  if (camError) {
    lines.push(`error: ${String(camError.message || camError)}`.slice(0, 120));
  }

  text(lines.join("\n"), 12, 10);
  pop();
}
