import test from "node:test";
import assert from "node:assert/strict";
import {ADMIN_LOCK_TICKET_CUTOFF,isLockableAdmin,isTrueSuperAdmin} from "../admin-lock-policy.mjs";

test("CRM lock policy starts after 27 August 2026 in India",()=>{
  assert.equal(ADMIN_LOCK_TICKET_CUTOFF,"2026-08-28T00:00:00+05:30");
});

test("locks desktop Admin and Non Admin Manager accounts only",()=>{
  assert.equal(isLockableAdmin({adminLevel:"Admin"}),true);
  assert.equal(isLockableAdmin({adminLevel:"Manager"}),true);
  assert.equal(isLockableAdmin({adminLevel:"Super Admin"}),false);
  assert.equal(isLockableAdmin({adminLevel:"Production User"}),false);
});

test("recognizes the distinct Super Admin authority",()=>{
  assert.equal(isTrueSuperAdmin({adminLevel:"Super Admin"}),true);
  assert.equal(isTrueSuperAdmin({adminLevel:"Admin"}),false);
});
