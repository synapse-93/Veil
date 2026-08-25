import { ShareLinkError } from "../errors.js";

export type ShareLinkParts = {
  domain: string;
  capsuleId: string;
  decryptionKey: string;
  url: URL;
};

function normalizeUrlInput(raw: string | URL): URL {
  try {
    return raw instanceof URL ? new URL(raw.toString()) : new URL(raw);
  } catch (error) {
    throw new ShareLinkError("Share link is not a valid URL.", { cause: error });
  }
}

function normalizeDomain(domain: string): string {
  const trimmed = domain.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");

  if (!trimmed) {
    throw new ShareLinkError("A share domain is required.");
  }

  return trimmed;
}

export function createShareLink(domain: string, capsuleId: string, decryptionKey: string): string {
  const normalizedDomain = normalizeDomain(domain);
  const normalizedCapsuleId = capsuleId.trim();
  const normalizedKey = decryptionKey.trim();

  if (!normalizedCapsuleId) {
    throw new ShareLinkError("Capsule ID is required.");
  }

  if (!normalizedKey) {
    throw new ShareLinkError("Decryption key is required.");
  }

  const protocol = /^https?:\/\//i.test(domain.trim())
    ? domain.trim().match(/^https?:\/\//i)?.[0] ?? "https://"
    : "https://";
  const baseUrl = new URL(`${protocol}${normalizedDomain}`);
  baseUrl.pathname = `/share/${encodeURIComponent(normalizedCapsuleId)}`;
  baseUrl.hash = `#${encodeURIComponent(normalizedKey)}`;

  return baseUrl.toString();
}

export function parseShareLink(raw: string | URL): ShareLinkParts {
  const url = normalizeUrlInput(raw);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ShareLinkError("Share links must use http or https.");
  }

  if (url.search) {
    throw new ShareLinkError("Share links must not include query parameters.");
  }

  const sharePathMatch = /^\/share\/([^/?#]+)\/?$/i.exec(url.pathname);
  if (!sharePathMatch) {
    throw new ShareLinkError("Share link path must be /share/<capsuleId>.");
  }

  const capsuleId = decodeURIComponent(sharePathMatch[1]);
  const fragment = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;

  if (!fragment) {
    throw new ShareLinkError("Share link is missing a decryption key fragment.");
  }

  const decryptionKey = decodeURIComponent(fragment);

  return {
    domain: url.host,
    capsuleId,
    decryptionKey,
    url,
  };
}

export function isSafeShareLink(raw: string | URL): boolean {
  try {
    parseShareLink(raw);
    return true;
  } catch {
    return false;
  }
}
