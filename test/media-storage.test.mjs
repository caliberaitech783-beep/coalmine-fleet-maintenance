import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {mediaObjectKey, mediaStorageConfiguration, safeMediaFilename, validMediaUploadDescriptor} from "../media-storage.mjs";

test("media storage selects Azure first and supports an S3-compatible alternative", () => {
  assert.deepEqual(mediaStorageConfiguration({}), {provider: "", configured: false});
  assert.equal(mediaStorageConfiguration({AZURE_STORAGE_CONNECTION_STRING: "UseDevelopmentStorage=true"}).provider, "azure");
  const s3 = mediaStorageConfiguration({MEDIA_STORAGE_PROVIDER: "s3", S3_BUCKET: "fleet-media", S3_ENDPOINT: "http://minio:9000", S3_FORCE_PATH_STYLE: "true"});
  assert.equal(s3.provider, "s3");
  assert.equal(s3.forcePathStyle, true);
});

test("direct media descriptors validate type without imposing an application size ceiling", () => {
  assert.equal(validMediaUploadDescriptor({purpose: "ticket-attachment", contentType: "video/mp4", size: 8 * 1024 * 1024 * 1024}), true);
  assert.equal(validMediaUploadDescriptor({purpose: "ticket-attachment", contentType: "video/quicktime", size: 1}), true);
  assert.equal(validMediaUploadDescriptor({purpose: "request-opening-meter", contentType: "application/pdf", size: 1}), true);
  assert.equal(validMediaUploadDescriptor({purpose: "request-first-trip-card", contentType: "application/pdf", size: 1}), false);
  assert.equal(validMediaUploadDescriptor({purpose: "ticket-attachment", contentType: "text/html", size: 1}), false);
  assert.equal(validMediaUploadDescriptor({purpose: "ticket-attachment", contentType: "image/png", size: 0}), false);
});

test("media object keys are partitioned and filenames cannot inject paths", () => {
  assert.equal(safeMediaFilename("../../trip card.png"), "trip card.png");
  assert.equal(mediaObjectKey({id: "abc", purpose: "ticket-attachment", fileName: "trip card.png", now: new Date("2026-09-26T00:00:00Z")}), "ticket-attachment/2026/09/abc-trip-card.png");
});

test("picture and video forms upload raw files directly without a browser size ceiling", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const upload = source.slice(source.indexOf("async function uploadMediaFile"), source.indexOf("function MaintenanceForm"));
  assert.match(upload, /body: file/);
  assert.match(upload, /\/api\/media\/uploads/);
  assert.doesNotMatch(upload, /FileReader|readAsDataURL|file\.size\s*>/);
  for (const purpose of ["request-opening-meter", "request-closing-meter", "request-first-trip-card", "ticket-attachment", "ticket-resolution"]) {
    assert.match(source, new RegExp(`(?:readMeterEvidence|readTicketAttachment)\\([^)]*${purpose}`));
  }
  assert.doesNotMatch(source, /maximum (?:5|10) MB/);
});
