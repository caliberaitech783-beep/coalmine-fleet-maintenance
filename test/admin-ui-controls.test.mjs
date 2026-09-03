import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const tableStyles = readFileSync(new URL("../src/table-actions.css", import.meta.url), "utf8");

test("employee rows place Change password before Edit and normalize identity fields", () => {
  const master = source.slice(source.indexOf("function MasterPage("), source.indexOf("function MasterLoader("));
  assert.match(master, /Change password for[\s\S]*<LockKeyhole \/> Change password<\/button>[\s\S]*<Pencil \/> Edit/);
  assert.match(master, /updated\.login = updated\.login\.toUpperCase\(\)/);
  assert.match(source, /record\.login = record\.login\.toUpperCase\(\)/);
  assert.match(server, /app\.post\('\/api\/masters\/:master\/:id\/password'/);
  assert.match(server, /DELETE FROM auth_sessions WHERE lower\(login_name\)=lower\(\$1\)/);
  assert.match(server, /login:String\(record\.login\|\|''\)\.trim\(\)\.toUpperCase\(\)/);
});

test("Actions sits immediately before Filter across master and workspace toolbars", () => {
  assert.match(source, /className="toolbar-actions-end">\s*<div className="master-actions-slot"[\s\S]*?<TableParameterFilter/);
  assert.match(source, /className="toolbar-actions-end"><div className="workflow-actions-slot"[\s\S]*?<TableParameterFilter/);
  assert.match(tableStyles, /\.toolbar > \.toolbar-actions-end,[\s\S]*margin-left: auto/);
});

test("Tickets render the shared Actions control inside the category bar before the count", () => {
  const tickets = source.slice(source.indexOf("function TicketPage("), source.indexOf("const AI_FEEDER_AUTO_CLOSE_SECONDS"));
  assert.match(tickets, /className="ticket-toolbar-controls"[\s\S]*Category[\s\S]*className="master-actions-slot"[\s\S]*tickets\.length/);
  assert.match(tickets, /<ActionsTable toolbarTarget=\{actionsToolbarTarget\} toolbarPortal>/);
});
