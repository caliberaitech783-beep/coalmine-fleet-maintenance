import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import {ChevronDown,Search} from 'lucide-react';
import './searchable-select.css';

const normalize=(value)=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const normalizedOption=(option)=>typeof option==='string'
  ? {value:option,label:option,description:'',keywords:''}
  : {value:String(option?.value??''),label:String(option?.label??option?.value??''),description:String(option?.description??''),keywords:String(option?.keywords??''),disabled:Boolean(option?.disabled)};

export default function SearchableSelect({
  label,
  name,
  options=[],
  value,
  defaultValue='',
  onChange,
  required=false,
  disabled=false,
  loading=false,
  placeholder='Search and select',
  hint='',
  emptyText='No matching records found.',
  className='',
}){
  const id=useId();
  const input=useRef(null);
  const list=useRef(null);
  const controlled=value!==undefined;
  const [internalValue,setInternalValue]=useState(String(defaultValue??''));
  const [query,setQuery]=useState(null);
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(-1);
  const allOptions=useMemo(()=>options.map(normalizedOption),[options]);
  const selectedValue=controlled?String(value??''):internalValue;
  const selected=allOptions.find((option)=>option.value===selectedValue);
  const matching=useMemo(()=>{
    const needle=normalize(query??'');
    return needle?allOptions.filter((option)=>normalize(`${option.label} ${option.description} ${option.keywords}`).includes(needle)):allOptions;
  },[allOptions,query]);
  const visibleOptions=matching.slice(0,100);
  const expanded=open&&!disabled;
  const activeOption=expanded?visibleOptions[active]:null;

  useEffect(()=>{input.current?.setCustomValidity(required&&!selected?'Select a value from the matching list.':'')},[required,selected]);
  useEffect(()=>{list.current?.querySelector('[data-active="true"]')?.scrollIntoView({block:'nearest'})},[active]);

  const commit=(next,option=null)=>{
    if(!controlled)setInternalValue(next);
    onChange?.(next,option);
  };
  const choose=(option)=>{
    if(!option||option.disabled)return;
    commit(option.value,option);
    setQuery(null);setActive(-1);setOpen(false);
    requestAnimationFrame(()=>input.current?.focus());
  };
  const keyDown=(event)=>{
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();setOpen(true);
      setActive((current)=>!visibleOptions.length?-1:event.key==='ArrowDown'?Math.min(current+1,visibleOptions.length-1):current<0?visibleOptions.length-1:Math.max(current-1,0));
    }else if(event.key==='Enter'&&expanded){
      event.preventDefault();
      if(activeOption)choose(activeOption);else if(visibleOptions.length===1)choose(visibleOptions[0]);
    }else if(event.key==='Escape'&&expanded){
      event.preventDefault();event.stopPropagation();setOpen(false);setActive(-1);
    }
  };

  return <div className={`searchable-select ${className}`.trim()} onBlur={(event)=>{
    if(!event.currentTarget.contains(event.relatedTarget)){setOpen(false);setActive(-1);setQuery(null)}
  }}>
    {label&&<label htmlFor={id}>{label}{required?' *':''}</label>}
    <div className="searchable-select-control">
      <Search aria-hidden="true" />
      <input id={id} ref={input} role="combobox" type="search" required={required} autoComplete="off" data-smart-search
        aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-list`}
        aria-activedescendant={activeOption?`${id}-option-${active}`:undefined}
        aria-describedby={hint?`${id}-hint`:undefined} aria-busy={loading} disabled={disabled}
        value={query??(selected?.label||'')} placeholder={loading?'Loading…':placeholder}
        onFocus={(event)=>{setOpen(true);if(selected)event.currentTarget.select()}} onClick={()=>setOpen(true)} onKeyDown={keyDown}
        onChange={(event)=>{setQuery(event.target.value);setActive(-1);setOpen(true);if(selectedValue)commit('')}} />
      <ChevronDown aria-hidden="true" />
    </div>
    {name&&<input type="hidden" name={name} value={selectedValue} />}
    {hint&&<small id={`${id}-hint`} className="searchable-select-hint">{hint}</small>}
    {expanded&&<div className="searchable-select-menu">
      <div className="searchable-select-count" role="status">{matching.length} {matching.length===1?'match':'matches'}{matching.length>visibleOptions.length?` · showing first ${visibleOptions.length}`:''}</div>
      <ul id={`${id}-list`} ref={list} role="listbox" aria-label={label?`Matching ${label}`:'Matching choices'}>
        {visibleOptions.map((option,index)=><li id={`${id}-option-${index}`} key={`${option.value}:${index}`} role="option" tabIndex={-1}
          aria-selected={option.value===selectedValue} aria-disabled={option.disabled} data-active={index===active}
          onPointerDown={(event)=>{if(event.pointerType==='mouse')event.preventDefault()}} onClick={()=>choose(option)}>
          <strong>{option.label}</strong>{option.description&&<small>{option.description}</small>}
        </li>)}
      </ul>
      {!visibleOptions.length&&<p className="searchable-select-empty">{emptyText}</p>}
    </div>}
  </div>;
}
