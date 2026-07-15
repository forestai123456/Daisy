/* global diriAPI */

const TARGET_SAMPLE_RATE = 16000;

let audioContext = null;
let mediaStream = null;
let source = null;
let processor = null;
let gainNode = null;
let isRecording = false;
let micReady = false;
let micInitPromise = null;
let resumeInterval = null;
let desiredRecording = false;
let operationGeneration = 0;
let wakeWordEnabled = false;
let shuttingDown = false;

function logToMain(msg) {
  diriAPI.sendRendererLog("AUDIO_LOG: " + msg);
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

function releaseMic(reason) {
  const hadResources = Boolean(mediaStream || audioContext || source || processor || gainNode);
  if (hadResources) {
    logToMain("releaseMic: " + reason);
  }

  if (resumeInterval) {
    clearInterval(resumeInterval);
    resumeInterval = null;
  }

  if (processor) {
    processor.onaudioprocess = null;
    try { processor.disconnect(); } catch (_error) {}
  }
  if (source) {
    try { source.disconnect(); } catch (_error) {}
  }
  if (gainNode) {
    try { gainNode.disconnect(); } catch (_error) {}
  }
  if (mediaStream) {
    try {
      mediaStream.getTracks().forEach((track) => track.stop());
    } catch (_error) {}
  }

  const contextToClose = audioContext;
  audioContext = null;
  mediaStream = null;
  source = null;
  processor = null;
  gainNode = null;
  micReady = false;
  isRecording = false;

  if (contextToClose && contextToClose.state !== "closed") {
    contextToClose.close().catch((error) => {
      logToMain("releaseMic: failed to close AudioContext: " + error.message);
    });
  }
}

async function ensureMic() {
  if (micReady && audioContext && mediaStream) return true;
  if (micInitPromise) return micInitPromise;

  const initPromise = (async () => {
    let newStream = null;
    let newContext = null;
    let newSource = null;
    let newProcessor = null;
    let newGain = null;

    try {
      logToMain("ensureMic: requesting getUserMedia");
      newStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 48000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

      newContext = new AudioContext({ sampleRate: 48000 });
      newSource = newContext.createMediaStreamSource(newStream);

      const bufferSize = 4096;
      newProcessor = newContext.createScriptProcessor(bufferSize, 1, 1);
      newGain = newContext.createGain();
      newGain.gain.value = 0.0001;

      // Capture the context locally so a later cleanup cannot make this
      // callback dereference a different generation's global AudioContext.
      const inputSampleRate = newContext.sampleRate;
      newProcessor.onaudioprocess = (event) => {
        if (!isRecording && !wakeWordEnabled) return;
        const inputData = event.inputBuffer.getChannelData(0);

        audioLogCounter++;
        if (audioLogCounter % 100 === 0) {
          let max = 0;
          for (let i = 0; i < inputData.length; i++) {
            const abs = Math.abs(inputData[i]);
            if (abs > max) max = abs;
          }
          logToMain("audio flowing: " + audioLogCounter + " frames, maxLevel=" + max.toFixed(4));
        }

        const downsampled = downsampleBuffer(inputData, inputSampleRate);
        const pcm = floatTo16BitPCM(downsampled);
        diriAPI.sendAudioData(uint8ToBase64(pcm));
      };

      newSource.connect(newProcessor);
      newProcessor.connect(newGain);
      newGain.connect(newContext.destination);

      mediaStream = newStream;
      audioContext = newContext;
      source = newSource;
      processor = newProcessor;
      gainNode = newGain;
      micReady = true;
      logToMain("ensureMic: mic acquired and pipeline ready");

      if (newContext.state === "suspended") {
        await newContext.resume();
        logToMain("ensureMic: resumed suspended AudioContext");
      }

      if (resumeInterval) clearInterval(resumeInterval);
      resumeInterval = setInterval(() => {
        if (audioContext && audioContext.state === "suspended") {
          audioContext.resume().catch(() => {});
          logToMain("ensureMic: resumed suspended AudioContext (periodic check)");
        }
      }, 5000);

      if (shuttingDown || (!desiredRecording && !wakeWordEnabled)) {
        releaseMic(shuttingDown ? "window shutting down" : "pending start was cancelled");
        return false;
      }

      return true;
    } catch (error) {
      if (newProcessor) {
        newProcessor.onaudioprocess = null;
        try { newProcessor.disconnect(); } catch (_disconnectError) {}
      }
      if (newSource) {
        try { newSource.disconnect(); } catch (_disconnectError) {}
      }
      if (newGain) {
        try { newGain.disconnect(); } catch (_disconnectError) {}
      }
      if (newStream) {
        try { newStream.getTracks().forEach((track) => track.stop()); } catch (_stopError) {}
      }
      if (newContext && newContext.state !== "closed") {
        newContext.close().catch(() => {});
      }
      throw error;
    }
  })();

  micInitPromise = initPromise;
  try {
    return await initPromise;
  } finally {
    if (micInitPromise === initPromise) {
      micInitPromise = null;
    }
  }
}

async function setWakeWordEnabled(enabled) {
  wakeWordEnabled = enabled;
  logToMain("setWakeWordEnabled: enabled=" + enabled + " isRecording=" + isRecording);

  if (!enabled) {
    if (!desiredRecording && !isRecording) {
      releaseMic("wake-word monitoring disabled");
    }
    return;
  }

  if (!shuttingDown) {
    try {
      await ensureMic();
    } catch (error) {
      logToMain("setWakeWordEnabled: wake-word mic start failed: " + error.message);
      diriAPI.sendAudioError("无法访问麦克风：" + error.message);
    }
  }
}

async function startRecording() {
  const myGeneration = ++operationGeneration;
  desiredRecording = true;
  logToMain("startRecording: generation=" + myGeneration + " isRecording=" + isRecording + " micReady=" + micReady);

  try {
    const ready = await ensureMic();
    if (myGeneration !== operationGeneration || !desiredRecording || shuttingDown) return;
    if (!ready || !micReady) {
      throw new Error("麦克风初始化已取消");
    }

    isRecording = true;
    logToMain("startRecording: ready generation=" + myGeneration);
    diriAPI.sendAudioReady();
  } catch (error) {
    if (myGeneration !== operationGeneration || !desiredRecording || shuttingDown) return;
    desiredRecording = false;
    isRecording = false;
    releaseMic("recording start failed");
    logToMain("startRecording FAILED: " + error.message);
    diriAPI.sendAudioError("无法访问麦克风：" + error.message);
  }
}

function stopRecording() {
  const myGeneration = ++operationGeneration;
  logToMain("stopRecording: generation=" + myGeneration + " isRecording=" + isRecording + " micReady=" + micReady);
  desiredRecording = false;
  isRecording = false;

  if (!wakeWordEnabled) {
    releaseMic("recording stopped");
  }

  // Always acknowledge STOP, including cancellation during getUserMedia.
  // The in-flight initializer checks desiredRecording before publishing READY.
  diriAPI.sendAudioStopped();
}

diriAPI.onStartRecording(() => {
  startRecording();
});

diriAPI.onStopRecording(() => {
  stopRecording();
});

diriAPI.onWakeWordEnabled((enabled) => {
  setWakeWordEnabled(Boolean(enabled));
});

window.onerror = (message, source, lineno, colno, error) => {
  diriAPI.sendRendererError(`audio.js error: ${message} at ${source}:${lineno}:${colno} ${error?.stack || ""}`);
};

window.onunhandledrejection = (event) => {
  diriAPI.sendRendererError(`audio.js unhandled rejection: ${event.reason}`);
};

window.addEventListener("beforeunload", () => {
  shuttingDown = true;
  operationGeneration++;
  desiredRecording = false;
  releaseMic("window unloading");
});
