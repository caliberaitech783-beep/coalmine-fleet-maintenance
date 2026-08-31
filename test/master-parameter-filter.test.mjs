import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("every master table exposes the shared all-parameter filter panel", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/sortable-table.css", import.meta.url), "utf8");
  const equipment = source.slice(source.indexOf("function Equipment("), source.indexOf("function MaintenanceForm"));
  const masters = source.slice(source.indexOf("function MasterPage("), source.indexOf("function MasterLoader"));

  assert.match(equipment, /filterColumns = equipmentColumns\.map/);
  assert.match(equipment, /tableRowMatchesFilters\(v, filterColumns, columnFilters\)/);
  assert.match(equipment, /<TableParameterFilter columns=\{filterColumns\} rows=\{records\}/);
  assert.match(masters, /filterColumns = displayFields\.map/);
  assert.match(masters, /tableRowMatchesFilters\(record, filterColumns, columnFilters\)/);
  assert.match(masters, /<TableParameterFilter columns=\{filterColumns\} rows=\{records\}/);
  assert.match(styles, /\.toolbar>\.table-parameter-filter\{min-width:0;padding:0;border:0;border-radius:0;margin-left:auto\}/);
});
