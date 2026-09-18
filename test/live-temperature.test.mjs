import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatTemperature,coordinatesForSite,temperatureUrl,fetchLiveTemperature,locateViewer,resolveTemperatureCoordinates,DEFAULT_COORDINATES,SITE_COORDINATES} from '../src/live-temperature.mjs';

const dialog=readFileSync(new URL('../src/help-training.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const styles=readFileSync(new URL('../src/help-training.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('temperature is shown as "(37°C) 98.6°F" and dashes while unknown',()=>{
  assert.equal(formatTemperature(37),'(37°C) 98.6°F');
  assert.equal(formatTemperature(36.6),'(37°C) 97.9°F','Celsius rounds, Fahrenheit keeps one decimal');
  assert.equal(formatTemperature(-2.4),'(-2°C) 27.7°F');
  assert.equal(formatTemperature(null),'(--°C) --°F');
  assert.equal(formatTemperature(Number.NaN),'(--°C) --°F');
});

test('every site has coordinates; the viewer position wins, then the site, then the default',async()=>{
  for(const site of ['Sasti OB','Majri OB','Dhoptala OB (2nd)','Gauri Pauni OB (2nd)','Lalpeth OB','Jayant OB','Dudhichua OB','Dudhichua East OB'])assert.ok(coordinatesForSite(site),site);
  assert.equal(coordinatesForSite('jayant ob').place,'Jayant, Singrauli');
  assert.equal(coordinatesForSite('Dudhichua OB, Dudhichua East OB').place,'Dudhichua, Singrauli','first matching site of a list');
  assert.equal(coordinatesForSite(''),null);
  assert.equal(coordinatesForSite('Unknown site'),null);
  assert.equal(await locateViewer({geolocation:undefined}),null,'no geolocation API, no position');
  assert.equal(await locateViewer({geolocation:{getCurrentPosition:(_ok,fail)=>fail(new Error('denied'))}}),null,'denied never rejects');
  const granted={getCurrentPosition:(ok)=>ok({coords:{latitude:19.9,longitude:79.3}})};
  assert.deepEqual(await resolveTemperatureCoordinates('Jayant OB',{geolocation:granted}),{latitude:19.9,longitude:79.3,place:'your location'});
  assert.equal((await resolveTemperatureCoordinates('Jayant OB',{geolocation:undefined})).place,'Jayant, Singrauli');
  assert.deepEqual(await resolveTemperatureCoordinates('',{geolocation:undefined}),DEFAULT_COORDINATES);
  assert.equal(Object.keys(SITE_COORDINATES).length,8);
});

test('the reading comes from Open-Meteo and failures throw',async()=>{
  assert.equal(temperatureUrl({latitude:24.14,longitude:82.65}),'https://api.open-meteo.com/v1/forecast?latitude=24.140&longitude=82.650&current=temperature_2m&timezone=Asia%2FKolkata');
  const calls=[];
  const fetchImpl=async(url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>({current:{temperature_2m:37.2,time:'2026-09-19T01:30'}})};};
  assert.deepEqual(await fetchLiveTemperature({latitude:24.14,longitude:82.65,fetchImpl}),{celsius:37.2,at:'2026-09-19T01:30'});
  assert.equal(calls[0][1].cache,'no-store');
  await assert.rejects(fetchLiveTemperature({latitude:1,longitude:1,fetchImpl:async()=>({ok:false,status:503})}),/503/);
  await assert.rejects(fetchLiveTemperature({latitude:1,longitude:1,fetchImpl:async()=>({ok:true,json:async()=>({})})}),/No temperature/);
  await assert.rejects(fetchLiveTemperature({latitude:1,longitude:1,fetchImpl:null}),/fetch unavailable/);
});

test('the dialog shows the live reading before the icon and the icon matches the header badge',()=>{
  assert.match(dialog,/export default function HelpTraining\(\{role = "", roles = \[\], location = ""\}\)/);
  assert.match(dialog,/const temperature = useLiveTemperature\(location, open\);/,'only polls while the dialog is open');
  assert.match(dialog,/const timer = setInterval\(load, TEMPERATURE_REFRESH_MS\);/);
  assert.match(dialog,/<span className="help-training-heading-lead">\s*<span className=\{`help-training-weather[^`]*`\}[^>]*role="status" aria-live="polite"[^>]*>\{formatTemperature\(temperature\.celsius\)\}<\/span>\s*<span className="help-training-heading-icon"><CircleHelp \/><\/span>\s*<\/span>/);
  assert.match(styles,/\.help-training-dialog>header\{grid-template-columns:auto minmax\(0,1fr\) auto 40px\}/);
  assert.match(styles,/\.help-training-weather\{[^}]*font-variant-numeric:tabular-nums\}/);
  assert.match(styles,/\.help-training-dialog \.help-training-heading-icon\{[^}]*background:linear-gradient\(135deg,#a855f7,#6b2fa8\);[^}]*animation:help-bob 2\.8s ease-in-out infinite\}/,'same badge as the header trigger');
  assert.match(styles,/\.help-training-dialog \.help-training-heading-icon svg\{[^}]*animation:help-nod 2\.8s ease-in-out infinite\}/);
  assert.match(styles,/@keyframes help-weather-live\{/);
});
