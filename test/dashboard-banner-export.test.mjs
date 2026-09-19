import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { transformWithOxc } from "vite";

const source = readFileSync(new URL("../src/dashboard-filter-bar.jsx", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "").replace("export default function", "function");
const { code } = await transformWithOxc(source, "dashboard-filter-bar.jsx", { jsx: { runtime: "classic" } });

function harness() {
  const slots = [];
  let cursor = 0;
  const bindings = {
    React,
    useState(initial) { const at = cursor++; if (!(at in slots)) slots[at] = initial; return [slots[at], (next) => { slots[at] = typeof next === "function" ? next(slots[at]) : next; }]; },
    useRef: (initial) => ({ current: initial }), useEffect() {},
    Eye: () => null, EyeOff: () => null,
  };
  const Bar = new Function(...Object.keys(bindings), `${code}; return DashboardFilterBar;`)(...Object.values(bindings));
  return (props) => { cursor = 0; return Bar(props); };
}
const children = (tree) => React.Children.toArray(tree.props.children);
const action = (tree) => children(tree).find((node) => node.props?.className === "dashboard-banner-action");
const toggle = (tree) => children(tree).find((node) => node.props?.className === "dashboard-banner-toggle");

test("the collapsed banner keeps the whole-dashboard Export beside its eye toggle", () => {
  const render = harness();
  const exportMenu = React.createElement("span", { id: "dashboard-export" });
  let tree = render({ children: "filters", collapsedAction: exportMenu });
  assert.equal(action(tree), undefined, "the open banner shows it with the filters instead");
  toggle(tree).props.onClick();
  tree = render({ children: "filters", collapsedAction: exportMenu });
  assert.equal(tree.props["data-collapsed"], "true");
  assert.equal(action(tree).props.children, exportMenu);
  const order = children(tree).map((node) => node.props?.className);
  assert.ok(order.indexOf("dashboard-banner-action") === order.indexOf("dashboard-banner-toggle") - 1, "placed just before the toggle");
  assert.equal(action(render({ children: "filters" })), undefined, "nothing without an action");
  assert.equal(action(render({ children: "filters", collapsedAction: exportMenu, inDialog: true })), undefined, "never in the dashboard dialog");
  const css = readFileSync(new URL("../src/dashboard-section-export.css", import.meta.url), "utf8");
  assert.match(css, /\.dashboard-filter-bar > \.dashboard-banner-action \{ position: absolute; top: 2px; right: 44px;/);
  assert.match(css, /@media print \{\s*\.mine-dashboard :is\(\.mine-section-export, \.dashboard-banner-export\) \{ display: none !important; \}/);
});
