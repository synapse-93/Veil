import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../hooks/useAuth.js";
import { BotanicalFlowerBee } from "./BotanicalFlowerBee.js";
import {
  getFriends,
  getFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  getConversations,
  getMessages,
  sendMessage,
  searchUsers,
  startConversation,
  createCapsule,
  consumeCapsule,
  revokeCapsule,
} from "../services/api.js";
import {
  encryptForShare,
  decryptFromShare,
  decodeFragment,
  verifyFragmentPassword,
} from "../crypto/zero-knowledge.js";
import type {
  FriendItem,
  FriendRequestItem,
  ConversationItem,
  MessageItem,
  SecurityRecipe,
  UserSearchResult,
} from "@secureshare/shared";
import {
  Lock,
  Send,
  UserPlus,
  Users,
  Shield,
  MessageSquare,
  Search,
  Check,
  X,
  Flame,
  Clock,
  Eye,
  Key,
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  LockKeyhole,
  CheckCircle2,
  Globe,
  ShieldCheck,
} from "lucide-react";

export function ChatPage() {
  const { user, openAuthModal, updateUserPrivacy } = useAuth();

  // State
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestItem[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  
  // Search & Friend Request State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [requestStatus, setRequestStatus] = useState<{ [username: string]: string }>({});
  const [startingChatUserId, setStartingChatUserId] = useState<string | null>(null);
  const [updatingPrivacy, setUpdatingPrivacy] = useState(false);

  // Chat message composition
  const [inputText, setInputText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // In-Chat Capsule Composer modal state
  const [isCapsuleModalOpen, setIsCapsuleModalOpen] = useState(false);
  const [capsuleSecret, setCapsuleSecret] = useState("");
  const [capsuleRecipe, setCapsuleRecipe] = useState<SecurityRecipe>("SECURE");
  const [capsulePassword, setCapsulePassword] = useState("");
  const [capsuleTtlMinutes, setCapsuleTtlMinutes] = useState(1440); // 24h
  const [capsuleMaxViews, setCapsuleMaxViews] = useState(3);
  const [capsuleBurnAfterRead, setCapsuleBurnAfterRead] = useState(false);
  const [creatingCapsule, setCreatingCapsule] = useState(false);
  const [capsuleModalError, setCapsuleModalError] = useState<string | null>(null);

  // In-Chat Capsule Unlock / Viewer modal state
  const [inspectingCapsuleMessage, setInspectingCapsuleMessage] = useState<MessageItem | null>(null);
  const [decryptingKey, setDecryptingKey] = useState("");
  const [decryptingPassword, setDecryptingPassword] = useState("");
  const [decryptedPlaintext, setDecryptedPlaintext] = useState<string | null>(null);
  const [autoFilledShareFragment, setAutoFilledShareFragment] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [decryptLoading, setDecryptLoading] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [revokingCapsuleId, setRevokingCapsuleId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());

  const messageViewportRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const isAtBottomRef = useRef<boolean>(true);

  useEffect(() => {
    setInspectingCapsuleMessage(null);
    setDecryptingKey("");
    setDecryptingPassword("");
    setDecryptedPlaintext(null);
    setDecryptError(null);
    setAutoFilledShareFragment(false);
    setCapsuleSecret("");
    setCapsuleRecipe("SECURE");
    setCapsulePassword("");
    setCapsuleTtlMinutes(1440);
    setCapsuleMaxViews(3);
    setCapsuleBurnAfterRead(false);
    setCapsuleModalError(null);
    setIsCapsuleModalOpen(false);
    setCopiedNotification(false);
    setRevokingCapsuleId(null);
  }, [user?.id]);

  // ---------------------------------------------------------------------------
  // Data Loading & Polling
  // ---------------------------------------------------------------------------

  const loadSocialData = async () => {
    if (!user) return [] as ConversationItem[];
    try {
      const [convRes, friendsRes, reqRes] = await Promise.all([
        getConversations(),
        getFriends(),
        getFriendRequests(),
      ]);
      setConversations(convRes.conversations);
      setFriends(friendsRes.friends);
      setIncomingRequests(reqRes.incoming);
      setOutgoingRequests(reqRes.outgoing);
      return convRes.conversations;
    } catch {
      // ignore transient network glitches
      return [] as ConversationItem[];
    }
  };

  const loadMessages = async (convId: string) => {
    if (!user || !convId) return;
    try {
      const res = await getMessages(convId);
      setMessages(res.messages);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!user) return;

    (async () => {
      // Load conversations first and then only honor a queued target conversation
      // if it really belongs to the authenticated user. This prevents stale
      // sessionStorage values from selecting another user's conversation.
      const convs = await loadSocialData();

      try {
        const targetConv = sessionStorage.getItem("veil_target_chat_conv");
        if (targetConv) {
          const exists = convs.some((c) => c.id === targetConv);
          // Remove queued target regardless; only set active if the conv belongs to user
          try {
            sessionStorage.removeItem("veil_target_chat_conv");
          } catch {}

          if (exists) {
            setActiveConversationId(targetConv);
          }
        }
      } catch {
        // ignore sessionStorage issues
      }

      const interval = setInterval(loadSocialData, 4000);
      return () => clearInterval(interval);
    })();
  }, [user]);

  useEffect(() => {
    if (!user || !activeConversationId) return;
    loadMessages(activeConversationId);
    const interval = setInterval(() => loadMessages(activeConversationId), 3000);
    return () => clearInterval(interval);
  }, [user, activeConversationId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const getCapsuleStatus = (
    msg: MessageItem,
  ): "ACTIVE" | "EXPIRED" | "REVOKED" | "BURNED" | "VIEW_LIMIT_REACHED" => {
    if (msg.status === "REVOKED") return "REVOKED";
    if (msg.status === "BURNED") return "BURNED";
    if (msg.status === "VIEW_LIMIT_REACHED") return "VIEW_LIMIT_REACHED";
    if (msg.status === "EXPIRED") return "EXPIRED";

    if (msg.expiresAt) {
      const expTime = new Date(msg.expiresAt).getTime();
      if (!isNaN(expTime) && expTime <= currentTime) {
        return "EXPIRED";
      }
    }

    return (msg.status as any) || "ACTIVE";
  };

  // Handle internal message viewport scrolling (does NOT scroll the page)
  const handleViewportScroll = () => {
    const el = messageViewportRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distanceFromBottom < 60;
  };

  const scrollToBottom = (smooth = false) => {
    const el = messageViewportRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      if (smooth) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    });
  };

  useEffect(() => {
    if (!activeConversationId) return;
    isAtBottomRef.current = true;
    scrollToBottom(false);
  }, [activeConversationId]);

  useEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom(false);
    }
  }, [messages]);

  // Focus input safely without window scrolling
  useEffect(() => {
    if (activeConversationId) {
      setTimeout(() => {
        messageInputRef.current?.focus({ preventScroll: true });
      }, 50);
    }
  }, [activeConversationId]);

  // User search debounce
  useEffect(() => {
    if (!user || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchUsers(searchQuery.trim());
        setSearchResults(res.users);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, user]);

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------

  const handleTogglePrivacy = async () => {
    if (!user || updatingPrivacy) return;
    setUpdatingPrivacy(true);
    try {
      await updateUserPrivacy(!user.isPublic);
    } catch (err: any) {
      setChatError(err.message || "Failed to update account privacy");
    } finally {
      setUpdatingPrivacy(false);
    }
  };

  const handleStartDirectConversation = async (targetUserId: string, targetUsername?: string) => {
    if (startingChatUserId) return;
    setStartingChatUserId(targetUserId);
    setChatError(null);
    try {
      const res = await startConversation({ targetUserId, targetUsername });
      await loadSocialData();
      setActiveConversationId(res.conversation.id);
      setSearchQuery("");
      setSearchResults([]);
    } catch (err: any) {
      setChatError(err.message || "Could not open chat with this user");
    } finally {
      setStartingChatUserId(null);
    }
  };

  const handleSendFriendRequest = async (targetUsername: string) => {
    try {
      setRequestStatus((prev) => ({ ...prev, [targetUsername]: "sending" }));
      await sendFriendRequest(targetUsername);
      setRequestStatus((prev) => ({ ...prev, [targetUsername]: "sent" }));
      loadSocialData();
    } catch (err: any) {
      setRequestStatus((prev) => ({
        ...prev,
        [targetUsername]: err.message || "Failed",
      }));
    }
  };

  const handleAcceptRequest = async (reqId: string) => {
    try {
      await acceptFriendRequest(reqId);
      await loadSocialData();
    } catch {
      // ignore
    }
  };

  const handleRejectRequest = async (reqId: string) => {
    try {
      await rejectFriendRequest(reqId);
      await loadSocialData();
    } catch {
      // ignore
    }
  };

  const handleStartChatWithFriend = (friend: FriendItem) => {
    if (friend.conversationId) {
      setActiveConversationId(friend.conversationId);
    }
  };

  const handleSendTextMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeConversationId || sendingMessage) return;

    const text = inputText.trim();
    setInputText("");
    setSendingMessage(true);
    setChatError(null);

    try {
      const newMsg = await sendMessage(activeConversationId, {
        type: "TEXT",
        content: text,
      });
      setMessages((prev) => [...prev, newMsg]);
      isAtBottomRef.current = true;
      scrollToBottom(true);
    } catch (err: any) {
      setChatError(err.message || "Failed to send message");
      setInputText(text); // restore
    } finally {
      setSendingMessage(false);
    }
  };

  const handleCreateAndSendCapsule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capsuleSecret.trim() || !activeConversationId || creatingCapsule) return;

    if (capsuleRecipe === "NUCLEAR" && !capsulePassword.trim()) {
      setCapsuleModalError("Nuclear recipe requires a decryption password.");
      return;
    }

    setCreatingCapsule(true);
    setCapsuleModalError(null);
    try {
      const isNuclear = capsuleRecipe === "NUCLEAR";
      const ttlSeconds = isNuclear ? 900 : capsuleTtlMinutes * 60;
      const requiresPassword = isNuclear || !!capsulePassword.trim();
      const maxViews = isNuclear ? 1 : capsuleMaxViews;
      const burnAfterRead = isNuclear ? true : capsuleBurnAfterRead;

      // Zero-knowledge encryption on device
      const encrypted = await encryptForShare(
        capsuleSecret.trim(),
        requiresPassword ? capsulePassword.trim() : undefined,
      );

      // Send ciphertext only to /capsules
      const capsule = await createCapsule({
        encryptedPayload: encrypted.serverPayload,
        recipe: capsuleRecipe,
        ttlSeconds,
        maxViews,
        requiresPassword,
        burnAfterRead,
      });

      // Post capsule metadata and the raw share fragment to the conversation.
      // The visible message still carries the full share URL for UX, but the fragment
      // lives in dedicated message metadata so the recipient can auto-fill it.
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      const shareUrl = `${window.location.origin}/share/${encodeURIComponent(capsule.metadata.id)}#${encrypted.fragment}`;
      const message = await sendMessage(activeConversationId, {
        type: "CAPSULE",
        content: `Sealed Capsule (${capsuleRecipe})\n\n🔒 Secret Link: ${shareUrl}`,
        shareFragment: encrypted.fragment,
        capsuleId: capsule.metadata.id,
        recipe: capsuleRecipe,
        expiresAt,
        maxViews,
        burnAfterRead,
        requiresPassword,
      });

      setMessages((prev) => [...prev, message]);
      setIsCapsuleModalOpen(false);
      setCapsuleSecret("");
      setCapsulePassword("");
    } catch (err: any) {
      setCapsuleModalError(err.message || "Failed to seal capsule");
    } finally {
      setCreatingCapsule(false);
    }
  };

  const handleOpenCapsuleViewer = (msg: MessageItem) => {
    setInspectingCapsuleMessage(msg);
    const shareUrl = msg.content.match(/https?:\/\/[^\s]+#[^\s]+/)?.[0] ?? "";
    const fragmentFromMessage = msg.shareFragment || (shareUrl ? shareUrl.split("#").pop() ?? "" : "");
    setDecryptingKey(fragmentFromMessage || shareUrl);
    setAutoFilledShareFragment(Boolean(msg.shareFragment || fragmentFromMessage));
    setDecryptingPassword("");
    setDecryptedPlaintext(null);
    setDecryptError(null);
    setCopiedNotification(false);
  };

  const handleRevokeInChat = async (msg: MessageItem) => {
    if (!msg.capsuleId || revokingCapsuleId) return;
    setRevokingCapsuleId(msg.capsuleId);
    try {
      await revokeCapsule(msg.capsuleId);
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, status: "REVOKED" } : m)),
      );
      loadSocialData();
    } catch (err: any) {
      setChatError(err.message || "Failed to revoke capsule");
    } finally {
      setRevokingCapsuleId(null);
    }
  };

  const handleUnlockCapsule = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inspectingCapsuleMessage || !inspectingCapsuleMessage.capsuleId) return;

    const keyFragment = decryptingKey.trim().includes("#")
      ? decryptingKey.trim().split("#").pop()?.trim()
      : decryptingKey.trim();

    if (!keyFragment) {
      setDecryptError("Please enter the decryption key or share link fragment.");
      return;
    }

    setDecryptLoading(true);
    setDecryptError(null);

    try {
      // 1. Consume view from server
      const consumed = await consumeCapsule(inspectingCapsuleMessage.capsuleId);

      // 2. Decrypt locally with fragment and optional password
      const pwd = decryptingPassword.trim() || undefined;
      const plaintext = await decryptFromShare(
        consumed.encryptedPayload,
        keyFragment,
        pwd,
      );

      setDecryptedPlaintext(plaintext);

      // If capsule burns on read or reached single view, mark as BURNED
      if (inspectingCapsuleMessage.burnAfterRead || inspectingCapsuleMessage.maxViews === 1) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === inspectingCapsuleMessage.id ? { ...m, status: "BURNED" } : m,
          ),
        );
      }
    } catch (err: any) {
      if (err?.responseBody?.reason === "REVOKED" || err?.message?.includes("revoked")) {
        setDecryptError("This secret was revoked by the sender.");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === inspectingCapsuleMessage.id ? { ...m, status: "REVOKED" } : m,
          ),
        );
      } else if (err?.responseBody?.reason === "EXPIRED" || err?.status === 410) {
        setDecryptError("This secret has timed out or expired.");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === inspectingCapsuleMessage.id ? { ...m, status: "EXPIRED" } : m,
          ),
        );
      } else if (err?.responseBody?.reason === "VIEW_LIMIT_REACHED" || err?.status === 429) {
        setDecryptError("Maximum view limit has been reached for this capsule.");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === inspectingCapsuleMessage.id ? { ...m, status: "VIEW_LIMIT_REACHED" } : m,
          ),
        );
      } else if (err?.message === "Decryption failed.") {
        setDecryptError("Incorrect password or invalid decryption fragment.");
      } else {
        setDecryptError(err.message || "Failed to unlock capsule.");
      }
    } finally {
      setDecryptLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render: Unauthenticated state
  // ---------------------------------------------------------------------------

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-12 sm:py-20 text-center">
        <div className="frosted-glass-card rounded-3xl p-8 sm:p-12 shadow-2xl relative overflow-hidden border border-[var(--color-veil-border)]">
          <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-5 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-ember shadow-md">
            <MessageSquare className="w-7 h-7" />
          </div>

          <h2
            className="font-serif text-2xl sm:text-3xl font-medium tracking-tight mb-3"
            style={{ fontFamily: "var(--font-serif)", color: "var(--color-veil-ink)" }}
          >
            Private Encrypted Chat
          </h2>

          <p className="text-xs sm:text-sm leading-relaxed max-w-sm mx-auto mb-8 text-muted" style={{ color: "var(--color-veil-muted)" }}>
            Connect with friends using private usernames. Chat in real-time and exchange zero-knowledge sealed secrets directly in conversations.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-xs mx-auto">
            <button
              id="chat-signin-btn"
              onClick={() => openAuthModal("login")}
              className="btn-primary py-2.5 px-5 rounded-xl text-xs sm:text-sm font-medium cursor-pointer shadow-md flex items-center justify-center gap-2"
            >
              <Users className="w-4 h-4" />
              <span>Sign In</span>
            </button>
            <button
              id="chat-register-btn"
              onClick={() => openAuthModal("register")}
              className="btn-ghost py-2.5 px-5 rounded-xl text-xs sm:text-sm font-medium cursor-pointer transition-colors"
            >
              Create Account
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-[var(--color-veil-border)] text-xs flex items-center justify-center gap-2 text-muted relative z-10" style={{ color: "var(--color-veil-muted)" }}>
            <Shield className="w-3.5 h-3.5 text-ember" />
            <span>Anonymous link sharing is always available without an account</span>
          </div>

          {/* Botanical Flower Accent - Gracefully shrinks and auto-hides on mobile aspect ratios */}
          <div className="botanical-chat-auth">
            <BotanicalFlowerBee showTrail={false} />
          </div>
        </div>
      </div>
    );
  }

  const activeConv = conversations.find((c) => c.id === activeConversationId);

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-4 md:px-6 py-2 sm:py-4 md:py-6 relative">
      {/* Workspace container with coherent height & flex structure */}
      <div className="h-[calc(100dvh-5.5rem)] sm:h-[calc(100dvh-6.5rem)] md:h-[calc(100dvh-7.5rem)] min-h-[500px] max-h-[880px] flex flex-col md:flex-row gap-3 sm:gap-4 md:gap-5 relative">
        
        {/* =================================================================== */}
        {/* LEFT SIDEBAR: Friends, Search, Requests, Conversations               */}
        {/* =================================================================== */}
        <div
          className={`w-full md:w-80 lg:w-96 shrink-0 flex flex-col frosted-glass-card rounded-2xl overflow-hidden border border-[var(--color-veil-border)] ${
            activeConversationId ? "hidden md:flex" : "flex"
          }`}
        >
          {/* User profile header (Unshrinking top) */}
          <div className="h-16 px-4 border-b border-[var(--color-veil-border)] flex items-center justify-between gap-3 shrink-0 bg-white/30 dark:bg-black/20">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 font-mono text-xs font-semibold shrink-0">
                {user.username.substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-semibold truncate block" style={{ color: "var(--color-veil-ink)" }}>
                  @{user.username}
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Online
                </span>
              </div>
            </div>
            <div className="text-[10px] font-mono tracking-wider px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0 font-medium">
              VEIL CHAT
            </div>
          </div>

          {/* Account Privacy Toggle Bar */}
          <div className="px-3 py-2 bg-black/[0.03] dark:bg-white/[0.02] border-b border-[var(--color-veil-border)] shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {user.isPublic !== false ? (
                  <div className="p-1 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <Globe className="w-3.5 h-3.5" />
                  </div>
                ) : (
                  <div className="p-1 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                    <Lock className="w-3.5 h-3.5" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-ink truncate" style={{ color: "var(--color-veil-ink)" }}>
                      {user.isPublic !== false ? "Public Account" : "Private Account"}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted truncate block" style={{ color: "var(--color-veil-muted)" }}>
                    {user.isPublic !== false
                      ? "Anyone can chat directly"
                      : "Requires friend request"}
                  </span>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                id="account-privacy-toggle"
                type="button"
                onClick={handleTogglePrivacy}
                disabled={updatingPrivacy}
                title={user.isPublic !== false ? "Switch to Private Account (Friend request required)" : "Switch to Public Account (Direct chat allowed)"}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                  user.isPublic !== false ? "bg-emerald-600" : "bg-neutral-400 dark:bg-neutral-600"
                }`}
                role="switch"
                aria-checked={user.isPublic !== false}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    user.isPublic !== false ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Search Input Bar */}
          <div className="p-3 pb-2 shrink-0">
            <div className="relative w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" style={{ color: "var(--color-veil-muted)" }} />
              <input
                id="user-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search username to connect or chat..."
                className="w-full h-9 pl-9 pr-8 bg-black/5 dark:bg-black/40 border border-[var(--color-veil-border)] rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:border-amber-500/60 transition-colors"
                style={{ color: "var(--color-veil-ink)" }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-muted hover:text-ink rounded"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Search Results Dropdown */}
          {searchQuery.trim() && (
            <div className="px-3 pb-2 shrink-0">
              <div className="p-2 bg-black/5 dark:bg-black/60 border border-[var(--color-veil-border)] rounded-xl max-h-56 overflow-y-auto space-y-1.5 shadow-inner">
                <div className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 text-muted" style={{ color: "var(--color-veil-muted)" }}>
                  Results for "{searchQuery}"
                </div>
                {searching ? (
                  <div className="text-xs text-muted px-2 py-1.5 flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></span>
                    <span>Searching network...</span>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="text-xs text-muted px-2 py-1.5">No users found with that username</div>
                ) : (
                  searchResults.map((res) => {
                    const isSelf = res.id === user.id;
                    const isFriend = res.isFriend || friends.some((f) => f.username === res.username);
                    const isPending = res.requestStatus === "PENDING" || outgoingRequests.some((r) => r.receiver?.username === res.username);
                    const status = requestStatus[res.username];
                    const isStartingThis = startingChatUserId === res.id;
                    const isPublicUser = res.isPublic !== false;

                    return (
                      <div
                        key={res.id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/5 hover:border-amber-500/30 transition-all gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-500 text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                            {res.username.substring(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-medium truncate block" style={{ color: "var(--color-veil-ink)" }}>
                              @{res.username} {isSelf && <span className="text-[10px] text-muted">(You)</span>}
                            </span>
                            <span className="text-[10px] flex items-center gap-1">
                              {isFriend ? (
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">Friend</span>
                              ) : isPublicUser ? (
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5">
                                  <Globe className="w-2.5 h-2.5" /> Public
                                </span>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-0.5">
                                  <Lock className="w-2.5 h-2.5" /> Private
                                </span>
                              )}
                            </span>
                          </div>
                        </div>

                        {!isSelf && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Message / Chat button for Public users or Friends */}
                            {(isPublicUser || isFriend) && (
                              <button
                                id={`chat-direct-${res.username}`}
                                onClick={() => handleStartDirectConversation(res.id, res.username)}
                                disabled={isStartingThis}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-medium rounded-lg text-[10px] flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                                title="Start direct chat"
                              >
                                {isStartingThis ? (
                                  <span className="w-3 h-3 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <MessageSquare className="w-3 h-3" />
                                )}
                                <span>Message</span>
                              </button>
                            )}

                            {/* Friend request button */}
                            {isFriend ? (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10">
                                <ShieldCheck className="w-3 h-3 inline" />
                              </span>
                            ) : isPending || status === "sent" ? (
                              <span className="text-[10px] text-muted px-2 py-1 rounded bg-black/5 dark:bg-white/5">
                                Request Sent
                              </span>
                            ) : !isPublicUser ? (
                              <button
                                id={`add-friend-${res.username}`}
                                onClick={() => handleSendFriendRequest(res.username)}
                                disabled={status === "sending"}
                                className="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-medium rounded-lg text-[10px] flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                                title="Send friend request to private account"
                              >
                                <UserPlus className="w-3 h-3" />
                                <span>{status === "sending" ? "..." : "Send Request"}</span>
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Incoming Requests Section (if any) */}
          {incomingRequests.length > 0 && (
            <div className="px-3 pb-2 shrink-0">
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <div className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Friend Requests</span>
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[9px] font-bold">
                    {incomingRequests.length}
                  </span>
                </div>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {incomingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between bg-white/60 dark:bg-black/40 p-2 rounded-lg text-xs gap-2 border border-amber-500/20"
                    >
                      <span className="font-medium truncate" style={{ color: "var(--color-veil-ink)" }}>
                        @{req.sender?.username}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          id={`accept-request-${req.id}`}
                          onClick={() => handleAcceptRequest(req.id)}
                          className="w-6 h-6 rounded flex items-center justify-center bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                          title="Accept request"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          id={`reject-request-${req.id}`}
                          onClick={() => handleRejectRequest(req.id)}
                          className="w-6 h-6 rounded flex items-center justify-center bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/30 transition-colors"
                          title="Decline request"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Conversations & Friends List (flex-1 min-h-0 with dedicated scroll) */}
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-1">
            <div className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1.5 text-muted sticky top-0 bg-transparent" style={{ color: "var(--color-veil-muted)" }}>
              Conversations
            </div>

            {conversations.length === 0 && friends.length === 0 ? (
              <div className="py-8 px-4 text-center text-xs text-muted flex flex-col items-center justify-center">
                <Users className="w-8 h-8 opacity-30 mb-2" />
                <p className="font-medium">No conversations yet</p>
                <p className="text-[11px] opacity-70 mt-0.5 max-w-[200px]">
                  Search for a username above to connect with friends
                </p>
              </div>
            ) : (
              <>
                {conversations.map((conv) => {
                  const isActive = conv.id === activeConversationId;
                  return (
                    <button
                      key={conv.id}
                      id={`conversation-item-${conv.id}`}
                      onClick={() => setActiveConversationId(conv.id)}
                      className={`w-full text-left p-2.5 sm:p-3 rounded-xl transition-all flex items-center justify-between gap-2.5 cursor-pointer border ${
                        isActive
                          ? "bg-amber-500/15 border-amber-500/40 shadow-sm"
                          : "hover:bg-black/5 dark:hover:bg-white/5 border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xs text-amber-600 dark:text-amber-400 font-semibold shrink-0">
                          {conv.otherUser.username.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold truncate" style={{ color: "var(--color-veil-ink)" }}>
                            @{conv.otherUser.username}
                          </div>
                          <div className="text-[11px] truncate mt-0.5" style={{ color: "var(--color-veil-muted)" }}>
                            {(() => {
                              if (!conv.lastMessage) return "Connected";
                              if (conv.lastMessage.type === "CAPSULE") {
                                const st = getCapsuleStatus(conv.lastMessage);
                                if (st === "REVOKED") return "🔒 Sealed Capsule · Revoked";
                                if (st === "EXPIRED") return "⏱ Sealed Capsule · Timed Out";
                                if (st === "BURNED" || st === "VIEW_LIMIT_REACHED") return "🔥 Sealed Capsule · Burned";
                                return "🔒 Sealed Capsule";
                              }
                              return conv.lastMessage.content;
                            })()}
                          </div>
                        </div>
                      </div>

                      {conv.unreadCount > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px] flex items-center justify-center shrink-0">
                          {conv.unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* Direct Friends without thread */}
                {friends
                  .filter((f) => !conversations.some((c) => c.otherUser.id === f.id))
                  .map((friend) => (
                    <button
                      key={friend.id}
                      onClick={() => handleStartChatWithFriend(friend)}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 border border-transparent flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/5 border border-[var(--color-veil-border)] flex items-center justify-center text-xs text-muted font-medium shrink-0">
                        {friend.username.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate" style={{ color: "var(--color-veil-ink)" }}>
                          @{friend.username}
                        </div>
                        <div className="text-[10px] text-muted truncate">Friend</div>
                      </div>
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium shrink-0">Chat →</span>
                    </button>
                  ))}
              </>
            )}
          </div>
        </div>

        {/* =================================================================== */}
        {/* RIGHT AREA: Active Conversation View                                */}
        {/* =================================================================== */}
        <div
          className={`flex-1 min-w-0 flex flex-col frosted-glass-card rounded-2xl overflow-hidden border border-[var(--color-veil-border)] relative ${
            !activeConversationId ? "hidden md:flex" : "flex"
          }`}
        >
          {activeConv ? (
            <>
              {/* Header (Unshrinking top) */}
              <div className="h-16 px-4 sm:px-5 border-b border-[var(--color-veil-border)] flex items-center justify-between gap-3 shrink-0 bg-white/30 dark:bg-black/20">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  {/* Back button on mobile */}
                  <button
                    type="button"
                    onClick={() => setActiveConversationId(null)}
                    className="md:hidden p-1.5 -ml-1 rounded-lg text-muted hover:text-ink hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    title="Back to conversations"
                  >
                    <ArrowRight className="w-4 h-4 rotate-180" />
                  </button>

                  <div className="w-9 h-9 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 font-semibold text-xs shrink-0">
                    {activeConv.otherUser.username.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-semibold flex items-center gap-2" style={{ color: "var(--color-veil-ink)" }}>
                      <span className="truncate">@{activeConv.otherUser.username}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-normal shrink-0">
                        Connected
                      </span>
                    </h3>
                    <p className="text-[11px] truncate text-muted" style={{ color: "var(--color-veil-muted)" }}>
                      Encrypted conversation
                    </p>
                  </div>
                </div>

                <button
                  id="chat-share-capsule-top-btn"
                  onClick={() => setIsCapsuleModalOpen(true)}
                  className="h-9 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5 text-ember" />
                  <span className="hidden sm:inline">Send Sealed Capsule</span>
                  <span className="sm:hidden">Capsule</span>
                </button>
              </div>

              {/* Message Thread (flex-1 min-h-0 with dedicated vertical scroll) */}
              <div
                ref={messageViewportRef}
                onScroll={handleViewportScroll}
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 flex flex-col gap-3.5"
              >
                {messages.length === 0 ? (
                  <div className="m-auto flex flex-col items-center justify-center text-center p-6 text-muted">
                    <Shield className="w-10 h-10 opacity-30 mb-3" />
                    <p className="text-sm font-medium" style={{ color: "var(--color-veil-ink)" }}>Encrypted Conversation</p>
                    <p className="text-xs max-w-xs mt-1 text-muted" style={{ color: "var(--color-veil-muted)" }}>
                      Send chat messages or share sealed capsules with custom self-destruction policies.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-h-0" aria-hidden="true" />
                    {messages.map((msg) => {
                    const isMe = msg.senderId === user.id;

                    if (msg.type === "CAPSULE") {
                      const capStatus = getCapsuleStatus(msg);
                      const isRevoked = capStatus === "REVOKED";
                      const isExpired = capStatus === "EXPIRED";
                      const isBurned = capStatus === "BURNED" || capStatus === "VIEW_LIMIT_REACHED";

                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                        >
                          <div className="text-[10px] mb-1 px-1 flex items-center gap-1 text-muted" style={{ color: "var(--color-veil-muted)" }}>
                            <Lock className="w-3 h-3 text-ember inline" />
                            <span>{isMe ? "You sent a sealed secret" : `@${msg.senderUsername || activeConv.otherUser.username} sent a secret`}</span>
                          </div>

                          {/* Capsule Card */}
                          <div
                            id={`capsule-msg-card-${msg.id}`}
                            className={`max-w-[90%] sm:max-w-md w-full rounded-2xl p-4 shadow-xl text-slate-100 relative overflow-hidden transition-all ${
                              isRevoked
                                ? "bg-gradient-to-br from-[#1c1414]/95 to-[#120c0c]/95 dark:from-[#1e1416] dark:to-[#140d0f] border border-rose-500/30"
                                : isExpired
                                ? "bg-gradient-to-br from-[#1c1815]/95 to-[#120f0d]/95 dark:from-[#1a1715] dark:to-[#12100f] border border-amber-500/25"
                                : isBurned
                                ? "bg-gradient-to-br from-[#1c1613]/95 to-[#120e0b]/95 dark:from-[#1c1512] dark:to-[#130f0c] border border-orange-500/25"
                                : "bg-gradient-to-br from-[#1c1917]/95 to-[#12100e]/95 dark:from-[#181a24] dark:to-[#12131a] border border-amber-500/35"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className={`p-1.5 rounded-lg border shrink-0 ${
                                    isRevoked
                                      ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                                      : isExpired
                                      ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                                      : isBurned
                                      ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
                                      : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                                  }`}
                                >
                                  {isRevoked ? (
                                    <ShieldAlert className="w-4 h-4" />
                                  ) : isExpired ? (
                                    <Clock className="w-4 h-4" />
                                  ) : isBurned ? (
                                    <Flame className="w-4 h-4" />
                                  ) : (
                                    <LockKeyhole className="w-4 h-4" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <span className="text-xs font-semibold text-white uppercase tracking-wider block">
                                    Veil Capsule
                                  </span>
                                  <span className="text-[10px] text-amber-400 font-mono">
                                    {msg.recipe || "SECURE"} RECIPE
                                  </span>
                                </div>
                              </div>

                              {/* Status Badge */}
                              {isRevoked ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-medium shrink-0 flex items-center gap-1">
                                  <ShieldAlert className="w-3 h-3" />
                                  <span>Revoked</span>
                                </span>
                              ) : isExpired ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium shrink-0 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>Timed Out</span>
                                </span>
                              ) : isBurned ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 font-medium shrink-0 flex items-center gap-1">
                                  <Flame className="w-3 h-3" />
                                  <span>Burned</span>
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium shrink-0">
                                  {msg.requiresPassword ? "Password Protected" : "Direct Link"}
                                </span>
                              )}
                            </div>

                            {/* Content: Inactive Banner or Active Grid */}
                            {isRevoked ? (
                              <div className="bg-rose-950/40 border border-rose-500/25 rounded-xl p-3 mb-3.5 flex items-center gap-2.5 text-xs text-rose-200">
                                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                                <div className="min-w-0">
                                  <div className="font-semibold text-rose-300">Capsule Revoked</div>
                                  <div className="text-[11px] text-rose-300/80 mt-0.5">
                                    The sender permanently revoked access to this secret.
                                  </div>
                                </div>
                              </div>
                            ) : isExpired ? (
                              <div className="bg-amber-950/30 border border-amber-500/25 rounded-xl p-3 mb-3.5 flex items-center gap-2.5 text-xs text-amber-200">
                                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                                <div className="min-w-0">
                                  <div className="font-semibold text-amber-300">Capsule Timed Out</div>
                                  <div className="text-[11px] text-amber-300/80 mt-0.5">
                                    This secret exceeded its expiration window and was destroyed.
                                  </div>
                                </div>
                              </div>
                            ) : isBurned ? (
                              <div className="bg-orange-950/30 border border-orange-500/25 rounded-xl p-3 mb-3.5 flex items-center gap-2.5 text-xs text-orange-200">
                                <Flame className="w-4 h-4 text-orange-400 shrink-0" />
                                <div className="min-w-0">
                                  <div className="font-semibold text-orange-300">Capsule Burned</div>
                                  <div className="text-[11px] text-orange-300/80 mt-0.5">
                                    View limit reached. Secret permanently purged.
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 mb-3.5 bg-black/40 p-2.5 rounded-xl border border-white/5">
                                <div className="flex items-center gap-1.5">
                                  <Eye className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span>{msg.maxViews === 1 ? "1 single view" : `Up to ${msg.maxViews} views`}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  <span>{msg.burnAfterRead ? "Burns on read" : "Multi-read"}</span>
                                </div>
                                {msg.expiresAt && (
                                  <div className="flex items-center gap-1.5 col-span-2 text-slate-400">
                                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span className="truncate">
                                      Expires: {new Date(msg.expiresAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Action Button */}
                            {isRevoked ? (
                              <div className="w-full h-9 rounded-xl bg-rose-950/30 border border-rose-500/20 text-rose-300/70 font-medium text-xs flex items-center justify-center gap-1.5 select-none">
                                <ShieldAlert className="w-3.5 h-3.5 text-rose-400/80" />
                                <span>Revoked by Sender</span>
                              </div>
                            ) : isExpired ? (
                              <div className="w-full h-9 rounded-xl bg-white/5 border border-white/10 text-slate-400 font-medium text-xs flex items-center justify-center gap-1.5 select-none">
                                <Clock className="w-3.5 h-3.5 text-amber-400/70" />
                                <span>Timed Out / Expired</span>
                              </div>
                            ) : isBurned ? (
                              <div className="w-full h-9 rounded-xl bg-white/5 border border-white/10 text-slate-400 font-medium text-xs flex items-center justify-center gap-1.5 select-none">
                                <Flame className="w-3.5 h-3.5 text-orange-400/70" />
                                <span>Burned on Read</span>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <button
                                  id={`open-capsule-btn-${msg.id}`}
                                  onClick={() => handleOpenCapsuleViewer(msg)}
                                  className="flex-1 h-9 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-semibold text-xs transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                  <Key className="w-3.5 h-3.5" />
                                  <span>Open Capsule →</span>
                                </button>
                                {isMe && (
                                  <button
                                    id={`revoke-capsule-btn-${msg.id}`}
                                    onClick={() => handleRevokeInChat(msg)}
                                    disabled={revokingCapsuleId === msg.capsuleId}
                                    title="Revoke secret immediately"
                                    className="h-9 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                  >
                                    {revokingCapsuleId === msg.capsuleId ? (
                                      <span className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <ShieldAlert className="w-3.5 h-3.5" />
                                    )}
                                    <span className="hidden sm:inline">Revoke</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          <span className="text-[10px] mt-1 px-1 text-muted" style={{ color: "var(--color-veil-muted)" }}>
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      );
                    }

                    // Standard text message bubble
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                      >
                        <div
                          className={`max-w-[85%] sm:max-w-md px-3.5 sm:px-4 py-2.5 rounded-2xl text-xs sm:text-[13px] leading-relaxed break-words shadow-sm ${
                            isMe
                              ? "bg-amber-500 text-slate-950 font-medium rounded-tr-xs"
                              : "bg-black/10 dark:bg-white/10 text-white rounded-tl-xs border border-black/5 dark:border-white/10"
                          }`}
                          style={!isMe ? { color: "var(--color-veil-ink)" } : undefined}
                        >
                          {msg.content}
                        </div>
                        <span className="text-[10px] mt-1 px-1 text-muted" style={{ color: "var(--color-veil-muted)" }}>
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

              {/* Message Composer Footer (Anchored bottom, unshrinking) */}
              <div className="p-3 sm:p-4 border-t border-[var(--color-veil-border)] bg-white/40 dark:bg-black/30 shrink-0">
                {chatError && (
                  <div className="mb-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-500 flex items-center justify-between">
                    <span>{chatError}</span>
                    <button type="button" onClick={() => setChatError(null)} className="p-0.5">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <form
                  onSubmit={handleSendTextMessage}
                  className="flex items-center gap-2"
                >
                  <button
                    id="chat-composer-capsule-btn"
                    type="button"
                    onClick={() => setIsCapsuleModalOpen(true)}
                    className="w-10 h-10 shrink-0 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center transition-colors cursor-pointer"
                    title="Seal and share zero-knowledge capsule"
                  >
                    <Lock className="w-4 h-4 text-ember" />
                  </button>

                  <input
                    ref={messageInputRef}
                    id="chat-message-input"
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Type an encrypted message..."
                    className="flex-1 h-10 px-3.5 sm:px-4 bg-black/5 dark:bg-black/40 border border-[var(--color-veil-border)] rounded-xl text-xs sm:text-sm placeholder-slate-400 focus:outline-none focus:border-amber-500/60 transition-colors"
                    style={{ color: "var(--color-veil-ink)" }}
                  />

                  <button
                    id="chat-send-btn"
                    type="submit"
                    disabled={!inputText.trim() || sendingMessage}
                    className="w-10 h-10 shrink-0 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                    title="Send message"
                  >
                    {sendingMessage ? (
                      <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted relative overflow-hidden">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-ember mb-4 shadow-sm z-10">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold mb-1 z-10" style={{ color: "var(--color-veil-ink)" }}>
                Select a conversation
              </h3>
              <p className="text-xs text-muted max-w-sm z-10" style={{ color: "var(--color-veil-muted)" }}>
                Choose a friend from the sidebar or search for a username to start a conversation.
              </p>

              {/* Botanical Flower Accent - Gracefully shrinks/hides at narrow widths and heights */}
              <div className="botanical-chat-empty">
                <BotanicalFlowerBee showTrail={false} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MODAL 1: In-Chat Capsule Creator                                      */}
      {/* ===================================================================== */}
      {isCapsuleModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in"
          onClick={() => !creatingCapsule && setIsCapsuleModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-[#181512] dark:bg-[#13151b] border border-amber-500/30 rounded-2xl p-6 shadow-2xl relative text-slate-100 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsCapsuleModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Seal Capsule in Chat</h3>
                <p className="text-xs text-slate-400">Zero-knowledge AES-GCM-256 encrypted on device</p>
              </div>
            </div>

            {capsuleModalError && (
              <div className="mb-4 p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{capsuleModalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateAndSendCapsule} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Secret Content
                </label>
                <textarea
                  id="chat-capsule-secret-input"
                  required
                  rows={4}
                  value={capsuleSecret}
                  onChange={(e) => setCapsuleSecret(e.target.value)}
                  placeholder="Paste private key, credentials, or sensitive secret..."
                  className="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 font-mono resize-none"
                />
              </div>

              {/* Recipe Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Security Recipe
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["QUICK", "SECURE", "NUCLEAR"] as SecurityRecipe[]).map((rec) => (
                    <button
                      key={rec}
                      type="button"
                      onClick={() => {
                        setCapsuleRecipe(rec);
                        if (rec === "NUCLEAR") {
                          setCapsuleMaxViews(1);
                          setCapsuleBurnAfterRead(true);
                          setCapsuleTtlMinutes(15);
                        } else if (rec === "QUICK") {
                          setCapsuleMaxViews(5);
                          setCapsuleBurnAfterRead(false);
                          setCapsuleTtlMinutes(10080); // 7 days
                        } else {
                          setCapsuleMaxViews(3);
                          setCapsuleBurnAfterRead(false);
                          setCapsuleTtlMinutes(1440); // 24h
                        }
                      }}
                      className={`h-9 px-3 rounded-xl border text-xs font-medium transition-all text-center flex items-center justify-center cursor-pointer ${
                        capsuleRecipe === rec
                          ? "bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-sm"
                          : "border-white/10 bg-white/5 text-slate-400 hover:text-white"
                      }`}
                    >
                      {rec}
                    </button>
                  ))}
                </div>
              </div>

              {/* Password Protection */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {capsuleRecipe === "NUCLEAR" ? (
                    <span className="text-amber-400 font-semibold">Decryption Password (Required for Nuclear)</span>
                  ) : (
                    <span>Optional Decryption Password</span>
                  )}
                </label>
                <input
                  id="chat-capsule-password-input"
                  type="password"
                  required={capsuleRecipe === "NUCLEAR"}
                  value={capsulePassword}
                  onChange={(e) => setCapsulePassword(e.target.value)}
                  placeholder={capsuleRecipe === "NUCLEAR" ? "Enter mandatory Nuclear password..." : "Leave empty or enter password..."}
                  className="w-full h-9 px-3 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              {/* View limit & Expiry settings */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Max Views</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={capsuleMaxViews}
                    onChange={(e) => setCapsuleMaxViews(parseInt(e.target.value, 10) || 1)}
                    disabled={capsuleRecipe === "NUCLEAR"}
                    className="w-full h-9 px-3 bg-black/40 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Duration (minutes)</label>
                  <input
                    type="number"
                    min={1}
                    value={capsuleTtlMinutes}
                    onChange={(e) => setCapsuleTtlMinutes(parseInt(e.target.value, 10) || 15)}
                    className="w-full h-9 px-3 bg-black/40 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  id="chat-submit-capsule-btn"
                  type="submit"
                  disabled={creatingCapsule || !capsuleSecret.trim()}
                  className="w-full h-10 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-semibold rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  {creatingCapsule ? (
                    <>
                      <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                      <span>Encrypting on Device...</span>
                    </>
                  ) : (
                    <>
                      <LockKeyhole className="w-4 h-4" />
                      <span>Seal & Send to Chat</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: In-Chat Capsule Decryption & Viewer                          */}
      {/* ===================================================================== */}
      {inspectingCapsuleMessage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in"
          onClick={() => !decryptLoading && setInspectingCapsuleMessage(null)}
        >
          <div
            className="w-full max-w-lg bg-[#181512] dark:bg-[#13151b] border border-amber-500/30 rounded-2xl p-6 shadow-2xl relative text-slate-100 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setInspectingCapsuleMessage(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <LockKeyhole className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Veil Sealed Capsule</h3>
                <p className="text-xs text-slate-400">
                  {decryptedPlaintext
                    ? "Decrypted locally via client zero-knowledge key"
                    : inspectingCapsuleMessage.requiresPassword
                    ? "Password protected capsule"
                    : "Zero-knowledge recipient decryption"}
                </p>
              </div>
            </div>

            {decryptError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{decryptError}</span>
              </div>
            )}

            {decryptedPlaintext ? (
              <div className="space-y-4">
                <div className="p-4 bg-black/60 border border-amber-500/30 rounded-xl font-mono text-xs text-amber-100 whitespace-pre-wrap break-all select-all max-h-60 overflow-y-auto">
                  {decryptedPlaintext}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(decryptedPlaintext);
                      setCopiedNotification(true);
                      setTimeout(() => setCopiedNotification(false), 2500);
                    }}
                    className="flex-1 h-9 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                  >
                    {copiedNotification ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-slate-950" />
                        <span>Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                        <span>Copy Secret</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setInspectingCapsuleMessage(null)}
                    className="h-9 px-4 rounded-xl border border-white/10 text-xs font-medium text-slate-300 hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleUnlockCapsule} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Decryption Key (or Share Link)
                  </label>
                  <input
                    id="chat-decrypt-key-input"
                    name="capsule-decryption-key"
                    type="text"
                    autoComplete="off"
                    autoFocus={!inspectingCapsuleMessage.requiresPassword}
                    required
                    value={decryptingKey}
                    onChange={(e) => setDecryptingKey(e.target.value)}
                    readOnly={autoFilledShareFragment}
                    placeholder={autoFilledShareFragment ? "Decryption fragment auto-filled from chat" : "Paste decryption key fragment or https://...#fragment"}
                    className={`w-full h-9 px-3 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 font-mono ${autoFilledShareFragment ? "cursor-default opacity-80" : ""}`}
                  />
                </div>

                {inspectingCapsuleMessage.requiresPassword && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Enter Password to Unlock
                    </label>
                    <input
                      id="chat-decrypt-password-input"
                      name="capsule-password"
                      type="password"
                      autoComplete="new-password"
                      autoFocus={inspectingCapsuleMessage.requiresPassword}
                      required
                      value={decryptingPassword}
                      onChange={(e) => setDecryptingPassword(e.target.value)}
                      placeholder="Enter password..."
                      className="w-full h-9 px-3 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                    />
                  </div>
                )}

                <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-[11px] text-slate-300 space-y-1">
                  <div>• Recipe: {inspectingCapsuleMessage.recipe || "SECURE"}</div>
                  <div>• Max Views: {inspectingCapsuleMessage.maxViews}</div>
                  <div>• {inspectingCapsuleMessage.burnAfterRead ? "Burns immediately upon opening" : "Multi-view capable"}</div>
                </div>

                <button
                  id="chat-unlock-submit-btn"
                  type="submit"
                  disabled={decryptLoading}
                  className="w-full h-10 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-semibold rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  {decryptLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                      <span>Unlocking & Decrypting...</span>
                    </>
                  ) : (
                    <>
                      <Key className="w-4 h-4" />
                      <span>Unlock Secret</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

