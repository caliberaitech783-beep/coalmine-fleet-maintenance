import React, { useEffect, useState } from "react";
import { changeTableLayout, matchingTableLayout, readTableLayouts, tableLayoutAccount, tableLayoutStorageKey } from "./table-layouts.mjs";
import "./table-layouts.css";

const layoutEvent = "nerve-center-table-layouts";

export function useTableLayouts(table, columns) {
  let key = "";
  try { key = tableLayoutStorageKey(tableLayoutAccount(), table, columns); } catch { /* Manual column selection remains available. */ }
  const read = () => {
    try { return { key, layouts: key ? readTableLayouts(localStorage, key, columns) : [], error: key ? "" : "Sign in to save table layouts." }; }
    catch { return { key, layouts: [], error: "Saved layouts are unavailable in this browser. You can still apply columns." }; }
  };
  const [state, setState] = useState(read);
  useEffect(() => {
    setState(read());
    const refresh = event => { if (!event.key || event.key === key) setState(read()); };
    window.addEventListener("storage", refresh);
    window.addEventListener(layoutEvent, refresh);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener(layoutEvent, refresh); };
  }, [key]);
  const current = state.key === key ? state : read();
  const change = action => {
    if (!key) throw new Error("Sign in to save table layouts.");
    const result = changeTableLayout(localStorage, key, columns, action);
    setState({ key, layouts: result.layouts, error: "" });
    window.dispatchEvent(new Event(layoutEvent));
    return result.selectedId;
  };
  return { ...current, change };
}

export function TableLayoutSelect({ store, visibleKeys, onSelect }) {
  if (!store.layouts.length) return null;
  return <label className="table-layout-quick-select"><span>Layout</span>
    <select aria-label="Table layout" value={matchingTableLayout(store.layouts, visibleKeys)?.id || ""} onChange={event => {
      const layout = store.layouts.find(item => item.id === Number(event.target.value));
      if (layout) onSelect([...layout.keys]);
    }}>
      <option value="" disabled>Custom layout</option>
      {store.layouts.map(layout => <option key={layout.id} value={layout.id}>{layout.name}</option>)}
    </select>
  </label>;
}

export function TableLayoutControls({ store, draftKeys, defaultKeys, onSelect }) {
  const [selectedId, setSelectedId] = useState(() => matchingTableLayout(store.layouts, draftKeys)?.id || "");
  const [mode, setMode] = useState("");
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const selected = store.layouts.find(layout => layout.id === selectedId);
  const modified = selected && !matchingTableLayout([selected], draftKeys);
  const startNaming = nextMode => { setMode(nextMode); setName(nextMode === "rename" ? selected?.name || "" : ""); setError(""); setNotice(""); };
  const change = (type, success) => {
    try {
      const id = store.change({ type, id: selectedId, name, keys: draftKeys });
      setSelectedId(id); setMode(""); setError(""); setNotice(success);
    } catch (problem) { setError(problem.message || "Could not save the table layout. Browser storage may be full or unavailable."); setNotice(""); }
  };
  return <div className="table-layout-controls">
    <div className="table-layout-controls-row">
      <label><span>Saved table layouts</span><select aria-label="Saved table layouts" value={selected?.id || ""} onChange={event => {
        const layout = store.layouts.find(item => item.id === Number(event.target.value));
        setSelectedId(layout?.id || ""); setMode(""); setError(""); setNotice("");
        if (layout) onSelect([...layout.keys]);
      }}>
        <option value="" disabled>Custom layout</option>
        {store.layouts.map(layout => <option key={layout.id} value={layout.id}>{layout.name}</option>)}
      </select></label>
      <button type="button" disabled={!draftKeys.length || !!store.error} onClick={() => startNaming("save")}>Save as new layout</button>
      <button type="button" disabled={!selected || !modified || !draftKeys.length || !!store.error} onClick={() => change("update", "Layout updated. Choose Apply to use these columns.")}>Update layout</button>
      <button type="button" disabled={!selected || !!store.error} onClick={() => startNaming("rename")}>Rename</button>
      <button type="button" disabled={!selected || !!store.error} onClick={() => {
        if (window.confirm(`Delete the table layout “${selected.name}”?`)) change("delete", "Layout deleted. Your column selection is unchanged.");
      }}>Delete</button>
      <button type="button" onClick={() => { onSelect([...defaultKeys]); setSelectedId(""); setMode(""); setError(""); setNotice(""); }}>Default columns</button>
    </div>
    {mode && <form className="table-layout-name-form" onSubmit={event => { event.preventDefault(); change(mode, mode === "rename" ? "Layout renamed." : "Layout saved. Choose Apply to use these columns."); }}>
      <label><span>{mode === "rename" ? "New layout name" : "Layout name"}</span><input autoFocus value={name} maxLength={80} onChange={event => { setName(event.target.value); setError(""); }} placeholder="e.g. Equipment summary" /></label>
      <button type="submit" className="primary" disabled={!name.trim()}>{mode === "rename" ? "Save name" : "Save layout"}</button>
      <button type="button" onClick={() => { setMode(""); setError(""); }}>Cancel naming</button>
    </form>}
    <p className="table-layout-hint">Save the displayed columns and their order for this table. Layouts are saved for your account in this browser.{modified ? " This layout has unsaved column changes." : ""}</p>
    {(error || store.error) && <p className="table-layout-error" role="alert">{error || store.error}</p>}
    {notice && <p className="table-layout-notice" role="status">{notice}</p>}
  </div>;
}
