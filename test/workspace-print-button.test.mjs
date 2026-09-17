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
  const handler=new Function('openSmartPrint','printTableReport','exportCellText','setOpen','title','smartPrintColumns','smartPrintRows','highlightRow','reportGrouping',
    source.slice(start,end)+'; return printReport;')(args=>calls.push(args),renderer,formatter,value=>calls.push(value),'Report',columns,rows,undefined,reportGrouping);
  handler();
  assert.deepEqual(calls,[false,{title:'Report',columns,rows,highlightRow:undefined,reportGrouping,onPrint:renderer,formatCell:formatter}]);
});
