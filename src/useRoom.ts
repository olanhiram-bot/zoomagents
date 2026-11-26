import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ApprovalRequest,
  ClientEvent,
  Message,
  Phase,
  ServerEvent,
  Session,
  TurnUsage,
  UsageTotals,
} from "../shared/types";
import { wsUrl } from "./api";

type UsageView = {
  tokens: number;
  compacted: boolean;
  last?: TurnUsage;
  totals?: UsageTotals;
};

export function useRoom(sessionId: string, initial: Session) {
  const [session, setSession] = useState<Session>(initial);
  const [live, setLive] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>(initial.phase);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(initial.activeSpeakerId);
  const [minutes, setMinutes] = useState<string | null>(initial.minutes ?? null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastTurn, setLastTurn] = useState<Message | null>(null);
  const [lastDrop, setLastDrop] = useState<{ speakerId: string; at: number } | null>(null);
  const [memoryUpdated, setMemoryUpdated] = useState<number | null>(null);
  const [screenProposal, setScreenProposal] = useState<Extract<ServerEvent, { type: "screen_action" }>["proposal"]>(null);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [usage, setUsage] = useState<UsageView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<number | null>(null);
  const closedRef = useRef(false);
  const errorTimerRef = useRef<number | null>(null);

  const showError = useCallback((message: string) => {
    setError(message);
    if (errorTimerRef.current) window.clearTimeout(errorTimerRef.current);
    errorTimerRef.current = window.setTimeout(() => setError(null), 7000);
  }, []);

  useEffect(() => {
    closedRef.current = false;

    const connect = () => {
      if (closedRef.current) return;
      const socket = new WebSocket(wsUrl(sessionId));
      socketRef.current = socket;

      socket.onopen = () => setConnected(true);

      socket.onmessage = (event) => {
        let payload: ServerEvent;
        try {
          payload = JSON.parse(event.data) as ServerEvent;
        } catch {
          return;
        }

        switch (payload.type) {
          case "state":
            setSession(payload.session);
            setPhase(payload.session.phase);
            setActiveSpeakerId(payload.session.activeSpeakerId);
            if (typeof payload.session.contextTokens === "number") {
              setUsage({
                tokens: payload.session.contextTokens,
                compacted: Boolean(payload.session.compacted),
                last: payload.session.lastUsage,
                totals: payload.session.usageTotals,
              });
            }
            break;
          case "phase":
            setPhase(payload.phase);
            setActiveSpeakerId(payload.activeSpeakerId);
            if (payload.phase === "listening" || payload.phase === "ended") {
              setLive({});
              // An interrupted round cancels any pending sudo prompt.
              setApprovals([]);
            }
            break;
          case "turn_start": {
            const speakerId = payload.message.speakerId;
            setLive((prev) => ({ ...prev, [speakerId]: "" }));
            break;
          }
          case "delta": {
            const { speakerId, text } = payload;
            setLive((prev) => ({
              ...prev,
              [speakerId]: (prev[speakerId] ?? "") + text,
            }));
            break;
          }
          case "turn_drop": {
            const speakerId = payload.speakerId;
            setLive((prev) => {
              const next = { ...prev };
              delete next[speakerId];
              return next;
            });
            setLastDrop({ speakerId, at: Date.now() });
            break;
          }
          case "turn_end": {
            const message = payload.message;
            setSession((prev) => {
              if (prev.transcript.some((existing) => existing.id === message.id)) return prev;
              return { ...prev, transcript: [...prev.transcript, message] };
            });
            setLive((prev) => {
              const next = { ...prev };
              delete next[message.speakerId];
              return next;
            });
            setLastTurn(message);
            break;
          }
          case "minutes":
            setMinutes(payload.markdown);
            break;
          case "memory":
            setMemoryUpdated(payload.updated);
            window.setTimeout(() => setMemoryUpdated(null), 6000);
            break;
          case "screen_action":
            setScreenProposal(payload.proposal);
            break;
          case "approval":
            setApprovals((prev) =>
              prev.some((item) => item.id === payload.request.id)
                ? prev
                : [...prev, payload.request],
            );
            break;
          case "usage":
            setUsage((prev) => ({
              tokens: payload.tokens,
              compacted: payload.compacted,
              last: payload.last ?? prev?.last,
              totals: payload.totals ?? prev?.totals,
            }));
            break;
          case "notice":
            setNotice(payload.message);
            window.setTimeout(() => setNotice(null), 6000);
            break;
          case "error":
            showError(payload.message);
            break;
        }
      };

      socket.onclose = () => {
        setConnected(false);
        setScreenProposal(null);
        if (closedRef.current) return;
        timerRef.current = window.setTimeout(connect, 1200);
      };

      socket.onerror = () => socket.close();
    };

    connect();

    return () => {
      closedRef.current = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      socketRef.current?.close();
    };
  }, [sessionId, showError]);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) window.clearTimeout(errorTimerRef.current);
    };
  }, []);

  const send = useCallback((event: ClientEvent) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event));
    }
  }, []);

  const say = useCallback((text: string) => send({ type: "say", text }), [send]);
  const stop = useCallback(() => send({ type: "stop" }), [send]);
  const end = useCallback(() => send({ type: "end" }), [send]);
  const compact = useCallback(() => send({ type: "compact" }), [send]);
  const played = useCallback(
    (speakerId: string) => send({ type: "played", speakerId }),
    [send],
  );
  const toggleMute = useCallback(
    (agentId: string, muted: boolean) => send({ type: "mute", agentId, muted }),
    [send],
  );

  const decideApproval = useCallback(
    (id: string, allow: boolean, password?: string, remember?: boolean) => {
      send({ type: "approval", id, allow, password, remember });
      setApprovals((prev) => prev.filter((item) => item.id !== id));
    },
    [send],
  );

  return {
    session,
    live,
    phase,
    activeSpeakerId,
    minutes,
    error,
    connected,
    lastTurn,
    lastDrop,
    memoryUpdated,
    approvals,
    screenProposal,
    send,
    decideApproval,
    usage,
    notice,
    compact,
    played,
    say,
    stop,
    end,
    toggleMute,
    setMinutes,
    showError,
  };
}
