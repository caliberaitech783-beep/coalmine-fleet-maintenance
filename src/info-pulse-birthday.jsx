import React, {useEffect, useState} from 'react';
import {Pause, Play} from 'lucide-react';
import {infoPulseDate} from '../info-pulse-data.mjs';
import './info-pulse-birthday.css';

export function BirthdayMarquee({names = []}) {
  const [paused, setPaused] = useState(false);
  if (!names.length) return null;
  const message = <><span className="pulse-birthday-greeting">Happy Birthday!</span>{names.map((name,index) => <React.Fragment key={`${index}-${name}`}><strong>{name}</strong><span className="pulse-birthday-star">✦</span></React.Fragment>)}<span>Have a wonderful day!</span><span>🎉</span></>;
  return <section className="pulse-birthday" data-paused={paused} aria-label={`Today's birthdays: ${names.join(', ')}. Happy Birthday!`} style={{'--birthday-duration':`${Math.max(22, names.join('').length / 4)}s`}}>
    <div className="pulse-birthday-confetti" aria-hidden="true">{Array.from({length:6},(_,index)=><i key={index} />)}</div>
    <span className="pulse-birthday-cake" aria-hidden="true">🎂</span>
    <div className="pulse-birthday-viewport" aria-hidden="true"><div className="pulse-birthday-track"><span className="pulse-birthday-message">{message}</span><span className="pulse-birthday-message">{message}</span></div></div>
    <button type="button" className="pulse-birthday-pause" aria-label={paused?'Resume birthday animation':'Pause birthday animation'} aria-pressed={paused} onClick={()=>setPaused(value=>!value)}>{paused?<Play size={16} />:<Pause size={16} />}</button>
  </section>;
}

export default function InfoPulseBirthday({token, now}) {
  const [result,setResult] = useState(null);
  const today = infoPulseDate(new Date(now ?? Date.now()).toISOString());
  useEffect(()=>{
    if (!token) return undefined;
    const controller = new AbortController();
    fetch('/api/info-pulse/birthdays',{signal:controller.signal,cache:'no-store',headers:{Authorization:`Bearer ${token}`}})
      .then(async response=>{if(!response.ok)throw new Error('Birthday lookup unavailable');return response.json();})
      .then(data=>{if(!controller.signal.aborted)setResult({token,today,names:Array.isArray(data.names)?data.names.filter(name=>typeof name==='string'&&name.trim()):[]});})
      .catch(()=>{if(!controller.signal.aborted)setResult(null);});
    return ()=>controller.abort();
  },[token,today]);
  return <BirthdayMarquee names={result?.token===token&&result?.today===today?result.names:[]} />;
}
