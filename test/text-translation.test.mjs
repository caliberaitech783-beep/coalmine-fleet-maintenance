import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTranslator,
  detectLanguage,
  needsTranslation,
  normalizeLanguage,
  resolveSourceLanguage,
  speechLocaleFor,
  translatedTextFromResponse,
  translationCacheKey,
  translationInstructions,
  translatorFromEnvironment,
} from '../text-translation.mjs';

test('normalizeLanguage accepts codes, locales and names in either script', () => {
  for (const value of ['hi', 'HI-IN', 'Hindi', 'हिंदी', ' hi-in ']) assert.equal(normalizeLanguage(value), 'hi', value);
  for (const value of ['en', 'en-IN', 'English', 'EN-GB']) assert.equal(normalizeLanguage(value), 'en', value);
  for (const value of ['', null, undefined, 'mr', 'French']) assert.equal(normalizeLanguage(value), '', String(value));
});

test('speech locale follows the preferred language and defaults to English', () => {
  assert.equal(speechLocaleFor('hi'), 'hi-IN');
  assert.equal(speechLocaleFor('English'), 'en-IN');
  assert.equal(speechLocaleFor(''), 'en-IN');
});

test('detectLanguage reads Devanagari as Hindi and Latin letters as English', () => {
  assert.equal(detectLanguage('इंजन में तेल का रिसाव है।'), 'hi');
  assert.equal(detectLanguage('Brake is not working'), 'en');
  assert.equal(detectLanguage('12345 ---'), '');
  assert.equal(resolveSourceLanguage('Brake failed', 'hi'), 'hi', 'the recorded language wins over the script');
  assert.equal(resolveSourceLanguage('Brake failed', ''), 'en');
});

test('needsTranslation is true only when the text and reader languages differ', () => {
  assert.equal(needsTranslation('ब्रेक काम नहीं कर रहे', 'hi', 'en'), true);
  assert.equal(needsTranslation('ब्रेक काम नहीं कर रहे', '', 'en'), true, 'unrecorded language is detected from the script');
  assert.equal(needsTranslation('Brake not working', 'en', 'en'), false);
  assert.equal(needsTranslation('Brake not working', '', 'hi'), true);
  assert.equal(needsTranslation('   ', 'hi', 'en'), false);
  assert.equal(needsTranslation('Brake not working', 'en', ''), false, 'readers without a preference see the original');
});

test('cache keys are stable per text and language pair', () => {
  assert.equal(translationCacheKey('Brake failed', 'en', 'hi'), translationCacheKey('  Brake failed ', 'en', 'hi'));
  assert.notEqual(translationCacheKey('Brake failed', 'en', 'hi'), translationCacheKey('Brake failed', 'hi', 'en'));
  assert.notEqual(translationCacheKey('Brake failed', 'en', 'hi'), translationCacheKey('Brake failed.', 'en', 'hi'));
});

test('translator sends the complaint to Claude with faithful-translation instructions and returns the text', async () => {
  const calls = [];
  const client = { messages: { async create(params) { calls.push(params); return { stop_reason: 'end_turn', content: [{ type: 'text', text: '  ब्रेक काम नहीं कर रहे हैं और टायर पंक्चर है।  ' }] }; } } };
  const translator = createTranslator({ client, model: 'claude-opus-5' });
  assert.equal(translator.configured, true);
  const result = await translator.translate({ text: 'The brake is broken and the tyre is punctured.', from: 'en', to: 'hi' });
  assert.deepEqual(result, { configured: true, text: 'ब्रेक काम नहीं कर रहे हैं और टायर पंक्चर है।', translated: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'claude-opus-5');
  assert.equal(calls[0].messages[0].content, 'The brake is broken and the tyre is punctured.');
  assert.match(calls[0].system, /from English to Hindi/);
  assert.match(calls[0].system, /negation, number, vehicle or door number/);
  assert.match(translationInstructions('hi', 'en'), /from Hindi to English/);
});

test('translator skips same-language text, guards length, and rejects empty or refused replies', async () => {
  const client = { messages: { async create() { return { stop_reason: 'refusal', content: [] }; } } };
  const translator = createTranslator({ client });
  assert.deepEqual(await translator.translate({ text: 'Brake failed', from: 'en', to: 'en' }), { configured: true, text: 'Brake failed', translated: false });
  await assert.rejects(translator.translate({ text: 'x'.repeat(2001), from: 'en', to: 'hi' }), /2000 characters/);
  await assert.rejects(translator.translate({ text: 'Brake failed', from: 'en', to: 'hi' }), /returned no text/);
  assert.equal(translatedTextFromResponse({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'ok' }] }), 'ok');
});

test('without an API key the translator reports unconfigured and returns the original text', async () => {
  const translator = await translatorFromEnvironment({});
  assert.equal(translator.configured, false);
  assert.deepEqual(await translator.translate({ text: 'ब्रेक', from: 'hi', to: 'en' }), { configured: false, text: 'ब्रेक', translated: false });
  assert.equal((await translatorFromEnvironment({ TRANSLATION_MODEL: 'claude-sonnet-5' })).model, 'claude-sonnet-5');
});
