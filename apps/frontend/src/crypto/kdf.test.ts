import { describe, expect, it } from "vitest";

import {
  DERIVED_KEY_BYTE_LENGTH,
  PBKDF2_ITERATIONS,
  SALT_BYTE_LENGTH,
  deriveKeyFromPassword,
  generateSalt,
} from "./kdf.js";

describe("PBKDF2 KDF", () => {
  it("generates a salt that is exactly 16 bytes", () => {
    const salt = generateSalt();
    expect(salt).toHaveLength(SALT_BYTE_LENGTH);
  });

  it("generates different salts for repeated calls", () => {
    const first = generateSalt();
    const second = generateSalt();
    expect(first).not.toEqual(second);
  });

  it("derives a 32-byte key", async () => {
    const key = await deriveKeyFromPassword("password", generateSalt());
    expect(key).toHaveLength(DERIVED_KEY_BYTE_LENGTH);
  });

  it("produces the same key for the same password and salt", async () => {
    const salt = generateSalt();
    const first = await deriveKeyFromPassword("password", salt);
    const second = await deriveKeyFromPassword("password", salt);
    expect(first).toEqual(second);
  });

  it("produces different keys for the same password and different salts", async () => {
    const first = await deriveKeyFromPassword("password", generateSalt());
    const second = await deriveKeyFromPassword("password", generateSalt());
    expect(first).not.toEqual(second);
  });

  it("produces different keys for different passwords with the same salt", async () => {
    const salt = generateSalt();
    const first = await deriveKeyFromPassword("password1", salt);
    const second = await deriveKeyFromPassword("password2", salt);
    expect(first).not.toEqual(second);
  });

  it("supports Unicode passwords", async () => {
    const password = "pásswørd 🧪 こんにちは";
    const key = await deriveKeyFromPassword(password, generateSalt());
    expect(key).toHaveLength(DERIVED_KEY_BYTE_LENGTH);
  });

  it("handles the empty password according to the KDF contract", async () => {
    const key = await deriveKeyFromPassword("", generateSalt());
    expect(key).toHaveLength(DERIVED_KEY_BYTE_LENGTH);
  });

  it("rejects invalid salt lengths", async () => {
    await expect(deriveKeyFromPassword("password", new Uint8Array(15))).rejects.toThrow(
      `PBKDF2 salt must be exactly ${SALT_BYTE_LENGTH} bytes.`,
    );
  });

  it("produces output compatible with AES-256 key material", async () => {
    const key = await deriveKeyFromPassword("password", generateSalt());
    expect(key).toHaveLength(32);
    expect(key).toHaveLength(256 / 8);
  });

  it("matches a standard PBKDF2-HMAC-SHA256 test vector", async () => {
    const salt = new Uint8Array([
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
      0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
    ]);
    const key = await deriveKeyFromPassword("password", salt);

    const expected = new Uint8Array([
      0x3b, 0xc3, 0x71, 0x18, 0xe6, 0x25, 0x09, 0x3e,
      0x9b, 0x79, 0xed, 0x08, 0x93, 0x0e, 0xa7, 0xaf,
      0x73, 0x89, 0x59, 0x12, 0x33, 0xfd, 0xd9, 0x2d,
      0xdd, 0xf3, 0x69, 0x37, 0x1e, 0x60, 0xdb, 0xc0,
    ]);

    expect(key).toEqual(expected);
    expect(PBKDF2_ITERATIONS).toBe(600_000);
  });
});
