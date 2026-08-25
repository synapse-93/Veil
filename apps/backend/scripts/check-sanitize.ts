import assert from "node:assert";
import { InMemorySocialRepository } from "../src/repository/social.repository";

async function run() {
  const repo = new InMemorySocialRepository(async (id) => ({ id, username: `user_${id}` }));

  // Create conversation between two users
  const convId = await repo.getOrCreateConversation("alice", "bob");

  const payload = {
    conversationId: convId,
    senderId: "alice",
    type: "TEXT",
    content: "Hello check this share: https://example.com/share/ABC123#supersecretfrag and more text",
  };

  const msg = await repo.createMessage(payload as any);

  // The sanitized content should not contain the fragment
  if (msg.content.includes("#supersecretfrag")) {
    console.error("Sanitization failed: fragment still present in stored content:", msg.content);
    process.exit(1);
  }

  // Also ensure the base URL/capsule id remains
  if (!msg.content.includes("/share/ABC123")) {
    console.error("Sanitization removed more than the fragment:", msg.content);
    process.exit(1);
  }

  console.log("Sanitization check passed. Stored content:", msg.content);
}

run().catch((err) => {
  console.error("Sanitization check script failed:", err);
  process.exit(2);
});
