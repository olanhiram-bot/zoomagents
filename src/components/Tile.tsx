import { useEffect, useRef, useState } from "react";
import type { Participant } from "../../shared/types";
import { Waveform } from "./Avatar";
import { AgentFace } from "./AgentFace";
import { CameraIcon, CameraOffIcon, ExpandIcon, MicIcon, MicOffIcon } from "./Icons";

export function AgentTile({
  participant,
  active,
  compact,
  onOpen,
  onToggleMute,
  onWork,
  workStatus,
}: {
  participant: Participant;
  active: boolean;
  compact: boolean;
  onOpen: () => void;
  onToggleMute: () => void;
  onWork?: () => void;
  workStatus?: string;
}) {
  return (
    <article
      className={`tile ${active ? "is-active" : ""} ${participant.muted ? "is-muted" : ""} ${
        compact ? "is-compact" : ""
      }`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) onOpen();
      }}
    >
      <button
        type="button"
        className={`tile-mic ${participant.muted ? "is-off" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          onToggleMute();
        }}
        aria-label={participant.muted ? `Activar a ${participant.name}` : `Silenciar a ${participant.name}`}
        title={participant.muted ? "Activar en la sala" : "Silenciar en la sala"}
      >
        {participant.muted ? <MicOffIcon size={14} /> : <MicIcon size={14} />}
      </button>

      {onWork && (
        <button type="button" className="tile-work" aria-label={`Trabajo de ${participant.role}`}
          onClick={(event) => { event.stopPropagation(); onWork(); }}>
          {workStatus || "Trabajo"}
        </button>
      )}

      <div className="tile-body">
        <div className={`avatar face-avatar ${active ? "is-speaking" : ""}`}>
          <AgentFace
            seed={participant.avatarSeed}
            name={participant.name}
            role={participant.role}
            size={compact ? 48 : 76}
          />
        </div>
      </div>

      {active && <Waveform className="tile-wave" />}
      <span className="expand-hint">
        <ExpandIcon size={14} />
      </span>

      <span className="name-pill">
        {participant.name}
        <span className="name-role"> ({participant.role})</span>
      </span>
    </article>
  );
}

function useLocalCamera(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setError(null);
      return;
    }
    let stream: MediaStream | null = null;
    let cancelled = false;

    navigator.mediaDevices
      ?.getUserMedia({ video: { width: { ideal: 1280 }, facingMode: "user" }, audio: false })
      .then((next) => {
        if (cancelled) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = next;
        if (videoRef.current) videoRef.current.srcObject = next;
        setError(null);
      })
      .catch(() => setError("Sin acceso a la cámara."));

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [enabled]);

  return { videoRef, error };
}

export function HumanTile({
  name,
  cameraOn,
  listening,
  active,
  compact,
}: {
  name: string;
  cameraOn: boolean;
  listening: boolean;
  active: boolean;
  compact: boolean;
}) {
  const { videoRef, error } = useLocalCamera(cameraOn);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <article className={`tile human-tile ${active ? "is-active" : ""} ${compact ? "is-compact" : ""}`}>
      <div className="tile-body">
        {cameraOn ? (
          <video ref={videoRef} className="self-video" autoPlay muted playsInline />
        ) : (
          <div className="human-avatar">{(initials || "Tú").slice(0, 2)}</div>
        )}
      </div>

      <span className={`tile-mic human-mic ${listening ? "is-live" : "is-off"}`}>
        {listening ? <MicIcon size={14} /> : <MicOffIcon size={14} />}
      </span>

      {cameraOn && error && <span className="tile-error">{error}</span>}
      <span className="self-badge">
        {cameraOn ? <CameraIcon size={12} /> : <CameraOffIcon size={12} />}
      </span>
      <span className="name-pill">
        {name || "Tú"}
        <span className="name-role"> (tú)</span>
      </span>
    </article>
  );
}
