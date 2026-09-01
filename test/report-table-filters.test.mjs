import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("every report table supports header filters, sorting, and equipment comparison fields", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const reportsSource = source.slice(source.indexOf("function ReportsPage"), source.indexOf("function MasterPage"));

  assert.match(source, /function ReportTable\(/);
  assert.match(source, /<FilterableHeader/);
  assert.match(source, /onSort=\{changeSort\}/);
  assert.match(source, /elapsedMilliseconds\(request\.start, request\.closedAt\)/);
  assert.match(source, /<ReportTable[\s\S]*columns=\{columns\}/);
  assert.match(source, /function ReportSection\(/);
  assert.match(reportsSource, /reportMake: request\.make \|\| equipment\?\.make/);
  assert.match(reportsSource, /reportModel: request\.model \|\| equipment\?\.model/);
  assert.match(reportsSource, /const reportRequestStatus = \(request\) => String\(request\.status \|\| ""\)\.trim\(\) \|\| "Open"/);
  assert.match(reportsSource, /key: "status", label: "Status", value: reportRequestStatus/);
  assert.ok((reportsSource.match(/key: "make"/g) || []).length >= 2);
  assert.ok((reportsSource.match(/key: "model"/g) || []).length >= 2);
});

test("reports page exposes generated report type and report-name sub tabs", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const reportsSource = source.slice(source.indexOf("const reportCategoryTabs"), source.indexOf("function MasterPage"));

  assert.match(reportsSource, /General Report/);
  assert.match(reportsSource, /Production report/);
  assert.match(reportsSource, /Maintenance report/);
  assert.match(reportsSource, /MIS Report/);
  assert.doesNotMatch(reportsSource, /Report format, filters, columns, and export rules are not defined yet/);
  assert.match(reportsSource, /className="report-name-tabs"/);
  assert.match(reportsSource, /selectedReportByCategory/);
  assert.match(reportsSource, /selectedReport && \(/);
  assert.match(reportsSource, /category: "production", title: "Location wise opened BD"/);
  assert.match(reportsSource, /category: "maintenance", title: "Location wise closing BD"/);
  assert.match(reportsSource, /category: "mis", title: "MIS Verification Report"/);
  assert.match(reportsSource, /Report for On Road \/ Off Road & Idle/);
  assert.match(reportsSource, /Vehicle Transfer Report/);
  assert.match(reportsSource, /Total Equipment \/ Vehicle Location Wise/);
  assert.match(reportsSource, /category: "maintenance", title: "Idle Vehicle Report"/);
  assert.match(reportsSource, /Recent Breakdown Cases/);
  assert.match(reportsSource, /category: "production", title: "Off Road to MIS Veri\."/);
  assert.match(reportsSource, /category: "maintenance", title: "Off Road to Maint\. Close"/);
  assert.match(reportsSource, /Event close Report - Maint\. Closing to MIS Verif\./);
  assert.match(reportsSource, /category: "maintenance", title: "Idle with PM verif\."/);
  assert.match(reportsSource, /category: "mis", title: "On Road with first trip veri\."/);
  assert.match(reportsSource, /roadStatusLabel\(record, reportRequests\)/);
  assert.match(reportsSource, /<ExportMenu title=\{title\} columns=\{columns\} rows=\{rows\}/);
  assert.match(reportsSource, /label="Generate"/);
});
