import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NOTIFICATION_SOUNDS,DEFAULT_NOTIFICATION_SOUND,NOTIFICATION_SOUND_KEY,normalizeNotificationSound,loadNotificationSound,saveNotificationSound,toneScript,playNotificationSound,playTempleBell} from '../src/notification-chime.mjs';

const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const styles=readFileSync(new URL('../src/motion-icons.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('five bell sounds are offered, the temple bell is the default, and the choice is remembered per device',()=>{
  assert.deepEqual(NOTIFICATION_SOUNDS.map(sound=>sound.id),['temple','chime','dingdong','beep','silent']);
  assert.ok(NOTIFICATION_SOUNDS.every(sound=>sound.label&&sound.hint));
  assert.equal(DEFAULT_NOTIFICATION_SOUND,'temple');
  assert.equal(normalizeNotificationSound('beep'),'beep');
  assert.equal(normalizeNotificationSound('unknown'),'temple');
  assert.equal(normalizeNotificationSound(null),'temple');
  const store=new Map();
  const storage={getItem:key=>store.has(key)?store.get(key):null,setItem:(key,value)=>store.set(key,value)};
  assert.equal(loadNotificationSound(storage),'temple','nothing saved yet');
  assert.equal(saveNotificationSound('dingdong',storage),'dingdong');
  assert.equal(store.get(NOTIFICATION_SOUND_KEY),'dingdong');
  assert.equal(loadNotificationSound(storage),'dingdong');
  assert.equal(saveNotificationSound('nonsense',storage),'temple','invalid choices fall back');
  assert.equal(loadNotificationSound({getItem(){throw new Error('blocked');}}),'temple','storage errors never throw');
  assert.equal(loadNotificationSound(null),'temple');
});

test('each simple sound has its notes, silent plays nothing, and nothing throws without audio',()=>{
  assert.equal(toneScript('chime').length,2);
  assert.equal(toneScript('dingdong').length,2);
  assert.ok(toneScript('dingdong')[0].frequency>toneScript('dingdong')[1].frequency,'ding then dong');
  assert.equal(toneScript('beep').length,2);
  assert.ok(toneScript('beep').every(note=>note.type==='square'&&note.duration<0.2));
  assert.deepEqual(toneScript('temple'),[]);
  assert.deepEqual(toneScript('silent'),[]);
  assert.equal(playNotificationSound('silent'),false);
  for(const id of ['temple','chime','dingdong','beep'])assert.equal(playNotificationSound(id),false,`${id}: no audio in node`);
  assert.equal(playTempleBell(),false);
});

test('the notification panel has the sound picker with a play button and remembers the choice',()=>{
  assert.match(main,/const \[bellSound, setBellSound\] = useState\(\(\) => loadNotificationSound\(\)\);\s*const bellSoundRef = useRef\(bellSound\);\s*bellSoundRef\.current = bellSound;/);
  assert.match(main,/<label className="notification-site-filter notification-sound-filter">Bell sound<span className="notification-sound-controls"><select value=\{bellSound\} onChange=\{\(event\) => \{ const next = saveNotificationSound\(event\.target\.value\); setBellSound\(next\); playNotificationSound\(next\); \}\}>\{NOTIFICATION_SOUNDS\.map\(\(option\) => <option key=\{option\.id\} value=\{option\.id\}>\{option\.label\}<\/option>\)\}<\/select><button type="button" className="notification-sound-play" onClick=\{\(\) => playNotificationSound\(bellSound\)\} aria-label="Play the selected bell sound"/);
  assert.match(main,/<small>\{NOTIFICATION_SOUNDS\.find\(\(option\) => option\.id === bellSound\)\?\.hint\}<\/small>/);
  assert.match(main,/\n  Volume2,\n\} from "lucide-react";|Volume2,/);
  assert.match(styles,/\.notification-sound-filter \{ grid-column: 1 \/ -1; \}/);
  assert.match(styles,/\.notification-sound-play \{[^}]*background: linear-gradient\(135deg, #a855f7, #6b2fa8\);/);
});
