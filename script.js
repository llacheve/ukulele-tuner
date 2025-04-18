const noteDisplay = document.getElementById("note-display");
const frequencyDisplay = document.getElementById("detected-frequency");
const canvas = document.getElementById("tuner-needle");
const ctx = canvas.getContext("2d");
const ding = document.getElementById("ding-sound");

const ukuleleNotes = {
  G4: 392.00,
  C4: 261.63,
  E4: 329.63,
  A4: 440.00
};

let selectedNote = null;
let pitchHistory = [];
let lastPlayTime = 0;
const SOUND_COOLDOWN_MS = 2000;

document.querySelectorAll(".string-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedNote = btn.dataset.note;
    document.querySelectorAll(".string-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    pitchHistory = [];
  });
});

function getClosestNote(freq) {
  let closest = null;
  let minDiff = Infinity;
  for (let note in ukuleleNotes) {
    let diff = Math.abs(ukuleleNotes[note] - freq);
    if (diff < minDiff) {
      minDiff = diff;
      closest = note;
    }
  }
  return {
    note: closest,
    targetFreq: ukuleleNotes[closest],
    diff: freq - ukuleleNotes[closest]
  };
}

async function startTuner() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);

  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1000;
  source.connect(filter);

  const analyser = audioContext.createAnalyser();
  filter.connect(analyser);
  const buffer = new Float32Array(analyser.fftSize);

  function detectPitch() {
    analyser.getFloatTimeDomainData(buffer);
    const rawFreq = autoCorrelate(buffer, audioContext.sampleRate);
    if (rawFreq !== -1) {
      pitchHistory.push(rawFreq);
      if (pitchHistory.length > 5) pitchHistory.shift();
      const avgFreq = pitchHistory.reduce((a, b) => a + b, 0) / pitchHistory.length;

      frequencyDisplay.textContent = `${avgFreq.toFixed(1)} Hz`;

      const pitchData = getClosestNote(avgFreq);
      const note = pitchData.note;
      const diff = pitchData.diff;

      const isCorrectNote = selectedNote === null || selectedNote === note;
      const isInTune = Math.abs(diff) < 1;

      noteDisplay.classList.remove("in-tune");

      if (!isCorrectNote) {
        noteDisplay.textContent = `🎵 Detected: ${note} — play ${selectedNote || "any note"}`;
      } else if (isInTune) {
        noteDisplay.textContent = `✅ ${note} is in tune!`;
        noteDisplay.classList.add("in-tune");

        const now = Date.now();
        if (now - lastPlayTime > SOUND_COOLDOWN_MS) {
          ding.currentTime = 0;
          ding.play();
          lastPlayTime = now;
        }
      } else if (diff > 0) {
        noteDisplay.textContent = `🔺 ${note} — Too Sharp → Loosen`;
      } else {
        noteDisplay.textContent = `🔻 ${note} — Too Flat → Tighten`;
      }

      drawNeedle(avgFreq, pitchData.targetFreq, isInTune);
    }

    requestAnimationFrame(detectPitch);
  }

  detectPitch();
}

document.getElementById("start-button").addEventListener("click", () => {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const context = new AudioCtx();
  if (context.state === "suspended") {
    context.resume();
  }
  startTuner();
});

function autoCorrelate(buf, sampleRate) {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  let r1 = 0, r2 = SIZE - 1, thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
  for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }

  buf = buf.slice(r1, r2);
  let newSize = buf.length;
  let c = new Array(newSize).fill(0);

  for (let i = 0; i < newSize; i++) {
    for (let j = 0; j < newSize - i; j++) {
      c[i] += buf[j] * buf[j + i];
    }
  }

  let d = 0;
  while (c[d] > c[d + 1]) d++;

  let maxval = -1, maxpos = -1;
  for (let i = d; i < newSize; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }

  let T0 = maxpos;
  return sampleRate / T0;
}

function drawNeedle(freq, target, isInTune) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const centerX = canvas.width / 2;
  const centerY = canvas.height;

  let diff = freq - target;
  let angle = Math.max(-45, Math.min(45, diff * 2));
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((angle * Math.PI) / 180);

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -100);
  ctx.strokeStyle = isInTune ? "green" : "#e74c3c";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(centerX, centerY - 100);
  ctx.strokeStyle = "#ccc";
  ctx.lineWidth = 1;
  ctx.stroke();
}
