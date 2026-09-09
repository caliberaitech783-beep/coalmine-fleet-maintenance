import React, { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { findRequestEquipment, requestEquipmentDetails, requestEquipmentOptionLabel, requestEquipmentSearchOptions } from "../request-equipment.mjs";
import "./equipment-combobox.css";

export default function EquipmentCombobox({ records = [], value = "", onSelect, disabled = false, loading = false, group = "" }) {
  const id = useId();
  const input = useRef(null);
  const list = useRef(null);
  const [query, setQuery] = useState(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const selected = findRequestEquipment(records, value);
  const options = requestEquipmentSearchOptions(records, query ?? "");
  const expanded = open && !disabled;
  const activeOption = expanded ? options[active] : null;

  useEffect(() => {
    input.current?.setCustomValidity(selected ? "" : "Select an equipment or vehicle from the matching list.");
  }, [selected, query]);
  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (record) => {
    onSelect(record);
    setQuery(null);
    setActive(-1);
    input.current?.focus();
    setOpen(false);
  };
  const keyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((current) => !options.length ? -1 : event.key === "ArrowDown"
        ? Math.min(current + 1, options.length - 1)
        : current < 0 ? options.length - 1 : Math.max(current - 1, 0));
    } else if (event.key === "Enter" && expanded) {
      event.preventDefault();
      if (activeOption) choose(activeOption.record);
      else if (options.length === 1) choose(options[0].record);
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActive(-1);
    }
  };

  return <div className="equipment-combobox" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setOpen(false);
      setActive(-1);
    }
  }}>
    <label htmlFor={id}>Equipment / vehicle *</label>
    <div className="equipment-combobox-control">
      <input id={id} ref={input} role="combobox" type="text" required autoComplete="off" data-smart-search
        aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-list`}
        aria-activedescendant={activeOption ? `${id}-option-${active}` : undefined}
        aria-describedby={`${id}-hint`} aria-busy={loading} disabled={disabled}
        value={query ?? (selected ? requestEquipmentOptionLabel(selected) : "")}
        placeholder={loading ? "Loading equipment…" : !group ? "Select equipment group first" : "Search and select equipment / vehicle"}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onKeyDown={keyDown}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(-1);
          setOpen(true);
          onSelect(null);
        }} />
      <ChevronDown aria-hidden="true" />
    </div>
    <small id={`${id}-hint`} className="equipment-combobox-hint">
      {group ? `Only ${group} equipment at your site. Search name, door, registration, make, model or chassis.` : "Choose a group to see its equipment at your site."}
    </small>
    {expanded && <div className="equipment-combobox-menu">
      <div className="equipment-combobox-count" role="status">{options.length} {options.length === 1 ? "match" : "matches"}</div>
      <ul id={`${id}-list`} ref={list} role="listbox" aria-label="Matching equipment or vehicles">
        {options.map(({ record, label }, index) => {
          const details = requestEquipmentDetails(record);
          return <li id={`${id}-option-${index}`} key={String(record.id)} role="option" tabIndex={-1}
            aria-selected={String(record.id) === String(value)} data-active={index === active}
            onPointerDown={(event) => { if (event.pointerType === "mouse") event.preventDefault(); }}
            onClick={() => choose(record)}>
            <strong>{label}</strong>
            <small>{[details.make, details.model, details.chassis && `Chassis ${details.chassis}`].filter(Boolean).join(" · ")}</small>
          </li>;
        })}
      </ul>
      {!options.length && <p className="equipment-combobox-empty">No matching equipment in {group}. Try another name or number.</p>}
    </div>}
  </div>;
}
