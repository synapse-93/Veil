import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth.js";
import {
  getConversations,
  getFriends,
  sendMessage,
  searchUsers,
  startConversation,
} from "../services/api.js";
import type {
  ConversationItem,
  FriendItem,
  SecurityRecipe,
  UserSearchResult,
} from "@secureshare/shared";
import {
  MessageSquare,
  Send,
  Check,
  Search,
  Lock,
  User as UserIcon,
  X,
  Sparkles,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Globe,
} from "lucide-react";

export type CapsuleShareData = {
  id: string;
  recipe?: SecurityRecipe;
  expiresAt?: string;
  maxViews?: number;
  burnAfterRead?: boolean;
  requiresPassword?: boolean;
  shareUrl: string;
  shareFragment?: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  capsuleData: CapsuleShareData;
  onNavigateChat: (conversationId?: string) => void;
};

export function ShareToChatModal({
  isOpen,
  onClose,
  capsuleData,
  onNavigateChat,
}: Props) {
  const { user, openAuthModal } = useAuth();

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [networkUsers, setNetworkUsers] = useState<UserSearchResult[]>([]);
  const [searchingNetwork, setSearchingNetwork] = useState(false);

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedTargetUserId, setSelectedTargetUserId] = useState<string | null>(null);
  const [selectedRecipientName, setSelectedRecipientName] = useState<string>("");
  const [customNote, setCustomNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const extractShareFragment = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (capsuleData.shareFragment?.trim()) return capsuleData.shareFragment.trim();
    const hashIndex = trimmed.indexOf("#");
    if (hashIndex >= 0) return trimmed.slice(hashIndex + 1).trim();
    return trimmed;
  };

  // Load user's conversations and friends when modal opens and user is logged in
  useEffect(() => {
    if (!isOpen || !user) return;

    let isMounted = true;
    setLoadingContacts(true);
    setErrorMessage(null);
    setSendSuccess(false);

    Promise.all([getConversations(), getFriends()])
      .then(([convRes, friendRes]) => {
        if (!isMounted) return;
        setConversations(convRes.conversations || []);
        setFriends(friendRes.friends || []);

        // Auto-select first conversation if available
        if (convRes.conversations && convRes.conversations.length > 0) {
          const first = convRes.conversations[0];
          setSelectedConversationId(first.id);
          setSelectedTargetUserId(null);
          setSelectedRecipientName(first.otherUser?.username || "Recipient");
        } else if (friendRes.friends && friendRes.friends.length > 0) {
          const first = friendRes.friends[0];
          if (first.conversationId) {
            setSelectedConversationId(first.conversationId);
            setSelectedTargetUserId(null);
            setSelectedRecipientName(first.username);
          }
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Failed to load chat contacts:", err);
      })
      .finally(() => {
        if (isMounted) setLoadingContacts(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, user]);

  // Search network users when searchQuery changes
  useEffect(() => {
    if (!searchQuery.trim() || !user) {
      setNetworkUsers([]);
      setSearchingNetwork(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingNetwork(true);
      try {
        const res = await searchUsers(searchQuery.trim());
        setNetworkUsers(res.users || []);
      } catch {
        setNetworkUsers([]);
      } finally {
        setSearchingNetwork(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, user]);

  if (!isOpen) return null;

  // Build combined recipient list
  const recipientList: Array<{
    conversationId?: string;
    targetUserId?: string;
    username: string;
    lastActive?: string;
    isFriend: boolean;
    isPublic?: boolean;
  }> = [];

  const seenUsers = new Set<string>();

  // Add active conversations first
  for (const conv of conversations) {
    if (conv.otherUser && !seenUsers.has(conv.otherUser.username)) {
      seenUsers.add(conv.otherUser.username);
      recipientList.push({
        conversationId: conv.id,
        targetUserId: conv.otherUser.id,
        username: conv.otherUser.username,
        isFriend: true,
        isPublic: true,
      });
    }
  }

  // Add friends who may not have messages yet
  for (const f of friends) {
    if (!seenUsers.has(f.username)) {
      seenUsers.add(f.username);
      recipientList.push({
        conversationId: f.conversationId,
        targetUserId: f.id,
        username: f.username,
        isFriend: true,
        isPublic: true,
      });
    }
  }

  // Add public users from network search if matching and not already in list
  for (const nu of networkUsers) {
    if (nu.id !== user?.id && !seenUsers.has(nu.username)) {
      seenUsers.add(nu.username);
      recipientList.push({
        targetUserId: nu.id,
        username: nu.username,
        isFriend: !!nu.isFriend,
        isPublic: nu.isPublic !== false,
      });
    }
  }

  const filteredRecipients = recipientList.filter((r) =>
    r.username.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const handleSend = async () => {
    if ((!selectedConversationId && !selectedTargetUserId) || sending) return;

    setSending(true);
    setErrorMessage(null);

    try {
      let activeConvId = selectedConversationId;

      // If we don't have an active conversation ID yet, start one with the target user
      if (!activeConvId && selectedTargetUserId) {
        const convRes = await startConversation({ targetUserId: selectedTargetUserId, targetUsername: selectedRecipientName });
        activeConvId = convRes.conversation.id;
        setSelectedConversationId(activeConvId);
      }

      if (!activeConvId) {
        throw new Error("Could not initialize chat with recipient");
      }

      if (capsuleData.id) {
        const shareFragment = extractShareFragment(capsuleData.shareUrl);
        const capsuleMessage = customNote.trim()
          ? `${customNote.trim()}\n\n🔒 Secret Link: ${capsuleData.shareUrl}`
          : `🔒 Encrypted Secret: ${capsuleData.shareUrl}`;

        await sendMessage(activeConvId, {
          type: "CAPSULE",
          content: capsuleMessage,
          shareFragment,
          capsuleId: capsuleData.id,
          recipe: capsuleData.recipe || "SECURE",
          expiresAt: capsuleData.expiresAt,
          maxViews: capsuleData.maxViews,
          burnAfterRead: capsuleData.burnAfterRead,
          requiresPassword: capsuleData.requiresPassword,
        });
      } else {
        // Send as direct encrypted link text
        const textMsg = customNote.trim()
          ? `${customNote.trim()}\n\n🔒 Secret Link: ${capsuleData.shareUrl}`
          : `🔒 Encrypted Secret: ${capsuleData.shareUrl}`;

        await sendMessage(activeConvId, {
          type: "TEXT",
          content: textMsg,
        });
      }

      setSendSuccess(true);
    } catch (err: any) {
      console.error("Failed to share to chat:", err);
      setErrorMessage(err.message || "Failed to send secret to chat");
    } finally {
      setSending(false);
    }
  };

  const handleGoToChat = () => {
    if (selectedConversationId) {
      try {
        sessionStorage.setItem("veil_target_chat_conv", selectedConversationId);
      } catch {
        // ignore
      }
      onNavigateChat(selectedConversationId);
    } else {
      onNavigateChat();
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md anim-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-3xl border shadow-2xl p-6 sm:p-7 relative overflow-hidden bg-veil-bg"
        style={{
          backgroundColor: "var(--color-veil-bg)",
          borderColor: "rgba(201, 93, 38, 0.3)",
          boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.5), 0 0 40px rgba(201, 93, 38, 0.15)",
        }}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-muted hover:text-ink hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center border"
            style={{
              backgroundColor: "var(--color-veil-ember-dim)",
              borderColor: "rgba(201, 93, 38, 0.35)",
              color: "var(--color-veil-ember)",
            }}
          >
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h3
              className="font-serif text-xl font-medium tracking-tight"
              style={{ fontFamily: "var(--font-serif)", color: "var(--color-veil-ink)" }}
            >
              Share in Veil Chat
            </h3>
            <p className="text-xs text-muted" style={{ color: "var(--color-veil-muted)" }}>
              Send end-to-end encrypted secret directly to your contacts
            </p>
          </div>
        </div>

        {/* STATE 1: User Not Logged In */}
        {!user ? (
          <div className="flex flex-col items-center text-center py-6 gap-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center border"
              style={{
                backgroundColor: "var(--color-veil-ember-dim)",
                borderColor: "rgba(201, 93, 38, 0.3)",
                color: "var(--color-veil-ember)",
              }}
            >
              <UserIcon className="w-6 h-6" />
            </div>
            <div className="max-w-xs">
              <h4
                className="font-serif text-base font-medium mb-1"
                style={{ color: "var(--color-veil-ink)" }}
              >
                Sign in to send via Chat
              </h4>
              <p className="text-xs text-muted leading-relaxed" style={{ color: "var(--color-veil-muted)" }}>
                Log in to your Veil account to send this secret capsule directly into conversations with your connected friends.
              </p>
            </div>
            <div className="flex items-center gap-3 w-full max-w-xs mt-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openAuthModal("login");
                }}
                className="btn-primary text-xs sm:text-sm py-2.5 rounded-xl cursor-pointer w-full"
              >
                <span>Sign In / Register</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : sendSuccess ? (
          /* STATE 2: Successfully Sent to Chat */
          <div className="flex flex-col items-center text-center py-6 gap-4 anim-fade-up">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center">
              <Check className="w-7 h-7" />
            </div>
            <div>
              <h4
                className="font-serif text-lg font-medium mb-1"
                style={{ color: "var(--color-veil-ink)" }}
              >
                Secret Sent to @{selectedRecipientName}!
              </h4>
              <p className="text-xs text-muted" style={{ color: "var(--color-veil-muted)" }}>
                The encrypted secret capsule is now ready in your chat conversation.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full mt-4">
              <button
                type="button"
                onClick={handleGoToChat}
                className="btn-primary text-xs sm:text-sm py-2.5 px-5 rounded-xl cursor-pointer w-full flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Open in Veil Chat</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost text-xs sm:text-sm py-2.5 px-5 rounded-xl cursor-pointer w-full"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* STATE 3: Recipient Selection & Message Composer */
          <div className="flex flex-col gap-4">
            {/* Search contacts bar */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Search friends or conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="glass-inset-well w-full rounded-xl pl-9 pr-4 py-2.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              />
            </div>

            {/* Recipient list */}
            <div>
              <label
                className="text-[11px] font-semibold uppercase tracking-wider text-muted block mb-2"
                style={{ color: "var(--color-veil-muted)" }}
              >
                Select recipient
              </label>

              {loadingContacts ? (
                <div className="py-8 text-center text-xs text-muted">
                  Loading contacts...
                </div>
              ) : filteredRecipients.length === 0 ? (
                <div className="glass-inset-well rounded-2xl p-5 text-center flex flex-col items-center gap-2">
                  <span className="text-xs text-muted">
                    {searchQuery ? "No matching contacts found." : "No friends or conversations yet."}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateChat();
                    }}
                    className="text-xs font-medium text-amber-500 hover:underline cursor-pointer flex items-center gap-1 mt-1"
                  >
                    <span>Find friends in Chat</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 focus-veil rounded-xl">
                  {filteredRecipients.map((rec) => {
                    const isSelected =
                      (rec.conversationId && selectedConversationId === rec.conversationId) ||
                      (rec.targetUserId && selectedTargetUserId === rec.targetUserId);

                    return (
                      <button
                        key={rec.conversationId || rec.targetUserId || rec.username}
                        type="button"
                        onClick={() => {
                          setSelectedConversationId(rec.conversationId || null);
                          setSelectedTargetUserId(rec.targetUserId || null);
                          setSelectedRecipientName(rec.username);
                        }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all text-left cursor-pointer ${
                          isSelected
                            ? "border-amber-500/60 bg-amber-500/15"
                            : "border-white/5 hover:border-white/15 hover:bg-white/5"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-mono font-bold">
                            {rec.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-xs font-medium text-ink block" style={{ color: "var(--color-veil-ink)" }}>
                              @{rec.username}
                            </span>
                            <span className="text-[10px] text-muted flex items-center gap-1">
                              {rec.isFriend ? (
                                <>
                                  <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
                                  <span>Friend / Connected</span>
                                </>
                              ) : (
                                <>
                                  <Globe className="w-2.5 h-2.5 text-emerald-400" />
                                  <span>Public User</span>
                                </>
                              )}
                            </span>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Optional message / note */}
            <div>
              <label
                className="text-[11px] font-semibold uppercase tracking-wider text-muted block mb-1.5"
                style={{ color: "var(--color-veil-muted)" }}
              >
                Add a message (optional)
              </label>
              <textarea
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="e.g., Here's the secure credentials we discussed..."
                rows={2}
                className="glass-inset-well w-full rounded-xl p-3 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-amber-500/50 resize-none"
              />
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {errorMessage}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost text-xs py-2.5 px-4 rounded-xl cursor-pointer flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!selectedConversationId || sending}
                className="btn-primary text-xs py-2.5 px-5 rounded-xl cursor-pointer flex-1 flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <span>Sending...</span>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send to @{selectedRecipientName || "Chat"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
