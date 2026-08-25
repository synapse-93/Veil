import { describe, expect, it } from "vitest";

import { decrypt, encrypt, generateEncryptionKey, generateNonce } from "./aes.js";

describe("AES-GCM helper", () => {
  it("generates a 32-byte key", () => {
    const key = generateEncryptionKey();
    expect(key).toHaveLength(32);
  });

  it("generates a 12-byte nonce", () => {
    const nonce = generateNonce();
    expect(nonce).toHaveLength(12);
  });

  it("round-trips plaintext through encryption and decryption", async () => {
    const key = generateEncryptionKey();
    const nonce = generateNonce();
    const result = await encrypt("hello world", key, nonce);
    const plaintext = await decrypt(result.ciphertext, key, result.nonce);

    expect(plaintext).toBe("hello world");
  });

  it("supports empty plaintext", async () => {
    const key = generateEncryptionKey();
    const result = await encrypt("", key, generateNonce());
    const plaintext = await decrypt(result.ciphertext, key, result.nonce);

    expect(plaintext).toBe("");
  });

  it("supports Unicode plaintext", async () => {
    const key = generateEncryptionKey();
    const plaintext = "こんにちは 🌍\nمرحبا";
    const result = await encrypt(plaintext, key, generateNonce());
    const roundTrip = await decrypt(result.ciphertext, key, result.nonce);

    expect(roundTrip).toBe(plaintext);
  });

  it("uses different nonces and ciphertext for repeated encryptions of the same plaintext", async () => {
    const key = generateEncryptionKey();
    const first = await encrypt("same plaintext", key, generateNonce());
    const second = await encrypt("same plaintext", key, generateNonce());

    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("fails when ciphertext is tampered with", async () => {
    const key = generateEncryptionKey();
    const nonce = generateNonce();
    const encrypted = await encrypt("secret message", key, nonce);
    const tamperedCiphertext = encrypted.ciphertext.slice(0, -1) + (encrypted.ciphertext.at(-1) === "A" ? "B" : "A");

    await expect(decrypt(tamperedCiphertext, key, encrypted.nonce)).rejects.toThrow("Decryption failed.");
  });

  it("fails when nonce is tampered with", async () => {
    const key = new Uint8Array(32).fill(7);
    const nonce = new Uint8Array(12).fill(9);
    const encrypted = await encrypt("secret message", key, nonce);
    const tamperedNonce = new Uint8Array(12).fill(9);
    tamperedNonce[11] = 10;

    await expect(decrypt(encrypted.ciphertext, key, tamperedNonce)).rejects.toThrow("Decryption failed.");
  });

  it("fails when the wrong key is used", async () => {
    const key = generateEncryptionKey();
    const wrongKey = generateEncryptionKey();
    const encrypted = await encrypt("secret message", key, generateNonce());

    await expect(decrypt(encrypted.ciphertext, wrongKey, encrypted.nonce)).rejects.toThrow("Decryption failed.");
  });

  it("is deterministic when an explicit nonce and key are supplied for testing", async () => {
    const key = new Uint8Array(32).fill(7);
    const nonce = new Uint8Array(12).fill(9);

    const first = await encrypt("deterministic message", key, nonce);
    const second = await encrypt("deterministic message", key, nonce);

    expect(first).toEqual(second);
  });
});
