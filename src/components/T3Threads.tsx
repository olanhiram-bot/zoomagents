import { useEffect, useRef, useState } from "react";
import type { T3Changes, T3ThreadDetail, T3ThreadSummary } from "../../shared/types";
import { getT3Changes, getT3Thread, getT3Threads, linkT3Thread, submitT3Instruction } from "../api";
import { speechSynthesisSupported, useDictation } from "../speech";

export function T3Threads({ workspace, onClose, agent }: {
  workspace: string;
  onClose: () => void;
  agent?: { name: string; id: string; sessionId: string; threadId?: string };
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [threads, setThreads] = useState<T3ThreadSummary[]>([]);
  const [selected, setSelected] = useState(agent?.threadId ?? "");
  const [detail, setDetail] = useState<T3ThreadDetail | null>(null);
  const [changes, setChanges] = useState<T3Changes | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sending, setSending] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [text, setText] = useState("");
  const [base, setBase] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);

  const dictation = useDictation({
    lang: navigator.language || "es",
    enabled: dictating && !sending,
    onFinal: (phrase) => setText((current) => [current, phrase].filter(Boolean).join(" ").slice(0, 12_000)),
  });

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void getT3Threads(workspace, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setThreads(items);
        setError("");
      })
      .catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspace, refresh]);

  useEffect(() => {
    setDetail(null);
    setChanges(null);
    if (!selected) return;
    const controller = new AbortController();
    let timer: number | undefined;
    async function load() {
      try {
        const value = await getT3Thread(workspace, selected, controller.signal);
        if (!controller.signal.aborted) setDetail(value);
      } catch (error) {
        if (!controller.signal.aborted) setError((error as Error).message);
      } finally {
        if (!controller.signal.aborted) {
          setLoadingDetail(false);
          timer = window.setTimeout(load, 6500);
        }
      }
    }
    setLoadingDetail(true);
    void load();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [workspace, selected, refresh]);

  const detailId = detail?.thread.id;
  useEffect(() => {
    if (!showChanges || !detailId) return;
    const controller = new AbortController();
    void getT3Changes(workspace, detailId, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setChanges(result); })
      .catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [workspace, detailId, showChanges, refresh]);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    setDictating(false);
    setError("");
    setNotice("");
    try {
      const { threadId } = await submitT3Instruction(workspace, {
        text, id: selected || undefined, base: selected ? undefined : base.trim() || undefined,
      });
      setText("");
      setNotice(threadId ? "Instrucción enviada al hilo." : "Hilo creado. Selecciónalo para ver el progreso.");
      if (threadId) setSelected(threadId);
      setRefresh((value) => value + 1);
      if (agent && threadId && agent.threadId !== threadId) {
        await linkT3Thread(workspace, agent.sessionId, agent.id, threadId);
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function updateLink(threadId: string | null) {
    if (!agent || sending) return;
    setSending(true);
    setError("");
    try {
      await linkT3Thread(workspace, agent.sessionId, agent.id, threadId);
      setNotice(threadId ? "Hilo vinculado al agente." : "Vínculo eliminado.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSending(false);
    }
  }

  const reply = detail?.messages.filter(({ role }) => role === "assistant").at(-1);

  return (
    <dialog ref={dialog} className="modal projects-dialog t3-threads" aria-labelledby="t3-threads-title"
      onCancel={(event) => { event.preventDefault(); if (!sending) onClose(); }}>
      <header className="modal-head">
        <h2 id="t3-threads-title">{agent ? `Trabajo de ${agent.name}` : "Trabajo en T3 Code"}</h2>
        <button type="button" className="ghost-btn" disabled={sending} onClick={onClose}>Cerrar</button>
      </header>
      <p className="projects-location">{workspace}</p>
      <label className="field">
        <span>Hilo de trabajo</span>
        <select value={selected} disabled={sending || loading} onChange={(event) => {
          setSelected(event.target.value);
          setShowChanges(false);
          setNotice("");
          setError("");
        }}>
          <option value="">Nuevo hilo</option>
          {threads.map((thread) => <option key={thread.id} value={thread.id}>{thread.title || "Hilo sin título"} · {thread.status}</option>)}
        </select>
      </label>
      {agent && (
        <div className="modal-actions">
          {selected && selected !== agent.threadId && <button type="button" className="ghost-btn" disabled={sending || !detail}
            onClick={() => void updateLink(selected)}>Vincular hilo</button>}
          {agent.threadId && <button type="button" className="ghost-btn" disabled={sending}
            onClick={() => void updateLink(null)}>Quitar vínculo</button>}
        </div>
      )}
      {(loading || (selected && loadingDetail)) && <p role="status">Consultando T3 Code…</p>}
      {detail && (
        <section aria-label="Actividad del hilo">
          <div className="modal-actions">
            <a href={detail.thread.link} target="_blank" rel="noreferrer">Abrir en T3 Code</a>
            <button type="button" className="ghost-btn" onClick={() => setShowChanges((value) => !value)}>
              {showChanges ? "Ocultar cambios" : "Ver cambios Git"}
            </button>
            {speechSynthesisSupported && reply && <button type="button" className="ghost-btn" onClick={() => {
              setDictating(false);
              const utterance = new SpeechSynthesisUtterance(reply.text.slice(0, 3000));
              utterance.lang = navigator.language || "es";
              window.speechSynthesis.speak(utterance);
            }}>Escuchar respuesta</button>}
          </div>
          {detail.pending > 0 && <p role="status">{detail.pending} solicitudes pendientes. <a href={detail.thread.link} target="_blank" rel="noreferrer">Resolver en T3 Code</a></p>}
          <p className="muted-note">{detail.branch}{detail.worktree && ` · ${detail.worktree}`}</p>
          <ul className="t3-messages">
            {detail.messages.map((message, index) => (
              <li key={index}><strong>{message.role === "assistant" ? "Agente" : message.role === "user" ? "Tú" : message.role}</strong><span>{message.text}</span></li>
            ))}
          </ul>
          {showChanges && changes && (
            <section aria-label="Cambios Git">
              <p>{changes.branch}</p>
              <pre>{changes.status || "Sin cambios locales."}</pre>
              {changes.diff && <pre>{changes.diff}</pre>}
              {changes.truncated && <p>Vista parcial del diff.</p>}
            </section>
          )}
        </section>
      )}
      <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
        {!selected && <label className="field">
          <span>Base para un worktree nuevo (opcional)</span>
          <input value={base} placeholder="Ej. main. Vacío usa el checkout actual." disabled={sending} onChange={(event) => setBase(event.target.value)} />
        </label>}
        <label className="field">
          <span>Instrucción para el agente</span>
          <textarea value={text} rows={3} maxLength={12_000} disabled={sending} onChange={(event) => setText(event.target.value)} />
        </label>
        {dictating && <p role="status">{dictation.error || dictation.interim || "Escuchando…"}</p>}
        <footer className="modal-actions">
          <button type="button" className="ghost-btn" disabled={loading || sending} onClick={() => setRefresh((value) => value + 1)}>Actualizar</button>
          {dictation.supported && <button type="button" className="ghost-btn" aria-pressed={dictating} disabled={sending} onClick={() => setDictating((value) => !value)}>{dictating ? "Dejar de dictar" : "Dictar"}</button>}
          <button type="submit" className="primary-btn" disabled={loading || sending || !text.trim()}>
            {sending ? "Enviando…" : selected ? "Enviar al hilo" : "Iniciar hilo"}
          </button>
        </footer>
      </form>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </dialog>
  );
}
