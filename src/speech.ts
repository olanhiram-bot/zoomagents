import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

const RecognitionCtor: (new () => SpeechRecognitionLike) | undefined =
  typeof window === "undefined"
    ? undefined
    : ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition);

export const dictationSupported = Boolean(RecognitionCtor);
export const speechSynthesisSupported =
  typeof window !== "undefined" && "speechSynthesis" in window;

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Turns the microphone into final text utterances. Uses the browser's speech
 * engine, so it costs nothing and needs no API key. Swap this hook for a
 * Deepgram/AssemblyAI stream when you move to LiveKit.
 */
export function useDictation(options: {
  lang: string;
  enabled: boolean;
  onFinal: (text: string) => void;
}) {
  const { lang, enabled, onFinal } = options;
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const pendingRef = useRef("");
  const flushTimerRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const text = pendingRef.current.trim();
    pendingRef.current = "";
    if (text) onFinalRef.current(text);
    setInterim("");
  }, []);

  useEffect(() => {
    const Ctor = RecognitionCtor;
    if (!enabled || !Ctor) {
      setListening(false);
      setInterim("");
      return;
    }

    let stopped = false;
    let recognition: SpeechRecognitionLike | null = null;

    const start = () => {
      if (stopped) return;
      const instance = new Ctor();
      instance.lang = lang;
      instance.continuous = true;
      instance.interimResults = true;

      instance.onresult = (event: any) => {
        let finalText = "";
        let interimText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0]?.transcript ?? "";
          if (result.isFinal) finalText += transcript;
          else interimText += transcript;
        }
        if (finalText) {
          pendingRef.current = `${pendingRef.current} ${finalText}`.trim();
          if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
          flushTimerRef.current = window.setTimeout(flush, 950);
        }
        setInterim(interimText.trim());
      };

      instance.onerror = (event: any) => {
        if (event.error === "no-speech" || event.error === "aborted") return;
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setError("El navegador bloqueó el micrófono. Revisa el permiso del sitio.");
        }
      };

      instance.onend = () => {
        setListening(false);
        if (!stopped) {
          window.setTimeout(() => {
            try {
              instance.start();
              setListening(true);
            } catch {
              /* Chrome tira error si ya está corriendo. */
            }
          }, 250);
        }
      };

      try {
        instance.start();
        setListening(true);
        setError(null);
      } catch {
        setError("No se pudo iniciar el micrófono.");
      }
      recognition = instance;
    };

    start();

    return () => {
      stopped = true;
      flush();
      recognition?.abort();
      setListening(false);
    };
  }, [enabled, lang, flush]);

  return { interim, listening, error, supported: dictationSupported };
}

/**
 * Text-to-speech with one stable voice per agent. Sentences are spoken while
 * the agent is still streaming, so the room feels live instead of waiting for
 * the whole turn.
 */
export function useSpeaker(lang: string) {
  const [enabled, setEnabledState] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const enabledRef = useRef(true);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const consumedRef = useRef<Record<string, number>>({});
  const activeUtterancesRef = useRef(0);

  useEffect(() => {
    if (!speechSynthesisSupported) return;
    const load = () => {
      const list = window.speechSynthesis.getVoices();
      voicesRef.current = list;
      setVoices(list);
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled && speechSynthesisSupported) {
      window.speechSynthesis.cancel();
      consumedRef.current = {};
      setSpeaking(false);
    }
  }, [enabled]);

  const pickVoice = useCallback((seed: string): SpeechSynthesisVoice | undefined => {
    const all = voicesRef.current;
    if (!all.length) return undefined;
    const preferred = all.filter((voice) => voice.lang.toLowerCase().startsWith("es"));
    const pool = preferred.length ? preferred : all;
    return pool[hash(seed) % pool.length];
  }, []);

  const speak = useCallback(
    (text: string, seed: string) => {
      const clean = text.trim();
      if (!clean || !enabledRef.current || !speechSynthesisSupported) return;

      const utterance = new SpeechSynthesisUtterance(clean);
      const voice = pickVoice(seed);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = lang;
      }
      utterance.rate = 1.03;
      utterance.pitch = 0.86 + (hash(seed) % 30) / 100;

      activeUtterancesRef.current += 1;
      setSpeaking(true);
      utterance.onend = () => {
        activeUtterancesRef.current = Math.max(0, activeUtterancesRef.current - 1);
        if (activeUtterancesRef.current === 0) setSpeaking(false);
      };
      utterance.onerror = () => {
        activeUtterancesRef.current = Math.max(0, activeUtterancesRef.current - 1);
        if (activeUtterancesRef.current === 0) setSpeaking(false);
      };

      window.speechSynthesis.speak(utterance);
    },
    [lang, pickVoice],
  );

  const beginTurn = useCallback((speakerId: string) => {
    consumedRef.current[speakerId] = 0;
  }, []);

  /** Speak complete sentences as they arrive in the stream. */
  const feed = useCallback(
    (speakerId: string, text: string) => {
      if (!enabledRef.current) return;
      const consumed = consumedRef.current[speakerId] ?? 0;
      const pending = text.slice(consumed);
      if (pending.length < 30) return;
      const match = pending.match(/^([\s\S]{20,}?[.!?…])(\s+|$)/);
      if (!match) return;
      consumedRef.current[speakerId] = consumed + match[0].length;
      speak(match[1], speakerId);
    },
    [speak],
  );

  const flush = useCallback(
    (speakerId: string, text: string) => {
      const consumed = consumedRef.current[speakerId] ?? 0;
      consumedRef.current[speakerId] = text.length;
      const rest = text.slice(consumed).trim();
      if (rest) speak(rest, speakerId);
    },
    [speak],
  );

  const cancel = useCallback(() => {
    if (!speechSynthesisSupported) return;
    window.speechSynthesis.cancel();
    consumedRef.current = {};
    activeUtterancesRef.current = 0;
    setSpeaking(false);
  }, []);

  const setEnabled = useCallback((value: boolean) => setEnabledState(value), []);

  return {
    enabled,
    setEnabled,
    speaking,
    feed,
    beginTurn,
    flush,
    cancel,
    voices,
    supported: speechSynthesisSupported,
  };
}
