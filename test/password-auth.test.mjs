import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, initializeUserCredentials, publicUserRecord, verifyPassword } from "../password-auth.mjs";

test("hashes and verifies an initial phone-number password", () => {
  const hash = hashPassword("9925565281");
  assert.notEqual(hash, "9925565281");
  assert.equal(verifyPassword("9925565281", hash), true);
  assert.equal(verifyPassword("wrong-password", hash), false);
});

test("new users must change their initial phone-number password", () => {
  const user = initializeUserCredentials({ employee: "Anoop Paul", phone: "9925565281" });
  assert.equal(user.mustChangePassword, true);
  assert.equal(verifyPassword("9925565281", user.passwordHash), true);
});

test("does not expose credential fields in public master records", () => {
  assert.deepEqual(publicUserRecord({ employee: "Anoop", passwordHash: "secret", mustChangePassword: true }), { employee: "Anoop" });
});
