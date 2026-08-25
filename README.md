# Veil

> **Share sensitive information. Not your trust.**

Veil is a privacy-focused secure information-sharing platform built around **temporary, controlled-access capsules**.

Instead of treating sensitive information as ordinary text that lives permanently in a database or chat, Veil wraps it in a capsule with configurable access and lifecycle controls.

---

## ✨ What is Veil?

Veil allows users to create a protected capsule containing sensitive information, generate a dedicated share link, and give the intended recipient controlled access to that information.

The platform combines:

- 🔐 Client-side cryptography
- 🧩 Secure capsule sharing
- ⏳ Expiration and lifecycle controls
- 👤 Authentication
- 📜 Capsule history
- 💬 Veil Chat
- 🛡️ Risk Lens
- 🌙 Dark / light mode
- 📱 Responsive UI
- 🗄️ Full-stack persistence and validation

The goal is simple:

> **Make sharing sensitive information as easy as sending a link, while making the underlying access model security-conscious.**

---

# 🚀 Core Features

## 🔐 Secure Capsules

Create a capsule containing sensitive information and generate a unique shareable link.

Capsules are treated as controlled resources rather than ordinary publicly accessible content.

Users can configure how the capsule behaves throughout its lifecycle.

---

## 🛡️ Client-Side Cryptography

Veil uses browser-side cryptographic functionality to protect sensitive information.

The frontend uses the **Web Crypto API** and cryptographic primitives including:

- AES-GCM
- PBKDF2-HMAC-SHA256
- Cryptographically secure random key generation
- Client-side encryption and decryption

The architecture is designed so sensitive plaintext is handled through the client-side cryptographic workflow rather than being treated as ordinary application data.

---

## ⏳ Capsule Lifecycle Controls

Capsules can have lifecycle restrictions such as:

- Expiration
- Maximum views
- Burn-after-read behaviour
- Controlled consumption

This means a capsule does not have to remain available indefinitely.

Once its configured lifecycle condition is reached, access can be permanently restricted.

---

## 🔗 Secure Share Links

Every capsule can generate a dedicated sharing URL.

Recipients access capsules through a dedicated `/share/...` flow rather than the normal application navigation.

The sharing experience is designed around:

**Create → Protect → Share → Open → Access → Expire / Consume**

---

# 💬 Veil Chat

Veil includes an integrated messaging experience.

Users can:

- Create conversations
- Exchange messages
- Share capsules through chat
- Access shared capsule flows directly from messages
- Use the same application for communication and secure information sharing

The goal is to combine communication and secure information sharing inside one privacy-focused experience.

---

# 👤 Authentication

Veil includes account-based authentication for protected application functionality.

Authenticated users can access:

- Account-specific capsule history
- Conversations
- Protected application areas
- User-specific functionality

Authentication state is handled separately from capsule encryption state.

---

# 📜 Capsule History

Authenticated users can access their previous capsule activity through the History / Secrets interface.

This provides a centralized place to manage capsules associated with their account instead of relying entirely on manually saved links.

---

# ⚠️ Risk Lens

Veil includes a **Risk Lens** security-posture concept.

Instead of hiding security considerations behind implementation details, Veil surfaces security-related information directly within the product experience.

Risk Lens is designed to give users additional visibility into the security considerations surrounding their sharing workflow.

---

# 🌙 Modern Interface

Veil provides a modern responsive interface with:

- Dark mode
- Light mode
- Responsive layouts
- Dedicated navigation
- Capsule creation interface
- Capsule viewing interface
- Authentication UI
- Chat interface
- History interface
- Informational pages

The frontend is implemented using React and TypeScript with Vite.

---

# 🧭 Application Flow

### 1. Create

Create a capsule containing the information you want to share.

### 2. Protect

The information goes through the client-side cryptographic workflow.

### 3. Configure

Configure the capsule's lifecycle and access behaviour.

### 4. Share

Generate a dedicated share link.

### 5. Recipient Access

The recipient opens the dedicated capsule URL.

### 6. Validation

The application validates the capsule and its lifecycle state.

### 7. View

The recipient accesses the protected information according to the capsule's configured rules.

### 8. Lifecycle Completion

Once the capsule expires or reaches its consumption limit, it becomes unavailable.

---

# 🏗️ Architecture

Veil is structured as a TypeScript monorepo.

```text
Veil/
│
├── apps/
│   │
│   ├── frontend/
│   │   ├── React
│   │   ├── TypeScript
│   │   └── Vite
│   │
│   └── backend/
│       ├── Fastify
│       ├── Prisma
│       ├── PostgreSQL
│       ├── Controllers
│       ├── Services
│       ├── Repositories
│       ├── Plugins
│       └── Validation
│
├── packages/
│   │
│   └── shared/
│       ├── Types
│       ├── Constants
│       ├── Zod Schemas
│       └── Shared Validation
│
├── cli/
│   └── Command-line client
│
└── tests/
    ├── Unit
    ├── Integration
    └── E2E
