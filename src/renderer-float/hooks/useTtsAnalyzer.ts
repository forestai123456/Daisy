import { useEffect, useRef } from "react";

export function useTtsAnalyzer() {
  const volumeRef = useRef(0);

  useEffect(() => {
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaElementAudioSourceNode | null = null;
    let audio: HTMLAudioElement | null = null;
    let rafId: number | null = null;

    const cleanup = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;

      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        audio.src = "";
        audio = null;
      }

      if (source) {
        source.disconnect();
        source = null;
      }

      if (analyser) {
        analyser.disconnect();
        analyser = null;
      }

      if (audioCtx && audioCtx.state !== "closed") {
        audioCtx.close();
        audioCtx = null;
      }

      volumeRef.current = 0;
    };

    const readVolume = () => {
      if (!analyser) return;
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      volumeRef.current = sum / data.length / 255;
      rafId = requestAnimationFrame(readVolume);
    };

    const unsubPlay = window.diriAPI.onTtsPlay((filePath) => {
      cleanup();

      audio = new Audio("file://" + filePath);

      audioCtx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source = audioCtx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioCtx.destination);

      audioCtx.resume?.().catch(() => {});
      audio.play().catch(() => {});

      rafId = requestAnimationFrame(readVolume);

      const onDone = () => {
        window.diriAPI.sendTtsPlayEnded();
        cleanup();
      };

      audio.onended = onDone;
      audio.onerror = onDone;
    });

    const unsubEnd = window.diriAPI.onTtsEnd(() => {
      cleanup();
    });

    return () => {
      unsubPlay();
      unsubEnd();
      cleanup();
    };
  }, []);

  return volumeRef;
}
