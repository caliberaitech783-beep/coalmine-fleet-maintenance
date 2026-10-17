import test from 'node:test';
import assert from 'node:assert/strict';
import { compressImageDataUrl, IMAGE_MAX_BYTES, AUDIO_MAX_BYTES, dataUrlBytes } from '../media-policy.mjs';
import { validTripCardImageDataUrl, validMeterEvidenceDataUrl, validRequestAudioDataUrl } from '../request-workflow.mjs';
import { validTicketMediaDataUrl } from '../ticket-workflow.mjs';
import { validComplaintMedia } from '../complaint-media.mjs';
import { validSessionMessageAudioDataUrl } from '../session-message.mjs';
import { validCorrectionEvidence } from '../request-correction-policy.mjs';
import { announcementImageError } from '../announcement.mjs';
const data = (mime, bytes) => `data:${mime};base64,${Buffer.alloc(bytes).toString('base64')}`;
test('all stored images enforce the 100 KB boundary, including base64 padding', () => {
  const validators = [validTripCardImageDataUrl, validMeterEvidenceDataUrl, validTicketMediaDataUrl, validCorrectionEvidence,
    value => validComplaintMedia([{name:'card.webp',data:value}]), value => !announcementImageError(value)];
  for (const validate of validators) {
    assert.equal(validate(data('image/webp', IMAGE_MAX_BYTES)), true);
    assert.equal(validate(data('image/webp', IMAGE_MAX_BYTES + 1)), false);
  }
  assert.equal(validMeterEvidenceDataUrl(data('application/pdf', 200 * 1024)), true);
});
test('all audio validators enforce the 1 MB boundary', () => {
  for (const validate of [validRequestAudioDataUrl, validSessionMessageAudioDataUrl, value => validTicketMediaDataUrl(value,{kind:'audio'})]) {
    assert.equal(validate(data('audio/webm', AUDIO_MAX_BYTES)), true);
    assert.equal(validate(data('audio/webm', AUDIO_MAX_BYTES + 1)), false);
  }
});
test('compression favors detail within 100 KB and rejects images that need excessive reduction', async t => {
  const originals = {Image:globalThis.Image, document:globalThis.document, create:URL.createObjectURL, revoke:URL.revokeObjectURL};
  t.after(() => {globalThis.Image=originals.Image;globalThis.document=originals.document;URL.createObjectURL=originals.create;URL.revokeObjectURL=originals.revoke;});
  let size=80*1024, revoked=0;
  globalThis.Image=class {naturalWidth=3000;naturalHeight=2000;set src(value){this.onload();}};
  globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:()=>data('image/webp',size)})};
  URL.createObjectURL=()=> 'blob:test';URL.revokeObjectURL=()=>revoked++;
  assert.equal(dataUrlBytes(await compressImageDataUrl({type:'image/jpeg',size:500000})),size);
  size=15000;
  assert.equal(dataUrlBytes(await compressImageDataUrl({type:'image/jpeg',size:500000})),size);
  size=150000;
  await assert.rejects(compressImageDataUrl({type:'image/jpeg',size:500000}),/Crop/);
  assert.equal(revoked,3);
});
