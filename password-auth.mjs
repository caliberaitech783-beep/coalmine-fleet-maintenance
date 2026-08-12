import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, encoded) {
  const [algorithm, salt, expectedHex] = String(encoded || "").split(":");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(String(password), salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function initializeUserCredentials(record) {
  const phone = String(record?.phone || "").trim();
  if (!phone) throw new Error("A phone number is required to create a user.");
  return {
    ...record,
    passwordHash: hashPassword(phone),
    mustChangePassword: true,
  };
}

export function publicUserRecord(record) {
  const { passwordHash, mustChangePassword, ...publicRecord } = record || {};
  return publicRecord;
}
