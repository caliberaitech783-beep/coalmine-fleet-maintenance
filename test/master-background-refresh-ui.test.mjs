import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import React from "react";
import {transformWithOxc} from "vite";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const Null = () => null;
const MasterLoadError = () => null, MasterLoader = () => null;
const definitions = [
  ["Equipment", "Equipment = function EquipmentWithData(", "const OriginalGeneric"],
  ["Generic", "Generic = function GenericWithMasters(", "const OriginalSubsidiaries"],
  ["Subsidiaries", "Subsidiaries = function SubsidiariesWithImport(", "function Modal("],
];
for (const [name, start, end] of definitions) {
  const text = source.slice(source.indexOf(start), source.indexOf(end));
  const {code} = await transformWithOxc(`let ${name};\n${text}`, `${name}-refresh.jsx`, {jsx: {runtime: "classic"}});
  test(`${name}: a transient background refresh never replaces an existing master page with a loading/error screen`, () => {
    const fixture = [{id: "fixture", door: "D-01"}];
    for (const [loaded, error, expectedScreen] of [[true, "", null], [true, "Connection interrupted", null], [false, "", MasterLoader], [false, "Connection interrupted", MasterLoadError]]) {
      const scope = {
        React, useMasterRecords: () => [fixture, Null, loaded, Null, Null, Null, error, Null], vehicles: [], subsidiaryData: [],
        MasterLoadError, MasterLoader, OriginalEquipment: Null, OriginalGeneric: Null,
        masterFields: {"OEM master": [["oem", "OEM name"]]}, MasterPage: Null, RegionMasterPage: Null,
        normalizeEquipmentRecord: value => value,
      };
      const Component = new Function(...Object.keys(scope), `${code}; return ${name};`)(...Object.values(scope));
      const tree = Component({name: "OEM master"});
      if (expectedScreen) assert.equal(tree.type, expectedScreen);
      else {
        assert.notEqual(tree.type, MasterLoadError);
        assert.notEqual(tree.type, MasterLoader);
        assert.deepEqual(tree.props.records, fixture);
      }
    }
  });
}
