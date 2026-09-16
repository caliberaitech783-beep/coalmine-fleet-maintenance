import React, {useEffect, useRef, useState} from "react";

function ProtectedMedia({url, token, label, kind = "attachment", contentType = "", fileName = ""}) {
  const [state, setState] = useState({phase: "idle", objectUrl: "", type: ""});
  const requestRef = useRef(null);

  useEffect(() => {
    requestRef.current?.abort();
    setState((current) => {
      if (current.objectUrl) URL.revokeObjectURL(current.objectUrl);
      return {phase: "idle", objectUrl: "", type: ""};
    });
    return () => requestRef.current?.abort();
  }, [url, token]);

  useEffect(() => () => {
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  }, [state.objectUrl]);

  const load = async () => {
    if (!url || !token || state.phase === "loading") return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState({phase: "loading", objectUrl: "", type: ""});
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: {Authorization: `Bearer ${token}`},
      });
      if (!response.ok) throw new Error(`Could not load ${label.toLowerCase()}.`);
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const objectUrl = URL.createObjectURL(blob);
      setState({phase: "ready", objectUrl, type: blob.type || contentType});
    } catch (error) {
      if (error.name !== "AbortError") setState({phase: "error", objectUrl: "", type: ""});
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  };

  if (state.phase !== "ready") return <button type="button" className={`protected-media-load ${state.phase}`} disabled={state.phase === "loading"} onClick={load}>
    {state.phase === "loading" ? `Loading ${label.toLowerCase()}…` : state.phase === "error" ? `Retry ${label.toLowerCase()}` : `Open ${label.toLowerCase()}`}
  </button>;

  if (kind === "audio") return <audio controls preload="metadata" src={state.objectUrl}>{label}</audio>;
  const type = state.type || contentType;
  if (String(type).startsWith("video/")) return <video className="ticket-media" controls preload="metadata" src={state.objectUrl}>{label} video</video>;
  if (String(type).startsWith("image/")) return <a href={state.objectUrl} target="_blank" rel="noreferrer" title={fileName || `Open ${label.toLowerCase()}`}><img className="ticket-media" src={state.objectUrl} alt={fileName || label} /></a>;
  return <a className="protected-media-file" href={state.objectUrl} target="_blank" rel="noreferrer" download={fileName || undefined}>Open {fileName || label}</a>;
}

export function ProtectedAudio(props) {
  return <ProtectedMedia {...props} kind="audio" />;
}

export function ProtectedAttachment(props) {
  return <ProtectedMedia {...props} kind="attachment" />;
}
