import { useEffect, useRef, useState } from "react";
import type { Session } from "../../shared/types";
import { getT3Threads, saveSessionProjects } from "../api";
import { speechSynthesisSupported, useDictation, useSpeaker } from "../speech";
import { useBargeIn } from "../useBargeIn";
import { useRoom } from "../useRoom";
import { AgentPanel } from "./AgentPanel";
import { ApprovalModal } from "./ApprovalModal";
import { CaptionBar } from "./CaptionBar";
import { ChatPanel } from "./ChatPanel";
import { MoreMenu } from "./MoreMenu";
import { ParticipantsModal } from "./ParticipantsModal";
import {
  BackIcon,
  CameraIcon,
  CameraOffIcon,
  ChatIcon,
  MicIcon,
  MicOffIcon,
  MoreIcon,
  ParticipantsIcon,
  PhoneOffIcon,
  ShieldIcon,
  SpeakerIcon,
  SpeakerOffIcon,
  StopIcon,
} from "./Icons";
import { MinutesModal } from "./MinutesModal";
import { T3Threads } from "./T3Threads";
import { projectName, ProjectsDialog } from "./ProjectsDialog";
import { ScreenShare, useScreenShare, type ScreenShareHandle } from "./ScreenShare";
import { AgentTile, HumanTile } from "./Tile";

const LANG = typeof navigator !== "undefined" && navigator.language ? navigator.language : "es-ES";

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (total % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatTokens(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
}

function usageTitle(usage: NonNullable<ReturnType<typeof useRoom>["usage"]>): string {
  const { last, totals } = usage;
  const lines = [`Estimado en el prompt: ~${usage.tokens} tok`];
  if (last) {
    const io =
      last.inputTokens !== null && last.outputTokens !== null
        ? `${last.inputTokens} in · ${last.outputTokens} out`
        : "sin reporte del proveedor";
    lines.push(
      `Última llamada: ${io}${last.cachedTokens ? ` · ${last.cachedTokens} caché` : ""}` +
        `${last.ttftMs !== null ? ` · primer token ${(last.ttftMs / 1000).toFixed(2)}s` : ""}` +
        ` · total ${(last.ms / 1000).toFixed(2)}s` +
        `${last.source === "estimate" ? " (estimado)" : ""}`,
    );
  }
  if (totals) {
    lines.push(
      `${totals.calls} llamadas · ${formatTokens(totals.inputTokens)} in · ${formatTokens(
        totals.outputTokens,
      )} out`,
    );
    if (totals.knownCostCalls) {
      lines.push(
        `Costo conocido: $${totals.costUsd.toFixed(4)}${totals.knownCostCalls < totals.calls ? " (parcial)" : ""}`,
      );
    }
  }
  if (usage.compacted) lines.push("Contexto compactado");
  return lines.join("\n");
}

export function Room({
  sessionId,
  initial,
  humanName,
  onLeave,
}: {
  sessionId: string;
  initial: Session;
  humanName: string;
  onLeave: () => void;
}) {
  const room = useRoom(sessionId, initial);
  const { session, live, phase, activeSpeakerId, lastTurn } = room;

  const screen = useScreenShare({
    enabled: room.connected && phase !== "ended",
    send: room.send,
    showError: room.showError,
  });
  const screenPanel = useRef<ScreenShareHandle>(null);
  const [attachScreen, setAttachScreen] = useState(false);
  useEffect(() => {
    if (!screen.stream) setAttachScreen(false);
  }, [screen.stream]);
  const speaker = useSpeaker(LANG);
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [openAgentId, setOpenAgentId] = useState<string | null>(null);
  const [minutesOpen, setMinutesOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [threadAgent, setThreadAgent] = useState<string | null>(null);
  const [threadStatuses, setThreadStatuses] = useState<Record<string, string>>({});
  const hasThreadLinks = Object.keys(session.t3ThreadsByAgent ?? {}).length > 0;

  useEffect(() => {
    const workspace = session.workspace;
    setThreadStatuses({});
    if (!workspace || !hasThreadLinks || threadsOpen) return;
    const controller = new AbortController();
    let timer: number | undefined;
    async function refresh(path: string) {
      try {
        const threads = await getT3Threads(path, controller.signal);
        if (!controller.signal.aborted) {
          setThreadStatuses(Object.fromEntries(threads.map(({ id, status }) => [id, status])));
        }
      } catch {
        if (!controller.signal.aborted) setThreadStatuses({});
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(() => void refresh(path), 8000);
      }
    }
    void refresh(workspace);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [session.workspace, hasThreadLinks, threadsOpen]);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [endRequested, setEndRequested] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [bargeEnabled, setBargeEnabled] = useState(
    () => localStorage.getItem("za:barge") !== "off",
  );
  const [bargeSensitivity, setBargeSensitivity] = useState<"high" | "medium" | "low">(() => {
    const saved = localStorage.getItem("za:barge-sensitivity");
    return saved === "high" || saved === "low" ? saved : "medium";
  });
  const [interrupted, setInterrupted] = useState(false);
  const [compactNote, setCompactNote] = useState(false);
  const [chatOpen, setChatOpen] = useState(() => {
    const saved = localStorage.getItem("za:chat");
    if (saved === "on") return true;
    if (saved === "off") return false;
    return typeof window !== "undefined" && window.innerWidth >= 1100;
  });
  const [seenCount, setSeenCount] = useState(initial.transcript.length);
  const bargeAtRef = useRef(0);
  const speakingRef = useRef(speaker.speaking);
  speakingRef.current = speaker.speaking;
  const ttsSuppressed = () => Date.now() - bargeAtRef.current < 2500;

  const participants = session.participants;
  const activeAgent = participants.find((participant) => participant.id === activeSpeakerId) ?? null;
  const activeLive = activeSpeakerId ? live[activeSpeakerId] ?? "" : "";
  const lastMessage = session.transcript[session.transcript.length - 1];
  const micEnabled = micOn && phase === "listening" && !speaker.speaking && !minutesOpen && !threadsOpen;

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const dictation = useDictation({
    lang: LANG,
    enabled: micEnabled,
    onFinal: (text) => {
      if (phaseRef.current !== "listening" || !text.trim()) return;
      send(text);
    },
  });

  const agentFloor = phase === "speaking" || phase === "thinking";
  const bargeThreshold =
    bargeSensitivity === "high" ? 0.04 : bargeSensitivity === "low" ? 0.1 : 0.065;
  const bargeFrames =
    bargeSensitivity === "high" ? 4 : bargeSensitivity === "low" ? 8 : 6;

  const barge = useBargeIn({
    enabled: micOn && bargeEnabled && dictation.supported && !minutesOpen && !threadsOpen && agentFloor,
    active: agentFloor,
    threshold: bargeThreshold,
    frames: bargeFrames,
    turnKey: activeSpeakerId,
    onBargeIn: () => {
      bargeAtRef.current = Date.now();
      speaker.cancel();
      room.stop();
      setInterrupted(true);
      window.setTimeout(() => setInterrupted(false), 2500);
    },
  });

  useEffect(() => {
    localStorage.setItem("za:barge", bargeEnabled ? "on" : "off");
  }, [bargeEnabled]);

  useEffect(() => {
    localStorage.setItem("za:barge-sensitivity", bargeSensitivity);
  }, [bargeSensitivity]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!chatOpen) return;
    setSeenCount(session.transcript.length);
  }, [chatOpen, session.transcript.length]);

  const unread = chatOpen ? 0 : Math.max(0, session.transcript.length - seenCount);

  const toggleChat = () => {
    const next = !chatOpen;
    setChatOpen(next);
    localStorage.setItem("za:chat", next ? "on" : "off");
    if (next) setSeenCount(session.transcript.length);
  };

  useEffect(() => {
    if (activeSpeakerId && phase === "speaking") speaker.beginTurn(activeSpeakerId);
  }, [activeSpeakerId, phase, speaker.beginTurn]);

  useEffect(() => {
    if (ttsSuppressed()) return;
    if (activeSpeakerId && activeLive) speaker.feed(activeSpeakerId, activeLive);
  }, [activeLive, activeSpeakerId, speaker.feed]);

  useEffect(() => {
    if (ttsSuppressed()) return;
    if (!lastTurn || lastTurn.kind !== "agent") return;
    speaker.flush(lastTurn.speakerId, lastTurn.text);
  }, [lastTurn, speaker.flush]);

  useEffect(() => {
    if (!lastTurn || lastTurn.kind !== "agent") return;
    const speakerId = lastTurn.speakerId;

    if (!speechSynthesisSupported || !speaker.enabled) {
      room.played(speakerId);
      return;
    }

    let sawSpeech = false;
    let finished = false;
    let timer = 0;
    let hard = 0;
    const started = Date.now();

    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearInterval(timer);
      window.clearTimeout(hard);
      room.played(speakerId);
    };

    timer = window.setInterval(() => {
      if (speakingRef.current) {
        sawSpeech = true;
        return;
      }
      if (sawSpeech || Date.now() - started > 1200) finish();
    }, 120);

    hard = window.setTimeout(finish, 30_000);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(hard);
    };
  }, [lastTurn, room.played, speaker.enabled]);

  useEffect(() => {
    if (!room.lastDrop) return;
    speaker.cancel();
    speaker.beginTurn(room.lastDrop.speakerId);
  }, [room.lastDrop, speaker.cancel, speaker.beginTurn]);

  useEffect(() => {
    if (!room.minutes || !endRequested) return;
    setMinutesOpen(true);
    setEndRequested(false);
  }, [room.minutes, endRequested]);

  useEffect(() => {
    return () => speaker.cancel();
  }, [speaker.cancel]);

  const send = (text: string) => {
    bargeAtRef.current = 0;
    speaker.cancel();
    if (screen.stream && attachScreen) return screenPanel.current?.sendQuestion(text) ?? false;
    room.say(text);
    return true;
  };

  const endCall = () => {
    setEndRequested(true);
    speaker.cancel();
    room.end();
  };

  const stopCall = () => {
    bargeAtRef.current = Date.now();
    speaker.cancel();
    room.stop();
  };

  const compactContext = () => {
    if (phase !== "listening") return;
    room.compact();
    setCompactNote(true);
    window.setTimeout(() => setCompactNote(false), 2500);
  };

  const toggleSound = () => {
    if (speaker.enabled) speaker.cancel();
    speaker.setEnabled(!speaker.enabled);
  };

  const elapsed = Math.max(0, (session.endedAt ?? now) - session.createdAt);
  const busy = phase === "thinking" || phase === "speaking";
  const approval = room.approvals[0] ?? null;
  const workspaceName = session.workspace?.split("/").filter(Boolean).pop();

  const hint = interrupted
    ? "Interrumpido. Te escucho…"
    : compactNote
      ? "Contexto compactado. Los turnos viejos ya no viajan completos."
      : phase === "ended"
        ? "Reunión terminada."
        : busy
          ? bargeEnabled && micOn && barge.ready
            ? "Habla para interrumpir o pulsa Detener."
            : "Los agentes están hablando."
          : !micOn
            ? "Micrófono apagado. Activa Audio para hablar."
            : dictation.listening
              ? "Escuchando: tu turno se envía al terminar la frase."
              : "Pulsa Audio para hablar.";

  return (
    <div className="room">
      <header className="zoom-top">
        <div className="zoom-top-left">
          <button type="button" className="zoom-back" onClick={onLeave} aria-label="Salir de la sala">
            <BackIcon size={18} />
          </button>
          <span className="zoom-shield">
            <ShieldIcon size={15} />
          </span>
          <span className="zoom-encrypted">Cifrada</span>
          <span className="zoom-sep" />
          <h1>{session.title}</h1>
          {session.toolsEnabled && <span className="zoom-chip">Terminal</span>}
          {!room.connected && <span className="zoom-chip is-warn">Reconectando…</span>}
        </div>

        <div className="zoom-top-right">
          {session.workspace && <button type="button" className="zoom-link" onClick={() => { setThreadAgent(null); setThreadsOpen(true); }}>Hilos</button>}
          <button type="button" className="zoom-link" disabled={phase === "ended"} onClick={() => setProjectsOpen(true)}>
            Archivos{workspaceName && session.projectReferences ? ` · ${projectName(session.workspace ?? "")}` : ""}
          </button>
          {room.usage && (
            <span
              className={`zoom-usage ${room.usage.compacted ? "is-compacted" : ""}`}
              title={usageTitle(room.usage)}
            >
              ~{formatTokens(room.usage.tokens)} tok
              {room.usage.last && ` · ${(room.usage.last.ms / 1000).toFixed(1)}s`}
            </span>
          )}
          <span className="zoom-count">{participants.length + 1} participantes</span>
          <span className="zoom-timer">{formatElapsed(elapsed)}</span>
        </div>
      </header>

      <div className="zoom-body">
        <div className="zoom-stage">
          {screen.stream && (
            <ScreenShare
              ref={screenPanel}
              includeInConversation={attachScreen}
              onIncludeInConversation={setAttachScreen}
              stream={screen.stream}
              participants={participants}
              busy={busy}
              proposal={room.screenProposal}
              send={room.send}
              showError={room.showError}
            />
          )}
          <main className={screen.stream ? "grid is-compact screen-participants" : "grid"} data-count={participants.length + 1}>
            <HumanTile
              name={humanName}
              cameraOn={cameraOn}
              listening={dictation.listening}
              active={Boolean(dictation.interim)}
              compact={Boolean(screen.stream)}
            />

            {participants.map((participant) => (
              <AgentTile
                key={participant.id}
                participant={participant}
                active={activeSpeakerId === participant.id}
                compact={Boolean(screen.stream)}
                onOpen={() => setOpenAgentId(participant.id)}
                onWork={session.workspace && phase !== "ended" ? () => {
                  setThreadAgent(participant.id);
                  setThreadsOpen(true);
                } : undefined}
                workStatus={(() => {
                  const id = session.t3ThreadsByAgent?.[participant.id];
                  if (!id) return undefined;
                  const status = threadStatuses[id];
                  return ({ running: "Trabajando", waiting: "En espera", completed: "Completado", failed: "Falló", cancelled: "Cancelado" } as Record<string, string>)[status] ?? status ?? "Hilo vinculado";
                })()}
                onToggleMute={() => room.toggleMute(participant.id, !participant.muted)}
              />
            ))}
          </main>

          <div className="zoom-bottom">
            {phase === "ended" ? (
              <div className="zoom-ended">
                <span>Reunión terminada.</span>
                {session.minutes ? (
                  <button
                    type="button"
                    className="zoom-link"
                    onClick={() => setMinutesOpen(true)}
                  >
                    Ver minuta
                  </button>
                ) : (
                  <span className="zoom-ended-note">Generando minuta…</span>
                )}
                <button type="button" className="zoom-link" onClick={onLeave}>
                  Volver al inicio
                </button>
              </div>
            ) : (
              <>
                {(lastMessage || activeLive || dictation.interim) && (
                  <CaptionBar
                    phase={phase}
                    speakerName={activeAgent ? `${activeAgent.name} (${activeAgent.role})` : null}
                    liveText={activeLive}
                    interim={dictation.interim}
                    lastMessage={lastMessage}
                    listening={dictation.listening}
                  />
                )}
                <div className="zoom-status">
                  <span>{hint}</span>
                  {busy && (
                    <button type="button" className="zoom-stop" onClick={stopCall}>
                      <StopIcon size={14} /> Detener
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {chatOpen && (
          <ChatPanel
            session={session}
            humanName={humanName}
            live={live}
            activeSpeakerId={activeSpeakerId}
            disabled={phase !== "listening"}
            includesScreen={Boolean(screen.stream && attachScreen)}
            onSend={send}
            onClose={toggleChat}
          />
        )}
      </div>

      <footer className="zoom-toolbar">
        <button
          type="button"
          className={`tool-btn ${micOn ? "is-on" : "is-off"}`}
          onClick={() => setMicOn((value) => !value)}
          disabled={!dictation.supported}
          title={micOn ? "Silenciar micrófono" : "Activar micrófono"}
        >
          {micOn ? <MicIcon size={20} /> : <MicOffIcon size={20} />}
          <span>Audio</span>
        </button>

        <button
          type="button"
          className={`tool-btn ${cameraOn ? "is-on" : "is-off"}`}
          onClick={() => setCameraOn((value) => !value)}
          title={cameraOn ? "Apagar cámara" : "Encender cámara"}
        >
          {cameraOn ? <CameraIcon size={20} /> : <CameraOffIcon size={20} />}
          <span>Video</span>
        </button>

        <button
          type="button"
          className="tool-btn"
          onClick={() => setParticipantsOpen(true)}
          title="Ver participantes"
        >
          <ParticipantsIcon size={20} />
          <span>Participantes</span>
        </button>

        <button
          type="button"
          className={`tool-btn ${chatOpen ? "is-on" : ""}`}
          onClick={toggleChat}
          title="Chat de la reunión"
        >
          <ChatIcon size={20} />
          {unread > 0 && <em className="tool-badge">{unread > 9 ? "9+" : unread}</em>}
          <span>Chat</span>
        </button>

        <button
          type="button"
          className={`tool-btn ${speaker.enabled ? "is-on" : "is-off"}`}
          onClick={toggleSound}
          title={speaker.enabled ? "Silenciar a los agentes" : "Activar a los agentes"}
        >
          {speaker.enabled ? <SpeakerIcon size={20} /> : <SpeakerOffIcon size={20} />}
          <span>Sonido</span>
        </button>

        <button
          type="button"
          className={`tool-btn ${screen.stream ? "is-on" : ""}`}
          aria-pressed={Boolean(screen.stream)}
          disabled={!room.connected || phase === "ended" || screen.requesting}
          onClick={screen.stream ? screen.stop : () => void screen.start()}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <rect x="3" y="4" width="18" height="13" rx="2" />
            <path d="M8 21h8m-4-4v4" />
          </svg>
          <span>{screen.stream ? "Dejar de compartir" : "Compartir pantalla"}</span>
        </button>

        <button
          type="button"
          className={`tool-btn ${moreOpen ? "is-on" : ""}`}
          onClick={() => setMoreOpen((value) => !value)}
          title="Más opciones"
        >
          <MoreIcon size={20} />
          <span>Más</span>
        </button>

        <button
          type="button"
          className="zoom-leave"
          onClick={phase === "ended" ? onLeave : endCall}
          title={phase === "ended" ? "Cerrar la sala" : "Terminar la reunión"}
        >
          <PhoneOffIcon size={18} />
          <span>{phase === "ended" ? "Cerrar" : "Salir"}</span>
        </button>
      </footer>

      <MoreMenu
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        bargeEnabled={bargeEnabled}
        onToggleBarge={() => setBargeEnabled((value) => !value)}
        sensitivity={bargeSensitivity}
        onSensitivityChange={setBargeSensitivity}
        onCompact={compactContext}
        compactDisabled={phase !== "listening"}
        minutesAvailable={Boolean(session.minutes)}
        onMinutes={() => {
          setMoreOpen(false);
          setMinutesOpen(true);
        }}
        workspace={session.toolsEnabled ? session.workspace : undefined}
      />

      {threadsOpen && session.workspace && (
        <T3Threads
          key={`${session.workspace}:${threadAgent ?? ""}`}
          workspace={session.workspace}
          onClose={() => setThreadsOpen(false)}
          agent={threadAgent ? {
            id: threadAgent,
            name: participants.find(({ id }) => id === threadAgent)?.role ?? "Agente",
            sessionId,
            threadId: session.t3ThreadsByAgent?.[threadAgent],
          } : undefined}
        />
      )}
      {projectsOpen && (
        <ProjectsDialog
          initial={session.workspace ? { workspace: session.workspace, references: session.projectReferences ?? [] } : null}
          onClose={() => setProjectsOpen(false)}
          onSave={async (projects) => { await saveSessionProjects(sessionId, projects); }}
        />
      )}

      <ParticipantsModal
        open={participantsOpen}
        session={session}
        humanName={humanName}
        onClose={() => setParticipantsOpen(false)}
        onOpenAgent={(id) => {
          setParticipantsOpen(false);
          setOpenAgentId(id);
        }}
      />

      {approval && (
        <ApprovalModal
          key={approval.id}
          request={approval}
          onDecide={(allow, password, remember) =>
            room.decideApproval(approval.id, allow, password, remember)
          }
        />
      )}

      {room.notice && <div className="toast toast-info">{room.notice}</div>}
      {room.error && <div className="toast">{room.error}</div>}
      {room.memoryUpdated ? (
        <div className="toast toast-ok">
          Memoria actualizada en {room.memoryUpdated} agente{room.memoryUpdated === 1 ? "" : "s"}.
        </div>
      ) : null}

      <AgentPanel
        participant={participants.find((participant) => participant.id === openAgentId) ?? null}
        messages={session.transcript}
        onClose={() => setOpenAgentId(null)}
        onToggleMute={(muted) => {
          if (!openAgentId) return;
          room.toggleMute(openAgentId, muted);
        }}
      />

      <MinutesModal
        open={minutesOpen}
        title={session.title}
        markdown={room.minutes}
        sessionId={session.id}
        onClose={() => setMinutesOpen(false)}
      />
    </div>
  );
}
