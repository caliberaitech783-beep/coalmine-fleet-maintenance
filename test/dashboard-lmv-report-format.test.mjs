import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';
import {lmvCounts,lmvRowsForMode,lmvDemoRecords,lmvFleetSnapshot,LMV_DETAIL_COLUMNS,LMV_SUMMARY_COLUMNS,lmvSummaryRows} from '../lmv-fleet.mjs';
import {totalFleetRecords,totalFleetDetailRows} from '../src/total-fleet-model.mjs';
import {REGION_DATA} from '../region-scope.mjs';

const source=readFileSync(new URL('../src/lmv-fleet.jsx',import.meta.url),'utf8');
const extracted=source.slice(source.indexOf('export const LMV_MODES='),source.indexOf('export function LmvFleetControls')).replace('export ','')+source.slice(source.indexOf('const modeLabel='),source.indexOf('export function LmvReportsPage')).replaceAll('export ','');
const compiled=(await transformWithOxc(extracted,'lmv-report.jsx',{jsx:{runtime:'classic'}})).code;
function renderReport(props){
  const Browser=({rows,regions,...rest})=>{assert.equal(rest.rowsAreScoped,true);assert.deepEqual(rest.categoryLabels,{Unclassified:'LMV'});assert.equal(regions[0].sites[0],'Sasti OC');return React.createElement('div',{'data-browser':true,'data-count':rows.length},rows.map(row=>React.createElement('span',{key:row.door},row.requestStatus)));};
  const Component=new Function('React','useState','useMemo','lmvCounts','lmvRowsForMode','lmvSummaryRows','LMV_DETAIL_COLUMNS','LMV_SUMMARY_COLUMNS','totalFleetRecords','totalFleetDetailRows','REGION_DATA','DashboardRecordBrowser',`${compiled};return LmvReports;`)(React,React.useState,React.useMemo,lmvCounts,lmvRowsForMode,lmvSummaryRows,LMV_DETAIL_COLUMNS,LMV_SUMMARY_COLUMNS,totalFleetRecords,totalFleetDetailRows,REGION_DATA,Browser);
  return renderToStaticMarkup(React.createElement(Component,{records:lmvFleetSnapshot(lmvDemoRecords()),regions:REGION_DATA.map(region=>({...region,sites:region.sites.map(name=>({name}))})),browserProps:{},...props}));
}
test('LMV details use the shared fleet browser for each mode with the matching count',()=>{
  for(const [mode,count] of [['total',40],['breakdown',16],['balance',16],['oem',8],['onroad',16],['idle',8],['unknown',0]])assert.match(renderReport({initialMode:mode}),new RegExp(`data-count="${count}"`));
});
test('LMV breakdown details retain sample labels without inventing request times',()=>{
  const html=renderReport({initialMode:'breakdown'});assert.match(html,/Demo · Breakdown/);
  const rows=totalFleetDetailRows(totalFleetRecords([],lmvFleetSnapshot(lmvDemoRecords())));
  assert.ok(rows.every(row=>!row.requestReference&&row.requestStart==='—'));
});
test('LMV dialogs reuse only the full-screen fleet shell and leave the shared browser unchanged',()=>{
  assert.match(source,/className="dashboard-asset-modal lmv-report-modal" overlayClassName="dashboard-asset-overlay"/);
  assert.match(source,/initialSummary=\{false\}/);
  assert.match(source,/DashboardRecordBrowser/);
});
