import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ClientEvent, Participant, ServerEvent } from "../../shared/types";

type Send = (event: ClientEvent) => void;
type ShowError = (message: string) => void;

export function useScreenShare({
  enabled, send, showError,
}: { enabled: boolean; send: Send; showError: ShowError }) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [requesting, setRequesting] = useState(false);
  const active = useRef<MediaStream | null>(null);
  const generation = useRef(0);

  const release = useCallback(() => {
    generation.current++;
    active.current?.getTracks().forEach((track) => track.stop());
    active.current = null;
    send({ type: "screen_stop" });
  }, [send]);

  const stop = useCallback(() => {
    release();
    setStream(null);
    setRequesting(false);
  }, [release]);

  useEffect(() => release, [release]);
  useEffect(() => {
    if (!enabled) stop();
  }, [enabled, stop]);

  async function start() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      showError("Este navegador no permite compartir pantalla aquí. Abre la sala en localhost o HTTPS.");
      return;
    }
    const request = ++generation.current;
    setRequesting(true);
    try {
      const capture = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (request !== generation.current) {
        capture.getTracks().forEach((track) => track.stop());
        return;
      }
      const track = capture.getVideoTracks()[0];
      if (!track || track.readyState === "ended") {
        capture.getTracks().forEach((item) => item.stop());
        throw new Error("La captura de pantalla terminó.");
      }
      active.current = capture;
      track.addEventListener("ended", stop, { once: true });
      setStream(capture);
    } catch (error) {
      if (request !== generation.current || (error as DOMException).name === "NotAllowedError") return;
      showError((error as Error).message || "No se pudo compartir la pantalla.");
    } finally {
      if (request === generation.current) setRequesting(false);
    }
  }

  return { stream, requesting, start, stop };
}

export type ScreenShareHandle = { sendQuestion: (text: string) => boolean };

export function ScreenShare({
  ref, stream, participants, busy, proposal, send, showError, includeInConversation, onIncludeInConversation,

}: {
  ref: React.Ref<ScreenShareHandle>;
  includeInConversation: boolean;
  onIncludeInConversation: (value: boolean) => void;
  stream: MediaStream;
  participants: Participant[];
  busy: boolean;
  proposal: Extract<ServerEvent, { type: "screen_action" }>["proposal"];
  send: Send;
  showError: ShowError;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ratio, setRatio] = useState(16 / 9);
  const [agentId, setAgentId] = useState("");
  const [task, setTask] = useState("");
  const [control, setControl] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const agents = participants.filter((agent) => !agent.muted && agent.provider !== "mock");
  const selected = agents.find((agent) => agent.id === agentId)?.id ?? agents[0]?.id ?? "";
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    return () => {
      video.srcObject = null;
      window.clearTimeout(timer.current);
    };
  }, [stream]);

  function submit(text: string, allowControl: boolean) {
    if (!selected || busy || scheduled) {
      showError(!selected ? "Selecciona un agente con visión." : "Espera a que termine el turno actual.");
      return false;
    }
    const video = videoRef.current;
    const track = stream.getVideoTracks()[0];
    if (!video?.videoWidth || video.readyState < 2 || track?.readyState !== "live" || track.muted) {
      showError("Espera a que la vista previa muestre la pantalla.");
      return false;
    }
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      showError("No se pudo preparar la captura.");
      return false;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.78).split(",")[1];
    if (!image) {
      showError("No se pudo preparar la captura.");
      return false;
    }
    send({
      type: "screen_turn", agentId: selected, text: text.trim(), image,
      monitor: track.getSettings().displaySurface === "monitor", control: local && allowControl,
    });
    return true;
  }

  useImperativeHandle(ref, () => ({ sendQuestion: (text) => submit(text, false) }));

  const action = proposal?.action;
  const actionLabel = action?.type === "click"
    ? `Clic en (${Math.round(action.x * 100)} %, ${Math.round(action.y * 100)} %)`
    : action?.type === "type" ? `Escribir «${action.text}»` : action ? `Pulsar ${action.key}` : "";

  return (
    <section className="screen-share" aria-label="Pantalla compartida">
      <div className="screen-video">
        <div className="screen-image" style={{ aspectRatio: ratio, width: `min(100cqw, ${ratio * 100}cqh)` }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            aria-label="Vista previa de la pantalla compartida"
            onResize={(event) => {
              const { videoWidth, videoHeight } = event.currentTarget;
              if (videoHeight) setRatio(videoWidth / videoHeight);
            }}
          />
          {action?.type === "click" && (
            <div className="screen-target" aria-hidden="true" style={{ left: `${action.x * 100}%`, top: `${action.y * 100}%` }} />
          )}
        </div>
      </div>
      <form className="screen-controls" onSubmit={(event) => { event.preventDefault(); submit(task.trim() || "Describe brevemente lo que ves en la pantalla.", control); }}>
        <select aria-label="Agente que verá la pantalla" value={selected} onChange={(event) => setAgentId(event.target.value)}>
          {!agents.length && <option value="">Sin agentes disponibles</option>}
          {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.role} · {agent.name}</option>)}
        </select>
        <input
          aria-label="Instrucción para el agente"
          placeholder="¿Qué quieres que vea o haga?"
          value={task}
          maxLength={2000}
          onChange={(event) => setTask(event.target.value)}
        />
        {local && (
          <label>
            <input type="checkbox" checked={control} onChange={(event) => {
              setControl(event.target.checked);
              if (!event.target.checked) {
                send({ type: "screen_stop" });
                window.clearTimeout(timer.current);
                setScheduled(false);
              }
            }} /> Permitir propuestas de control
          </label>
        )}
        <button type="submit" disabled={busy || scheduled || !selected || (control && !task.trim())}>
          {control ? "Pedir paso" : "Mostrar al agente"}
        </button>
      </form>
      <label className="screen-caption">
        <input type="checkbox" checked={includeInConversation} disabled={!selected}
          onChange={(event) => onIncludeInConversation(event.target.checked)} /> Adjuntar captura a mis mensajes y al hablar
      </label>
      <p className="screen-caption">
        {includeInConversation
          ? "El chat y el micrófono envían una captura al proveedor del agente seleccionado."
          : "Vista previa local. Pulsa Mostrar al agente para enviarle una captura."}
      </p>
      {proposal && control && (
        <div className="screen-action" role="group" aria-label="Acción propuesta">
          <span>{actionLabel}</span>
          <button type="button" onClick={() => send({ type: "screen_decision", id: proposal.id, allow: false })}>Rechazar</button>
          <button type="button" onClick={() => {
            setScheduled(true);
            timer.current = window.setTimeout(() => setScheduled(false), 3000);
            send({ type: "screen_decision", id: proposal.id, allow: true });
          }}>Autorizar en 3 s</button>
        </div>
      )}
      {scheduled && (
        <div className="screen-action">
          <span role="status">Paso autorizado. Enfoca la aplicación de destino.</span>
          <button type="button" onClick={() => {
            send({ type: "screen_stop" });
            window.clearTimeout(timer.current);
            setScheduled(false);
          }}>Cancelar paso</button>
        </div>
      )}
    </section>
  );
}
