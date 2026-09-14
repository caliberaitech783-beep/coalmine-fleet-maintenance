import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const loginStart = source.indexOf('function Login(');
const loginSource = source.slice(loginStart, source.indexOf('\nfunction ', loginStart + 1));
const speechSource = source.slice(source.indexOf('const speechLanguages ='), source.indexOf('function readMeterEvidence('));
const { code: speechCode } = await transformWithOxc(speechSource, 'speech-complaint.jsx', { jsx: { runtime: 'classic' } });

const Null = () => null;
const all = (tree, predicate) => {
  const result = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    if (predicate(node)) result.push(node);
    visit(node.props.children);
  };
  visit(tree);
  return result;
};
const byType = (tree, type) => all(tree, node => node.type === type)[0];
const text = node => (React.isValidElement(node) ? React.Children.toArray(node.props.children).map(text).join('') : Array.isArray(node) ? node.map(text).join('') : String(node ?? ''));

function harness(code, name, extra = {}) {
  const slots = [];
  const effects = [];
  let cursor = 0;
  const useState = initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  };
  const scope = { React, useState, useRef: value => useState(() => ({ current: value }))[0], useEffect: (effect) => effects.push(effect), ...extra };
  const component = new Function(...Object.keys(scope), `${code}; return ${name};`)(...Object.values(scope));
  return {
    render(props = {}) { cursor = 0; effects.length = 0; return component(props); },
    async runEffects() { for (const effect of effects.splice(0)) await effect(); },
  };
}
const storage = (session) => {
  const stored = session ? JSON.stringify(session) : null;
  return { getItem: key => (key === 'nerveCenterSession' ? stored : null), setItem() {}, removeItem() {} };
};
const BENGALI = '\u09ac\u09cd\u09b0\u09c7\u0995 \u0995\u09be\u099c \u0995\u09b0\u099b\u09c7 \u09a8\u09be';
const HINDI = '\u092c\u094d\u0930\u0947\u0915 \u0915\u093e\u092e \u0928\u0939\u0940\u0902 \u0915\u0930 \u0930\u0939\u0947';
const unused = () => {
};

test('login form offers two language dropdowns and keeps both choices', () => {
  assert.match(loginSource, /useState\(\(\) => preferredLanguageCodes\(\)\[0\] \|\| "en"\)/);
  assert.match(loginSource, /const \[secondaryLanguage, setSecondaryLanguage\] = useState/);
  assert.match(loginSource, /<select name=\{name\} value=\{value\}/);
  assert.match(loginSource, /\["preferredLanguage", "Language 1 \u00b7 \u092d\u093e\u0937\u093e 1"/);
  assert.match(loginSource, /\["secondaryLanguage", "Language 2 \u00b7 \u092d\u093e\u0937\u093e 2"/);
  assert.match(loginSource, /speechLanguages\.map\(\(\[, englishName, code, nativeName\]\) => \(/, 'every supported language is listed');
  assert.match(loginSource, /body: JSON\.stringify\(\{ username, password \}\)/, 'the login request is unchanged');
  assert.match(loginSource, /preferredLanguage,\n      secondaryLanguage,\n    \}\);/, 'the session keeps both languages');
  assert.match(loginSource, /body: JSON\.stringify\(\{ preferredLanguage, secondaryLanguage \}\),/, 'both choices are remembered on the user record after sign-in');
  assert.match(source, /\["en-IN", "English", "en", "English"\],\n  \["hi-IN", "Hindi", "hi", "\u0939\u093f\u0902\u0926\u0940"\],\n  \["mr-IN", "Marathi", "mr", "\u092e\u0930\u093e\u0920\u0940"\]/);
  assert.match(styles, /\.login-language-options\{display:grid;grid-template-columns:1fr 1fr/);
  assert.match(styles, /\.login-language-options select\{width:100%/);
});

test('server remembers the preferred language on the user record and returns it with every login payload', () => {
  assert.match(server, /preferredLanguage:normalizeLanguage\(employee\.preferredLanguage\)\|\|'en',\n    secondaryLanguage:normalizeLanguage\(employee\.secondaryLanguage\)\|\|'',/);
  assert.match(server, /app\.post\('\/api\/preferred-language',requireSession,/);
  assert.match(server, /if\(secondary&&secondary===language\)return res\.status\(400\)/, 'the two languages must differ');
  assert.match(server, /preferredLanguage:language,secondaryLanguage:secondary\}\),row\.id\]\);/, 'the user record keeps both languages');
  assert.match(server, /employee:\{employee:reset\.employee_name,preferredLanguage:updated\.preferredLanguage,secondaryLanguage:updated\.secondaryLanguage\}/);
});

test('speech input starts in the preferred language and tags the text with its language', () => {
  const app = harness(speechCode, 'EnhancedSpeechComplaint', {
    Mic: Null, Square: Null, readApiJson: Null, authToken: '',
    localStorage: storage({ token: 't', preferredLanguage: 'en', secondaryLanguage: 'hi' }), sessionStorage: storage(null),
  });
  let tree = app.render({});
  assert.equal(byType(tree, 'select').props.value, 'en-IN', 'Language 1 selects the speech language');
  assert.deepEqual(all(tree, node => node.type === 'option').map(node => node.props.value), ['en-IN', 'hi-IN'], 'only the user\'s two languages are offered');
  const languageInput = all(tree, node => node.type === 'input' && node.props.name === 'complaintLanguage')[0];
  assert.ok(languageInput, 'the language travels with the complaint');
  assert.equal(languageInput.props.value, 'en');
  byType(tree, 'textarea').props.onChange({ target: { value: HINDI } });
  tree = app.render({});
  assert.equal(all(tree, node => node.type === 'input' && node.props.name === 'complaintLanguage')[0].props.value, 'hi', 'Devanagari text is tagged Hindi even when English speech was selected');

  const hindi = harness(speechCode, 'EnhancedSpeechComplaint', {
    Mic: Null, Square: Null, readApiJson: Null, authToken: '',
    localStorage: storage({ token: 't', preferredLanguage: 'hi', secondaryLanguage: 'mr' }), sessionStorage: storage(null),
  });
  assert.equal(byType(hindi.render({ name: 'maintenanceWork' }), 'select').props.value, 'hi-IN');
  const none = harness(speechCode, 'EnhancedSpeechComplaint', { Mic: Null, Square: Null, readApiJson: Null, authToken: '' });
  assert.equal(all(none.render({}), node => node.type === 'option').length, 10, 'without a stored preference every language is offered');
  assert.equal(all(hindi.render({ name: 'maintenanceWork' }), node => node.type === 'input' && node.props.name === 'maintenanceWorkLanguage')[0].props.value, 'hi', 'empty text falls back to the spoken language');
});

test('stored complaints are translated into Language 1 unless written in either of the reader languages', async () => {
  const requests = [];
  const fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body), auth: options.headers.Authorization });
    return { ok: true, json: async () => ({ text: 'The brake is not working.', translated: true, configured: true }) };
  };
  const readApiJson = async response => response.json();
  const app = harness(speechCode, 'TranslatedText', {
    fetch, readApiJson, authToken: 'token-1',
    localStorage: storage({ token: 'token-1', preferredLanguage: 'en', secondaryLanguage: 'hi' }), sessionStorage: storage(null),
  });
  const hindiTree = app.render({ text: HINDI, language: 'hi' });
  assert.equal(hindiTree.props.children, HINDI, 'Language 2 text is shown as written');
  await app.runEffects();
  assert.equal(requests.length, 0, 'no translation request for Language 2');
  let tree = app.render({ text: BENGALI, language: 'bn' });
  assert.equal(text(tree).includes(BENGALI), true, 'the original shows until the translation arrives');
  await app.runEffects();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(requests.map(request => [request.url, request.body, request.auth]), [['/api/translate', { text: BENGALI, from: 'bn', to: 'en' }, 'Bearer token-1']]);
  tree = app.render({ text: BENGALI, language: 'bn' });
  assert.equal(all(tree, node => node.type === 'span' && node.props.lang)[0].props.children, 'The brake is not working.');
  const toggle = byType(tree, 'button');
  assert.match(text(toggle), /Original \u00b7 \u09ac\u09be\u0982\u09b2\u09be/);
  toggle.props.onClick({ stopPropagation() {} });
  tree = app.render({ text: BENGALI, language: 'bn' });
  assert.equal(all(tree, node => node.type === 'span' && node.props.lang)[0].props.children, BENGALI);
  assert.equal(requests.length, 1, 'repeat renders reuse the cached translation');

  const same = harness(speechCode, 'TranslatedText', {
    fetch, readApiJson, authToken: 'token-1',
    localStorage: storage({ token: 'token-1', preferredLanguage: 'hi', secondaryLanguage: 'en' }), sessionStorage: storage(null),
  });
  const sameTree = same.render({ text: HINDI, language: 'hi', as: 'b' });
  assert.equal(sameTree.type, 'b');
  assert.equal(sameTree.props.children, HINDI, 'same-language text is shown as stored');
  await same.runEffects();
  assert.equal(requests.length, 1, 'no translation request for the reader\'s own language');
  assert.equal(same.render({ text: '', language: 'hi' }).props.children, '—');
  assert.equal(same.render({ text: 'Brake failed', language: 'en', helper: true }), null, 'the helper stays hidden until a translation exists');
});

test('requests and closures store the language of the spoken text and the API translates on demand', () => {
  assert.match(source, /complaintLanguage: fd\.get\("complaintLanguage"\),/);
  assert.match(source, /maintenanceWorkLanguage: form\.get\("maintenanceWorkLanguage"\),/);
  assert.match(server, /ADD COLUMN IF NOT EXISTS complaint_language TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /ADD COLUMN IF NOT EXISTS maintenance_work_language TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /CREATE TABLE IF NOT EXISTS text_translations/);
  assert.match(server, /complaint_language AS "complaintLanguage", maintenance_work_language AS "maintenanceWorkLanguage"/);
  assert.match(server, /const storedComplaintLanguage=\(String\(complaintLanguage\)\.trim\(\)\.toLowerCase\(\)\.match\(\/\^\(en\|hi\|mr\|bn\|or\|te\|gu\|pa\|ta\|kn\)\(-\|\$\)\/i\)\|\|\[\]\)\[1\]\|\|'';/);
  assert.match(server, /const maintenanceWorkLanguage=\(String\(req\.body\?\.maintenanceWorkLanguage\|\|''\)\.trim\(\)\.toLowerCase\(\)\.match\(\/\^\(en\|hi\|mr\|bn\|or\|te\|gu\|pa\|ta\|kn\)\(-\|\$\)\/i\)\|\|\[\]\)\[1\]\|\|'';/);
  assert.match(server, /complaint_language=CASE WHEN complaint=\$2 THEN complaint_language ELSE '' END/, 'an edited complaint drops its tag so readers detect the script');
  assert.equal((server.match(/maintenance_work_language=\$[67]/g) || []).length, 3, 'idle, closed and in-progress updates all keep the language');
  assert.match(server, /app\.post\('\/api\/translate',requireSession,/);
  assert.match(server, /SELECT translated_text FROM text_translations WHERE cache_key=\$1/);
  assert.match(server, /if\(!translator\.configured\)return res\.json\(\{text,from,to,translated:false,configured:false\}\);/, 'without a key the original text is returned rather than an error');
});

test('every place a reader sees complaint or maintenance text renders it through TranslatedText', () => {
  for (const site of [
    '<div className="request-reason-text"><TranslatedText text={r.complaint} language={r.complaintLanguage} /></div>',
    '<div className="request-reason-text"><TranslatedText text={row.complaint} language={row.complaintLanguage} /></div>',
    '<b><TranslatedText text={request.complaint} language={request.complaintLanguage} /></b>',
    '<b><TranslatedText text={request.maintenanceWork} language={request.maintenanceWorkLanguage} /></b>',
    '<TranslatedText text={request.complaint} language={request.complaintLanguage} helper />',
    'language={request.complaintLanguage || ""} wide',
    'language={request.maintenanceWorkLanguage || ""} wide',
  ]) assert.ok(source.includes(site), site);
  assert.doesNotMatch(source, /<audio[^>]*src=\{[^}]*translat/i, 'audio is never replaced by a translation');
});
