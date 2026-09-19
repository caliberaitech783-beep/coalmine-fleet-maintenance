import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
test("shared print actions customize columns before printing", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.ok(source.includes('onClick={() => openSmartPrint'));
  assert.ok(source.includes('<span>Smart Print</span>'));
  const start = source.indexOf('  const printReport = () => {');
  const end = source.indexOf('  if (printOnly)', start);
  const columns = [{label:'Door'}], rows = [{door:'24'}], calls=[];
  const renderer=()=>{}, formatter=String, reportGrouping={site: row=>row.site, asset: row=>row.id};
  const dashboardElement={id:'dashboard'}, sectionElement={id:'section'}, selectors=[];
  const build=(dashboardPdf,printDashboardReport=()=>assert.fail('a table report never prints the dashboard'),printSection=false)=>new Function('openSmartPrint','printTableReport','exportCellText','setOpen','title','smartPrintColumns','smartPrintRows','highlightRow','reportGrouping','dashboardPdf','triggerRef','printDashboardReport','printSection',
    source.slice(start,end)+'; return printReport;')(args=>calls.push(args),renderer,formatter,value=>calls.push(value),'Report',columns,rows,undefined,reportGrouping,dashboardPdf,{current:{closest:selector=>{selectors.push(selector);return selector==='.mine-panel'?sectionElement:dashboardElement;}}},printDashboardReport,printSection);
  build(false)();
  assert.deepEqual(calls,[false,{title:'Report',columns,rows,highlightRow:undefined,reportGrouping,onPrint:renderer,formatCell:formatter}]);
  assert.deepEqual(selectors,[],'a table report does not look for a dashboard');

  // A dashboard's Smart Print prints the dashboard as it is on screen instead of its KPI table.
  calls.length=0;
  const printed=[];
  build(true,args=>printed.push(args))();
  assert.equal(calls[0],false);
  assert.equal(calls[1].title,'Report');
  assert.match(calls[1].snapshot,/exactly as it looks on screen/);
  assert.equal(calls[1].columns,undefined,'no KPI columns are offered');
  assert.deepEqual(selectors,['.mine-dashboard, .manager-dashboard']);
  calls[1].onPrint({pageSize:'A4',printOptions:{copies:2}});
  assert.deepEqual(printed,[{dashboard:dashboardElement,title:'Report',pageSize:'A4',printOptions:{copies:2}}]);

  // A dashboard section's Smart Print prints that panel as it is on screen, also without columns.
  calls.length=0; selectors.length=0; printed.length=0;
  build(false,args=>printed.push(args),true)();
  assert.equal(calls[0],false);
  assert.match(calls[1].snapshot,/section prints exactly as it looks on screen/);
  assert.equal(calls[1].columns,undefined,'no table columns are offered');
  assert.deepEqual(selectors,['.mine-dashboard, .manager-dashboard','.mine-panel']);
  calls[1].onPrint({pageSize:'A3',printOptions:{}});
  assert.deepEqual(printed,[{dashboard:dashboardElement,section:sectionElement,title:'Report',pageSize:'A3',printOptions:{}}]);
});
