import { describe, expect, it } from "vitest";

import { decodeFragment, decryptFromShare, encryptForShare } from "./zero-knowledge.js";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

describe("zero-knowledge encryption orchestration", () => {
  it("round-trips a passwordless share locally", async () => {
    const result = await encryptForShare("hello world");
    const decoded = decodeFragment(result.fragment);

    expect(Object.keys(result.serverPayload).sort()).toEqual(["algorithm", "ciphertext", "nonce"]);
    expect(result.serverPayload.algorithm).toBe("AES-GCM-256");
    expect(decoded.mode).toBe("plain");
    expect(decoded.version).toBe(1);
    expect(await decryptFromShare(result.serverPayload, result.fragment)).toBe("hello world");
  });

  it("rejects an empty password explicitly", async () => {
    await expect(encryptForShare("secret", "")).rejects.toThrow("Password cannot be empty.");
  });

  it("keeps the DEK out of the server payload for passwordless shares", async () => {
    const result = await encryptForShare("plaintext");

    expect(result.serverPayload).not.toHaveProperty("key");
    expect(result.serverPayload).not.toHaveProperty("wrappedKey");
    expect(result.serverPayload).not.toHaveProperty("salt");
  });

  it("stores the raw DEK only in the client fragment for passwordless shares", async () => {
    const result = await encryptForShare("plaintext");
    const fragment = decodeFragment(result.fragment);

    expect(fragment.mode).toBe("plain");
    if (fragment.mode !== "plain") {
      throw new Error("Expected plain fragment");
    }
    expect(fragment.key).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fragment.key.length).toBeGreaterThan(0);
  });

  it("round-trips a password-protected share with the correct password", async () => {
    const result = await encryptForShare("secret message", "hunter2");
    const fragment = decodeFragment(result.fragment);

    expect(fragment.mode).toBe("password");
    if (fragment.mode !== "password") {
      throw new Error("Expected password fragment");
    }

    expect(fragment.kdf).toBe("PBKDF2-SHA256");
    expect(fragment.iterations).toBe(600000);
    expect(Object.keys(result.serverPayload).sort()).toEqual(["algorithm", "ciphertext", "nonce"]);
    expect(result.serverPayload.algorithm).toBe("AES-GCM-256");
    expect(await decryptFromShare(result.serverPayload, result.fragment, "hunter2")).toBe("secret message");
  });

  it("fails with the wrong password for a protected share", async () => {
    const result = await encryptForShare("secret message", "hunter2");

    await expect(decryptFromShare(result.serverPayload, result.fragment, "wrong-password")).rejects.toThrow(
      "Decryption failed.",
    );
  });

  it("omits password and KEK material from the server payload", async () => {
    const result = await encryptForShare("secret", "hunter2");

    expect(result.serverPayload).not.toHaveProperty("password");
    expect(result.serverPayload).not.toHaveProperty("kek");
    expect(result.serverPayload).not.toHaveProperty("wrappedKey");
    expect(result.serverPayload).not.toHaveProperty("key");
    expect(result.serverPayload).not.toHaveProperty("salt");
  });

  it("keeps the password out of the generated share material", async () => {
    const password = "hunter2";
    const result = await encryptForShare("secret", password);
    const bundle = JSON.stringify(result.serverPayload) + result.fragment;

    expect(bundle).not.toContain(password);
  });

  it("includes wrapped DEK, salt, and KDF metadata in the password fragment", async () => {
    const result = await encryptForShare("secret", "hunter2");
    const fragment = decodeFragment(result.fragment);

    expect(fragment.mode).toBe("password");
    if (fragment.mode !== "password") {
      throw new Error("Expected password fragment");
    }

    expect(fragment.wrappedKey).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fragment.wrapNonce).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fragment.salt).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fragment.kdf).toBe("PBKDF2-SHA256");
    expect(fragment.iterations).toBe(600000);
  });

  it("supports Unicode and empty plaintext", async () => {
    const unicode = "こんにちは 🌍\nمرحبا";
    const empty = await encryptForShare("");
    const unicodeResult = await encryptForShare(unicode);

    expect(await decryptFromShare(empty.serverPayload, empty.fragment)).toBe("");
    expect(await decryptFromShare(unicodeResult.serverPayload, unicodeResult.fragment)).toBe(unicode);
  });

  it("generates different DEKs and nonces on repeated encryption of the same plaintext", async () => {
    const first = await encryptForShare("same plain text");
    const second = await encryptForShare("same plain text");

    expect(first.serverPayload.ciphertext).not.toBe(second.serverPayload.ciphertext);
    expect(first.serverPayload.nonce).not.toBe(second.serverPayload.nonce);
    expect(first.fragment).not.toBe(second.fragment);
  });

  it("fails when the main ciphertext is tampered with", async () => {
    const result = await encryptForShare("secret");
    const tampered = {
      ...result.serverPayload,
      ciphertext: result.serverPayload.ciphertext.slice(0, -1) + (result.serverPayload.ciphertext.at(-1) === "A" ? "B" : "A"),
    };

    await expect(decryptFromShare(tampered, result.fragment)).rejects.toThrow("Decryption failed.");
  });

  it("fails when the main nonce is tampered with", async () => {
    const result = await encryptForShare("secret");
    const tamperedNonce = new Uint8Array(12).fill(9);
    tamperedNonce[11] = 10;

    await expect(
      decryptFromShare({ ...result.serverPayload, nonce: toBase64Url(tamperedNonce) }, result.fragment),
    ).rejects.toThrow("Decryption failed.");
  });

  it("fails when the wrapped DEK is tampered with", async () => {
    const result = await encryptForShare("secret", "hunter2");
    const fragment = decodeFragment(result.fragment);

    expect(fragment.mode).toBe("password");
    if (fragment.mode !== "password") {
      throw new Error("Expected password fragment");
    }

    const tampered = {
      ...fragment,
      wrappedKey: fragment.wrappedKey.slice(0, -1) + (fragment.wrappedKey.at(-1) === "A" ? "B" : "A"),
    };

    await expect(
      decryptFromShare(result.serverPayload, encodeFragmentPayload(tampered), "hunter2"),
    ).rejects.toThrow("Decryption failed.");
  });

  it("fails when the wrap nonce is tampered with", async () => {
    const result = await encryptForShare("secret", "hunter2");
    const fragment = decodeFragment(result.fragment);

    expect(fragment.mode).toBe("password");
    if (fragment.mode !== "password") {
      throw new Error("Expected password fragment");
    }

    const tampered = {
      ...fragment,
      wrapNonce: fragment.wrapNonce.slice(0, -1) + (fragment.wrapNonce.at(-1) === "A" ? "B" : "A"),
    };

    await expect(
      decryptFromShare(result.serverPayload, encodeFragmentPayload(tampered), "hunter2"),
    ).rejects.toThrow("Decryption failed.");
  });

  it("fails when the KDF salt is tampered with", async () => {
    const result = await encryptForShare("secret", "hunter2");
    const fragment = decodeFragment(result.fragment);

    expect(fragment.mode).toBe("password");
    if (fragment.mode !== "password") {
      throw new Error("Expected password fragment");
    }

    // Tamper the first character of the salt (guaranteed to change meaningful bits,
    // unlike the last character of a base64url string where low bits may be padding).
    const tampered = {
      ...fragment,
      salt: (fragment.salt.charAt(0) === "A" ? "B" : "A") + fragment.salt.slice(1),
    };

    await expect(
      decryptFromShare(result.serverPayload, encodeFragmentPayload(tampered), "hunter2"),
    ).rejects.toThrow("Decryption failed.");
  });

  it("rejects malformed fragments and unsupported versions", async () => {
    await expect(decryptFromShare({ ciphertext: "", nonce: "", algorithm: "AES-GCM-256" }, "not-base64")).rejects.toThrow();
    await expect(decryptFromShare({ ciphertext: "", nonce: "", algorithm: "AES-GCM-256" }, "#")).rejects.toThrow();
    await expect(
      decryptFromShare({ ciphertext: "", nonce: "", algorithm: "AES-GCM-256" }, encodeFragmentPayload({ version: 2, mode: "plain", key: "abc" })),
    ).rejects.toThrow();
    await expect(
      decryptFromShare({ ciphertext: "", nonce: "", algorithm: "AES-GCM-256" }, encodeFragmentPayload({ version: 1, mode: "unknown", key: "abc" } as never)),
    ).rejects.toThrow();
    await expect(
      decryptFromShare({ ciphertext: "", nonce: "", algorithm: "AES-GCM-256" }, encodeFragmentPayload({ version: 1, mode: "plain", key: "A" })),
    ).rejects.toThrow();
    await expect(
      decryptFromShare(
        { ciphertext: "", nonce: "", algorithm: "AES-GCM-256" },
        encodeFragmentPayload({
          version: 1,
          mode: "password",
          wrappedKey: "A",
          wrapNonce: "A",
          salt: "A",
          kdf: "PBKDF2-SHA256",
          iterations: 600000,
        }),
        "hunter2",
      ),
    ).rejects.toThrow();
  });

  it("uses distinct modes for passwordless and password-protected shares", async () => {
    const plainResult = await encryptForShare("plain");
    const passwordResult = await encryptForShare("secret", "hunter2");

    expect(decodeFragment(plainResult.fragment).mode).toBe("plain");
    expect(decodeFragment(passwordResult.fragment).mode).toBe("password");
  });
});

function encodeFragmentPayload(payload: unknown): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}
