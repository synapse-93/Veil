# Veil

> **Share sensitive information. Not your trust.**

Veil is a privacy-focused secure information-sharing platform built around **temporary, controlled-access capsules**.

Instead of treating sensitive information as ordinary text that permanently lives in a database or chat, Veil wraps information inside a capsule with configurable access and lifecycle controls.

---

## ✨ Overview

Veil is designed to make sensitive information sharing simple for the user while keeping security and controlled access at the centre of the architecture.

The core workflow is:

**Create → Encrypt → Configure → Share → Access → Consume / Expire**

A user creates a capsule containing sensitive information, protects it through the client-side cryptographic workflow, configures its lifecycle, and generates a dedicated share link for the intended recipient.

Veil also provides authenticated user functionality, capsule history, integrated messaging through Veil Chat, and the Risk Lens security-posture interface.

---

# 🚀 Features

## 🔐 Secure Capsules

Veil's primary abstraction is the **Capsule**.

A capsule represents a protected piece of information that can be shared with another person through a dedicated link.

Users can:

- Create capsules
- Add sensitive information
- Configure capsule behaviour
- Generate dedicated share links
- Share capsules directly
- View capsule status and lifecycle
- Consume capsules according to configured rules

Capsules are designed to be controlled resources rather than permanent public content.

---

## 🛡️ Client-Side Cryptography

Veil uses browser-side cryptographic functionality to protect sensitive information.

The frontend uses the **Web Crypto API** and cryptographic primitives including:

- AES-GCM
- PBKDF2-HMAC-SHA256
- Cryptographically secure random key generation
- Client-side encryption and decryption

The cryptographic workflow is separated from ordinary application data handling.

The goal is to ensure that sensitive plaintext is handled through the client-side cryptographic pipeline rather than being treated as ordinary backend data.

---

## 🔗 Secure Share Links

Each capsule can generate a dedicated share URL.

Recipients access the capsule through a dedicated share route rather than through the normal application navigation.

The general experience is:

**Create Capsule → Client-side Protection → Configure Lifecycle → Generate Share Link → Send Link → Recipient Opens Link → Capsule Access → View / Consume → Expire or Burn**

This provides a simple sharing experience without requiring the recipient to navigate through the entire application.

---

# ⏳ Capsule Lifecycle

Veil treats capsule availability as a lifecycle rather than a permanent state.

Capsules can support lifecycle restrictions such as:

- Expiration
- Maximum views
- Burn-after-read behaviour
- Controlled consumption

The backend enforces lifecycle transitions so that access conditions are evaluated when the capsule is consumed.

This allows sensitive information to automatically become unavailable once its configured lifecycle has been completed.

---

# 👤 Authentication

Veil provides account-based authentication for protected application functionality.

Authenticated users can access account-specific functionality including:

- Capsule history
- User-specific application state
- Conversations
- Protected application areas

Authentication and capsule encryption are handled as separate concerns.

The authentication system uses protected tokens and backend validation while the capsule cryptographic workflow remains focused on protecting capsule contents.

---

# 💬 Veil Chat

Veil includes an integrated messaging system called **Veil Chat**.

The purpose is to allow users to communicate and share secure capsules without having to leave the application.

Chat provides:

- Conversations
- User-to-user messaging
- Message history
- Capsule sharing through conversations
- Direct access to shared capsule flows

A capsule can be created and shared through the chat experience, allowing secure information sharing to become part of an existing conversation instead of requiring a separate external service.

---

# 📜 Capsule History

Authenticated users can access their capsule history through the History / Secrets interface.

This provides a centralized view of capsule activity and allows users to manage capsules associated with their account.

Instead of relying exclusively on manually saved links, users can return to the application and access their capsule-related information through their account.

---

# ⚠️ Risk Lens

Veil includes a **Risk Lens** security-posture interface.

Instead of hiding security considerations behind implementation details, Veil surfaces security-related information directly within the product experience.

Risk Lens is designed to give users additional visibility into the security considerations surrounding their sharing workflow.

---

# 🌙 UI & User Experience

Veil provides a modern responsive interface designed around the capsule-sharing workflow.

The application includes dedicated interfaces for:

- Home
- Capsule creation
- Capsule viewing
- Authentication
- Capsule history
- Veil Chat
- Risk Lens
- About / informational content

The interface also supports:

- Dark mode
- Light mode
- Responsive layouts
- Dedicated navigation
- Share-specific routing
- Interactive capsule controls

The frontend is implemented using React and TypeScript with Vite.

---

# 🧭 Application Routes

The frontend provides dedicated application flows including:

```text
/
├── /create
├── /share/:id
├── /secrets
├── /history
├── /chat
├── /messages
├── /about
└── /how-it-works
```

The share route is intentionally separated from normal application navigation so that a recipient can directly open a capsule through its dedicated URL.

---

# 🏗️ Architecture

Veil is implemented as a TypeScript monorepo.

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
```

---

# 🖥️ Frontend Architecture

The frontend is responsible for the user-facing experience and client-side security workflows.

### Main responsibilities

- UI rendering
- Application routing
- Authentication state
- Capsule creation
- Capsule viewing
- Client-side encryption/decryption
- Share-link handling
- Chat interface
- Capsule history
- Risk Lens
- Theme management

### Main technologies

- React
- TypeScript
- Vite
- Tailwind CSS
- Web Crypto API
- Lucide icons

The application is organized into reusable components, hooks, services, cryptographic utilities, and page-level flows.

---

# ⚙️ Backend Architecture

The backend is implemented using **Fastify** and follows a layered structure.

```text
HTTP Request
     ↓
Fastify Route
     ↓
Controller
     ↓
Service
     ↓
Repository
     ↓
Prisma
     ↓
PostgreSQL
```

### Controllers

Responsible for:

- HTTP request handling
- Input extraction
- Validation
- HTTP responses

### Services

Responsible for:

- Business logic
- Capsule operations
- Authentication workflows
- Conversation logic
- Lifecycle operations

### Repositories

Responsible for:

- Database access
- Prisma queries
- Persistence operations

### Plugins

Responsible for cross-cutting backend functionality such as:

- Authentication
- Rate limiting
- Error handling
- CORS

This separation keeps API handling, business logic and persistence from being tightly coupled.

---

# 🗄️ Database

Veil uses:

- PostgreSQL
- Prisma ORM

The database stores application state such as:

- Users
- Capsules
- Conversations
- Messages
- Capsule metadata
- Lifecycle information

Database access is performed through Prisma rather than constructing raw SQL queries throughout the application.

---

# 🔒 Security Architecture

Security is treated as a first-class product requirement.

The application separates responsibilities between the client and backend.

### Client

The client handles:

- Cryptographic operations
- Encryption/decryption workflows
- Share-link handling
- User interaction

### Backend

The backend handles:

- Authentication
- Authorization
- Capsule lifecycle enforcement
- Persistence
- Validation
- Rate limiting
- API access control

---

# 🧪 Input Validation

Veil uses **Zod** schemas for structured input validation.

Validation is shared across the monorepo where appropriate through the shared package.

This helps keep frontend and backend assumptions about API data consistent.

---

# 🛡️ Backend Security Controls

The backend includes security-focused infrastructure such as:

- Authentication middleware/hooks
- Protected routes
- Rate limiting
- Strict request validation
- Production configuration validation
- CORS configuration
- Centralized error handling
- Parameterized Prisma queries

Production configuration is designed to fail closed when required deployment configuration is missing.

---

# ⚡ Rate Limiting

Sensitive API operations are protected through backend rate limiting.

This includes authentication-related endpoints and capsule operations.

The goal is to reduce the risk of uncontrolled automated requests against sensitive functionality.

---

# 🔥 Capsule Consumption

Capsule lifecycle operations are handled atomically where required.

Consumption checks take the capsule's current state into account before transitioning it to its next lifecycle state.

This helps prevent multiple simultaneous requests from incorrectly consuming a capsule beyond its configured limits.

---

# 🧪 Testing

Veil includes automated testing infrastructure covering multiple layers of the application.

Testing includes areas such as:

- Authentication
- Capsule creation
- Capsule consumption
- Capsule lifecycle
- Repository operations
- Service logic
- Rate limiting
- Cryptographic functionality
- End-to-end application flows

Technologies include:

- Vitest
- Playwright
- TypeScript type checking

---

# 🧰 CLI

The repository also contains a command-line client package.

This provides a foundation for interacting with Veil functionality outside the browser-based interface.

---

# 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React |
| Language | TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| Backend | Node.js + Fastify |
| Database | PostgreSQL |
| ORM | Prisma |
| Validation | Zod |
| Cryptography | Web Crypto API |
| Encryption | AES-GCM |
| Key Derivation | PBKDF2-HMAC-SHA256 |
| Testing | Vitest |
| E2E Testing | Playwright |
| Architecture | TypeScript Monorepo |

---

# 🚀 Local Development

## Requirements

- Node.js
- npm
- PostgreSQL

## Clone

```bash
git clone https://github.com/synapse-93/Veil.git
cd Veil
```

## Install

```bash
npm install
```

## Typecheck

```bash
npm run typecheck
```

## Build

```bash
npm run build
```

## Development

Run the frontend:

```bash
npm run dev:frontend
```

Run the backend:

```bash
npm run dev:backend
```

Check the root `package.json` for the complete list of available workspace scripts.

---

# 👨‍⚖️ Judge's Quick Tour

The fastest way to understand Veil is to follow this workflow.

### 1. Home

Start on the home page to understand the product concept.

### 2. Create a Capsule

Create a test capsule containing information you want to protect.

Explore the available lifecycle and access controls.

### 3. Generate the Share Link

Complete the capsule creation flow and generate the dedicated share link.

### 4. Open the Share Link

Open the generated link in another browser tab or window to experience the recipient flow.

### 5. Test Capsule Lifecycle

Test the configured view, expiration, or burn behaviour.

### 6. Authentication

Create an account and explore the authenticated application.

### 7. History

Open the History / Secrets section to explore account-specific capsule activity.

### 8. Veil Chat

Open Chat and test messaging and capsule sharing through a conversation.

### 9. Risk Lens

Explore the Risk Lens interface to understand Veil's security-oriented product layer.

---

# 💡 Why Veil?

Traditional messaging platforms are optimized for communication.

Traditional file-sharing platforms are optimized for persistence.

Veil focuses on a different problem:

> **How can sensitive information be shared conveniently without treating it like ordinary permanent content?**

Veil approaches this through:

**Encryption + Controlled Access + Lifecycle Management + Simple Sharing**

The result is a full-stack privacy-focused application built around the concept of **temporary digital capsules**.

---

# 🎯 Product Philosophy

Veil is built around three core principles:

### Privacy

Sensitive information should receive stronger protection than ordinary application data.

### Control

The sender should be able to define how and how long information can be accessed.

### Simplicity

Security should not require the user to understand the underlying cryptographic implementation.

The user experience therefore remains simple:

```text
Protect something
       ↓
Share it
       ↓
Recipient accesses it
       ↓
Control determines what happens next
```

---

# 📁 Repository

GitHub:

https://github.com/synapse-93/Veil

---

# 🏆 CloneFest 2.0

Veil was developed for **CloneFest 2.0** with a focus on privacy-focused engineering, secure information sharing, controlled-access digital content, and a polished full-stack user experience.

The project combines:

- Product design
- Frontend engineering
- Backend engineering
- Database architecture
- Cryptography
- Authentication
- Security controls
- Testing
- Responsive UI

into a single full-stack application.

---

## Built for secure sharing

**Veil — Share sensitive information. Not your trust.**
