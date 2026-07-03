/* global diriAPI */

const TARGET_SAMPLE_RATE = 16000;

let audioContext = null;
let mediaStream = null;
let source = null;
let processor = null;
let isRecording = false;
let micReady = false;
let pendingStart = false;

function logToMain(msg) {
  diriAPI.sendRendererError("AUDIO_LOG: " + msg);
}

function downsampleBuffer(inputBuffer, inputSampleRate) {
  if (inputSampleRate === TARGET_SAMPLE_RATE) {
    return inputBuffer;
  }

  const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
  const newLength = Math.round(inputBuffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < inputBuffer.length; i++) {
      accum += inputBuffer[i];
      count++;
    }

    result[offsetResult] = accum / count;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function floatTo16BitPCM(input) {
  const output = new ArrayBuffer(input.length * 2);
  const view = new DataView(output);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(output);
}

function uint8ToBase64(bytes) {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

let audioLogCounter = 0;

async function initMic() {
  if (micReady) return;

  try {
    logToMain("initMic: requesting getUserMedia");
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 48000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    audioContext = new AudioContext({ sampleRate: 48000 });
    source = audioContext.createMediaStreamSource(mediaStream);

    const bufferSize = 4096;
    processor = audioContext.createScriptProcessor(bufferSize, 1, 1);

    processor.onaudioprocess = (event) => {
      // Always send audio data — main process routes to ASR and/or wake word monitor
      const inputData = event.inputBuffer.getChannelData(0);

      // Log audio level every 100 frames
      audioLogCounter++;
      if (audioLogCounter % 100 === 0) {
        let max = 0;
        for (let i = 0; i < inputData.length; i++) {
          const abs = Math.abs(inputData[i]);
          if (abs > max) max = abs;
        }
        logToMain("audio flowing: " + audioLogCounter + " frames, maxLevel=" + max.toFixed(4));
      }

      const downsampled = downsampleBuffer(inputData, audioContext.sampleRate);
      const pcm = floatTo16BitPCM(downsampled);
      diriAPI.sendAudioData(uint8ToBase64(pcm));
    };

    // Connect: source -> processor -> destination (with near-zero gain to keep silent)
    // processor MUST connect to destination for onaudioprocess to fire
    const gain = audioContext.createGain();
    gain.gain.value = 0.0001; // near-zero, not exactly 0 to avoid engine optimization
    source.connect(processor);
    processor.connect(gain);
    gain.connect(audioContext.destination);

    micReady = true;
    logToMain("initMic: mic acquired and pipeline ready");

    // Ensure AudioContext stays running (it can be suspended in background)
    if (audioContext.state === "suspended") {
      audioContext.resume();
      logToMain("initMic: resumed suspended AudioContext");
    }

    if (pendingStart) {
      pendingStart = false;
      isRecording = true;
      logToMain("initMic: executing pending start");
    }

    // Periodically check if AudioContext is still running
    setInterval(() => {
      if (audioContext && audioContext.state === "suspended") {
        audioContext.resume();
        logToMain("initMic: resumed suspended AudioContext (periodic check)");
      }
    }, 5000);
  } catch (error) {
    logToMain("initMic FAILED: " + error.message);
    diriAPI.sendAudioError("无法访问麦克风：" + error.message);
  }
}

function startRecording() {
  logToMain("startRecording: isRecording=" + isRecording + " micReady=" + micReady);
  if (isRecording) {
    logToMain("startRecording: already recording, ignoring");
    return;
  }

  if (!micReady) {
    pendingStart = true;
    initMic();
    return;
  }

  isRecording = true;
  logToMain("startRecording: started");
}

function stopRecording() {
  logToMain("stopRecording: isRecording=" + isRecording);
  isRecording = false;
}

diriAPI.onStartRecording(() => {
  startRecording();
});

diriAPI.onStopRecording(() => {
  stopRecording();
});

window.onerror = (message, source, lineno, colno, error) => {
  diriAPI.sendRendererError(`audio.js error: ${message} at ${source}:${lineno}:${colno} ${error?.stack || ""}`);
};

window.onunhandledrejection = (event) => {
  diriAPI.sendRendererError(`audio.js unhandled rejection: ${event.reason}`);
};

initMic();
