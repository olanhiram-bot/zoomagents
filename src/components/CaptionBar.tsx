import type { Message, Phase } from "../../shared/types";

export function CaptionBar({
  phase,
  speakerName,
  liveText,
  interim,
  lastMessage,
  listening,
}: {
  phase: Phase;
  speakerName: string | null;
  liveText: string;
  interim: string;
  lastMessage?: Message;
  listening: boolean;
}) {
  const showLive = phase === "speaking" && Boolean(speakerName);
  const showThinking = phase === "thinking";

  const name = showLive ? speakerName : lastMessage?.speakerName ?? null;
  const text = showLive
    ? liveText || "…"
    : showThinking
      ? "El moderador está decidiendo quién toma la palabra."
      : lastMessage?.text ?? "La sala está escuchando. Pulsa el micrófono o escribe para empezar.";

  return (
    <div className={`caption ${showLive || interim ? "is-live" : ""}`}>
      <div className="caption-line">
        {showLive || lastMessage ? (
          <>
            <span className="caption-name">{showLive ? name : name}:</span>{" "}
            <span className="caption-text">{text}</span>
            {showLive && <span className="caret" aria-hidden="true" />}
          </>
        ) : (
          <span className="caption-text is-hint">{text}</span>
        )}
      </div>

      {interim && (
        <div className="caption-interim">
          <span className="caption-name">Tú (en vivo):</span> <span>{interim}</span>
        </div>
      )}

      <div className="caption-state">
        {phase === "ended" ? (
          <span className="pill pill-muted">Reunión terminada</span>
        ) : listening ? (
          <span className="pill pill-live">
            <span className="dot" /> Escuchando
          </span>
        ) : phase === "speaking" ? (
          <span className="pill pill-live">
            <span className="dot" /> Hablando
          </span>
        ) : (
          <span className="pill pill-muted">En pausa</span>
        )}
      </div>
    </div>
  );
}
