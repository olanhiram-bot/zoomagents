import { useEffect, useRef, useState } from "react";

/**
 * Local voice-activity detection for barge-in. Opens a second mic stream with
 * echo cancellation and only listens while an agent holds the floor, so speech
 * cancels the agent instead of being treated as a new turn.
 */
export function useBargeIn({
  enabled,
  active,
  onBargeIn,
  threshold = 0.065,
  frames = 6,
  turnKey = null,
}: {
  enabled: boolean;
  active: boolean;
  onBargeIn: () => void;
  /** RMS floor for the trigger; raise it in noisy rooms. */
  threshold?: number;
  /** Consecutive 50 ms frames needed (6 ≈ 300 ms). */
  frames?: number;
  /** Changes when a different agent takes the floor. */
  turnKey?: string | null;
}) {
  const activeRef = useRef(active);
  const callbackRef = useRef(onBargeIn);
  const thresholdRef = useRef(threshold);
  const framesRef = useRef(frames);
  const turnKeyRef = useRef<string | null>(turnKey);
  activeRef.current = active;
  callbackRef.current = onBargeIn;
  thresholdRef.current = threshold;
  framesRef.current = frames;
  turnKeyRef.current = turnKey;

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return;
    }

    let stopped = false;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let timer: number | null = null;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
          },
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        context = new AudioContext();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const samples = new Uint8Array(analyser.fftSize);
        let floor = 0.01;
        let loudFrames = 0;
        let cooldownUntil = 0;
        let activeSince = 0;
        let lastTurnKey = turnKeyRef.current;

        setReady(true);
        setError(null);

        timer = window.setInterval(() => {
          if (stopped || !activeRef.current) {
            loudFrames = 0;
            activeSince = 0;
            return;
          }
          if (!activeSince) activeSince = Date.now();
          // New speaker: give the new TTS attack the same guard.
          if (turnKeyRef.current !== lastTurnKey) {
            lastTurnKey = turnKeyRef.current;
            activeSince = Date.now();
            loudFrames = 0;
          }

          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const value of samples) {
            const centered = (value - 128) / 128;
            sum += centered * centered;
          }
          const rms = Math.sqrt(sum / samples.length);

          // Slow floor tracking so the agent's own residual echo raises the bar.
          floor = floor * 0.97 + Math.min(rms, 0.1) * 0.03;

          // The first half second of a turn is when TTS attacks hardest; demand
          // more energy there so the agent doesn't interrupt itself.
          const ramp = Date.now() - activeSince < 500 ? 1.7 : 1;
          const limit = Math.min(
            0.22,
            Math.max(thresholdRef.current * ramp, floor * 3),
          );

          if (rms > limit) loudFrames += 1;
          else loudFrames = Math.max(0, loudFrames - 1);

          // Sustained speech, then one trigger per utterance.
          if (loudFrames >= framesRef.current && Date.now() > cooldownUntil) {
            loudFrames = 0;
            cooldownUntil = Date.now() + 1500;
            callbackRef.current();
          }
        }, 50);
      } catch {
        if (!stopped) setError("No se pudo abrir el micrófono para interrumpir.");
      }
    };

    void start();

    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
      setReady(false);
    };
  }, [enabled]);

  return { ready, error, supported: typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) };
}
