import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const client=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const lazyFeature=readFileSync(new URL('../src/lazy-feature.jsx',import.meta.url),'utf8');
const indexHtml=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/azure-hosting_coalmine-fleet-azure-783.yml',import.meta.url),'utf8');
const azure=readFileSync(new URL('../scripts/configure-azure-performance.sh',import.meta.url),'utf8');

test('database revisions let unchanged private feeds finish before their large table reads',()=>{
  assert.match(server,/CREATE TABLE IF NOT EXISTS data_revisions/);
  assert.match(server,/CREATE TRIGGER maintenance_requests_revision_trigger/);
  assert.match(server,/CREATE TRIGGER maintenance_daily_remarks_revision_trigger/);
  assert.match(server,/CREATE TRIGGER master_records_revision_trigger/);
  for(const [start,query] of [
    ["app.get('/api/info-pulse'",'FROM maintenance_requests ORDER BY created_at DESC'],
    ["app.get('/api/requests'",'const readFeed=async'],
    ["app.get('/api/dashboard/equipment'","WHERE master_name='Equipment master'"],
    ["app.get('/api/masters'",'const {rows}=requestedMasters.length'],
  ]){
    const route=server.slice(server.indexOf(start),server.indexOf('\napp.',server.indexOf(start)+1));
    assert.ok(route.indexOf('sendPrivateNotModified(req,res,etag)')<route.indexOf(query),start);
  }
  assert.match(server,/maintenance_requests_site_created_at_idx/);
  assert.match(server,/maintenance_requests_active_site_idx/);
  assert.match(server,/master_records_user_login_idx/);
});

test('slow API requests expose timing and pool pressure without logging secrets',()=>{
  assert.match(server,/Server-Timing/);
  assert.match(server,/event:'slow_http_request'/);
  assert.match(server,/databasePool:\{total:pool\?\.totalCount/);
  assert.match(server,/slowRequestThresholdMs/);
});

test('specialist browser features are emitted as lazy chunks',()=>{
  for(const module of [
    'remote-assistance.jsx','backup-administration.jsx','vehicle-transfer-workflow.jsx',
    'request-corrections.jsx','organisation-chart.jsx','whatsapp-report-settings.jsx',
    'info-pulse-content.jsx','saved-reports.jsx','recovery-guide.jsx',
  ])assert.match(client,new RegExp(`createLazyFeature\\(\\(\\)=>import\\("\\./${module.replaceAll('.','\\.')}"\\)`));
  assert.match(lazyFeature,/lazy\(\(\) => importer\(\)/);
  assert.match(lazyFeature,/<Suspense fallback=/);
  assert.match(client,/enabled:needsRequestFormMasters/);
});

test('lazy screens cannot replace the entire workspace with a blank page',()=>{
  assert.match(client,/<ApplicationErrorBoundary>/);
  assert.doesNotMatch(client,/<Suspense fallback=.*<App \/>/s);
  assert.match(lazyFeature,/failed to fetch dynamically imported module/);
  assert.match(lazyFeature,/window\.location\.replace\(nextUrl\.toString\(\)\)/);
  assert.match(lazyFeature,/Refresh application/);
  assert.match(indexHtml,/id="boot-status"/);
  assert.match(indexHtml,/Nerve Center could not finish loading/);
  assert.match(indexHtml,/unhandledrejection/);
});

test('deployment keeps App Service warm and caches only fingerprinted static assets',()=>{
  assert.match(workflow,/Enforce Azure performance configuration/);
  assert.match(workflow,/bash scripts\/configure-azure-performance\.sh/);
  assert.match(azure,/--always-on true/);
  assert.match(azure,/--http20-enabled true/);
  assert.match(azure,/LIVE_URL:\?LIVE_URL is required/);
  assert.match(azure,/\.properties\.hostName/);
  assert.match(azure,/live_domain_id/);
  assert.match(azure,/patternsToMatch: \["\/assets\/\*"\]/);
  assert.match(azure,/queryStringCachingBehavior: "IgnoreQueryString"/);
  assert.match(azure,/isCompressionEnabled: true/);
  assert.match(azure,/AuthorizationFailed/);
  assert.match(azure,/Continuing the application deployment without edge caching/);
  assert.doesNotMatch(azure,/patternsToMatch: \["\/api\/\*"\]/);
});
