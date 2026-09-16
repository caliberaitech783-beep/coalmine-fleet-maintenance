import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_FILTER_VALUE, cellMatchesFilterValues, describeFilterValues, encodeFilterValues, filterValueSelected, parseFilterValues, toggleFilterValue } from "../src/multi-value-filter.mjs";

test("several column values combine into one filter string and back", () => {
  assert.equal(encodeFilterValues([]), "");
  assert.equal(encodeFilterValues(["EICHER TIPPERS"]), "EICHER TIPPERS", "one value stays a plain string");
  const both = encodeFilterValues(["EICHER TIPPERS", "VOLVO TIPPERS"]);
  assert.deepEqual(parseFilterValues(both), ["EICHER TIPPERS", "VOLVO TIPPERS"]);
  assert.deepEqual(parseFilterValues("EXCAVATOR"), ["EXCAVATOR"]);
  assert.deepEqual(parseFilterValues(""), []);
  assert.deepEqual(parseFilterValues("__any__:not json"), []);
});

test("tapping a value adds it, tapping again removes it", () => {
  let filter = "";
  filter = toggleFilterValue(filter, "EICHER TIPPERS");
  filter = toggleFilterValue(filter, "VOLVO TIPPERS");
  assert.ok(filterValueSelected(filter, "EICHER TIPPERS") && filterValueSelected(filter, "VOLVO TIPPERS"));
  assert.ok(!filterValueSelected(filter, "EXCAVATOR"));
  assert.equal(describeFilterValues(filter), "2 values selected");
  filter = toggleFilterValue(filter, "EICHER TIPPERS");
  assert.equal(filter, "VOLVO TIPPERS");
  assert.equal(toggleFilterValue(filter, "VOLVO TIPPERS"), "");
});

test("rows match when their cell is any chosen value, including blanks", () => {
  const both = encodeFilterValues(["EICHER TIPPERS", "VOLVO TIPPERS"]);
  assert.ok(cellMatchesFilterValues("EICHER TIPPERS", both));
  assert.ok(cellMatchesFilterValues("VOLVO TIPPERS", both));
  assert.ok(!cellMatchesFilterValues("EXCAVATOR", both));
  assert.ok(cellMatchesFilterValues("anything", ""), "no filter matches everything");
  assert.ok(cellMatchesFilterValues("", encodeFilterValues([EMPTY_FILTER_VALUE, "GRADERS"])));
  assert.ok(cellMatchesFilterValues("GRADERS", encodeFilterValues([EMPTY_FILTER_VALUE, "GRADERS"])));
  assert.ok(!cellMatchesFilterValues("DOZERS", encodeFilterValues([EMPTY_FILTER_VALUE, "GRADERS"])));
});
