import { useRef, useState } from "react";

import "./App.css";

export default function App() {
  const canvasRef = useRef(null);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const previousValueRef = useRef(null);
  const smoothingCountRef = useRef(0);

  const [note, setNote] = useState("Waiting...");

  const smoothingThreshold = 10; // Hz difference allowed
  const smoothingCountThreshold = 5; // frames required before updating

  const noteStrings = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];

  function noteFromPitch(frequency) {
    const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    return Math.round(noteNum) + 69;
  }

  async function startAudio() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.minDecibels = -100;
    analyser.maxDecibels = -10;
    analyser.smoothingTimeConstant = 0.85;

    const source = audioContext.createMediaStreamSource(stream);

    source.connect(analyser);

    analyser.fftSize = 2048;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    dataArrayRef.current = dataArray;

    visualize();
    detectPitch();
  }

  function visualize() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;

    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;
    const bufferLength = analyser.frequencyBinCount;

    function draw() {
      requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      const barWidth = (WIDTH / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i];

        ctx.fillStyle = `rgb(${barHeight + 100},50,50)`;

        ctx.fillRect(x, HEIGHT - barHeight / 2, barWidth, barHeight / 2);

        x += barWidth + 1;
      }
    }

    draw();
  }

  function detectPitch() {
    const analyser = analyserRef.current;
    const audioContext = audioContextRef.current;

    const buffer = new Float32Array(analyser.fftSize);

    function updatePitch() {
      requestAnimationFrame(updatePitch);

      analyser.getFloatTimeDomainData(buffer);

      const pitch = autoCorrelate(buffer, audioContext.sampleRate);

      if (pitch === -1) return;

      const previousValue = previousValueRef.current;

      function pitchIsSimilarEnough() {
        if (previousValue === null) return true;
        return Math.abs(pitch - previousValue) < smoothingThreshold;
      }

      if (pitchIsSimilarEnough()) {
        if (smoothingCountRef.current < smoothingCountThreshold) {
          smoothingCountRef.current++;
          return;
        } else {
          previousValueRef.current = pitch;
          smoothingCountRef.current = 0;
        }
      } else {
        previousValueRef.current = pitch;
        smoothingCountRef.current = 0;
        return;
      }

      const noteNumber = noteFromPitch(pitch);
      const noteName = noteStrings[noteNumber % 12];

      setNote(noteName + " (" + Math.round(pitch) + " Hz)");
    }

    updatePitch();
  }

  function autoCorrelate(buffer, sampleRate) {
    let SIZE = buffer.length;
    let sum = 0;

    for (let i = 0; i < SIZE; i++) {
      sum += buffer[i] * buffer[i];
    }

    const rms = Math.sqrt(sum / SIZE);

    if (rms < 0.01) return -1;

    let r1 = 0;
    let r2 = SIZE - 1;
    const threshold = 0.2;

    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buffer[i]) < threshold) {
        r1 = i;
        break;
      }
    }

    for (let i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buffer[SIZE - i]) < threshold) {
        r2 = SIZE - i;
        break;
      }
    }

    buffer = buffer.slice(r1, r2);
    SIZE = buffer.length;

    const c = new Array(SIZE).fill(0);

    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE - i; j++) {
        c[i] += buffer[j] * buffer[j + i];
      }
    }

    let d = 0;
    while (c[d] > c[d + 1]) d++;

    let maxValue = -1;
    let maxIndex = -1;

    for (let i = d; i < SIZE; i++) {
      if (c[i] > maxValue) {
        maxValue = c[i];
        maxIndex = i;
      }
    }

    let T0 = maxIndex;

    const x1 = c[T0 - 1];
    const x2 = c[T0];
    const x3 = c[T0 + 1];

    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;

    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
  }

  return (
    <div>
      <h1>Note Detection</h1>

      <button onClick={startAudio}>Start</button>

      <h2>{note}</h2>

      <canvas ref={canvasRef} width="700" height="250" />
    </div>
  );
}
