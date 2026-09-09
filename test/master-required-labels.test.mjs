import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { transformWithOxc } from "vite";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const schema = source.slice(source.indexOf("const masterFields ="), source.indexOf("const isCheckedValue ="));
const masterFields = new Function(`${schema}; return masterFields;`)();
const codes = {};
for (const [name, next] of [["MasterActions", "Equipment"], ["MasterPage", "MasterLoader"]]) {
  const body = source.slice(source.indexOf(`function ${name}(`), source.indexOf(`function ${next}(`));
  codes[name] = (await transformWithOxc(body, `${name}.jsx`, {jsx: {runtime: "classic"}})).code;
}
const Null = () => null;
function nodes(tree, predicate) {
  const found = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    if (predicate(node)) found.push(node);
    visit(node.props.children);
  };
  visit(tree);
  return found;
}
function labelText(node) {
  if (Array.isArray(node)) return node.map(labelText).join("");
  if (!React.isValidElement(node)) return typeof node === "string" || typeof node === "number" ? String(node) : "";
  if (["input", "select", "textarea"].includes(node.type)) return "";
  return labelText(node.props.children);
}
function render(name, componentName) {
  let cursor = 0;
  const useState = initial => {
    const index = cursor++;
    const value = componentName === "MasterActions" && index === 0 ? "manual"
      : componentName === "MasterPage" && index === 1 ? {id: "fixture"}
      : typeof initial === "function" ? initial() : initial;
    return [value, () => {}];
  };
  const scope = {
    React, useState, useEffect: () => {}, useRef: value => ({current: value}), masterFields,
    userPrivilegeFields: [], userSubmenuFields: [], userAccessOptions: {},
    privilegeAccessOptions: ["Super User", "Mobile User"], mobileUserRoleOptions: ["Maintenance User"],
    mobileRoleAuthority: {"Maintenance User": "Edit requests"}, persistedUserTypeOptions: ["Mobile User", "Super Admin"],
    isCheckedValue: value => value === true, privilegeAccessValue: value => value || "", privilegeSelectionValue: value => value || "",
    useSortableRows: rows => [rows, {}, () => {}], sortCollator: new Intl.Collator(),
    ...Object.fromEntries(["RefreshCw", "Trash2", "Save", "Upload", "Plus", "X", "Search", "Pencil", "CheckCircle2", "LockKeyhole", "Modal", "ExportMenu", "MultiTextField", "UserTypeAccessFields", "TableParameterFilter", "ActionsTable", "FilterableHeader", "MasterActions"].map(key => [key, Null])),
  };
  const Component = new Function(...Object.keys(scope), `${codes[componentName]}; return ${componentName};`)(...Object.values(scope));
  return Component({name, records: []});
}

for (const componentName of ["MasterActions", "MasterPage"]) test(`${componentName}: required stars agree with existing controls for every master`, () => {
  for (const name of Object.keys(masterFields)) {
    const tree = render(name, componentName);
    const form = nodes(tree, node => node.type === "form")[0];
    assert.ok(form, name);
    for (const label of nodes(form, node => node.type === "label")) {
      const controls = nodes(label, node => ["input", "select", "textarea"].includes(node.type));
      if (!controls.length || controls[0].props.type === "radio") continue;
      const required = controls.some(control => Boolean(control.props.required));
      assert.equal(labelText(label).includes("*"), required, `${name} / ${controls[0].props.name}`);
    }
    for (const fieldset of nodes(form, node => node.type === "fieldset" && node.props.className === "privilege-role-field")) {
      const legend = nodes(fieldset, node => node.type === "legend")[0];
      assert.ok(labelText(legend).includes("*"));
      assert.ok(nodes(fieldset, node => node.type === "input").every(input => input.props.required === true));
    }
  }
});

test("Equipment Add keeps exactly Door and Status required without inventing validation", () => {
  const tree = render("Equipment master", "MasterActions");
  const controls = nodes(tree, node => ["input", "select"].includes(node.type) && node.props.name);
  assert.equal(controls.length, 17);
  assert.deepEqual(controls.filter(node => node.props.required).map(node => node.props.name), ["door", "status"]);
  assert.equal(controls.find(node => node.props.name === "status").props.defaultValue, "Operational");
});

test("optional mobile role on Add and required mobile role on Edit retain their existing rules", () => {
  for (const componentName of ["MasterActions", "MasterPage"]) {
    const tree = render("Privilege", componentName);
    const control = nodes(tree, node => node.type === "select" && node.props.name === "userGroup")[0];
    assert.equal(Boolean(control.props.required), componentName === "MasterPage");
  }
});
