// Client-side sanitizer for chat message content
// Ensures Veil share URL fragments (the decryption fragment after '#')
// are removed before sending messages to the backend.

export function sanitizeMessageContent(content: string | undefined | null): string {
  if (!content) return content ?? "";

  // Strip fragments from full URLs that include /share/<id>#fragment
  // Example: https://example.com/share/capsule-123#fragment -> https://example.com/share/capsule-123
  let result = content.replace(/(https?:\/\/\S*\/share\/[A-Za-z0-9_-]+)#\S*/g, (_m, p1) => p1);

  // Strip fragments from root-relative share links /share/<id>#fragment
  // Example: /share/capsule-123#fragment -> /share/capsule-123
  result = result.replace(/(\/share\/[A-Za-z0-9_-]+)#\S*/g, (_m, p1) => p1);

  return result;
}
