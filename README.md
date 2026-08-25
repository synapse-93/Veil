# Veil

> **Share sensitive information. Not your trust.**

Veil is a privacy-focused secure information-sharing platform built around **temporary, controlled-access capsules**.

---

# 🚀 Quick Start

Follow these steps to run Veil locally.

## 1. Requirements

Install the following before starting:

- **Node.js 20+**
- **npm**
- **PostgreSQL**
- **Git**

Check your versions:

```bash
node --version
npm --version
git --version
```

## 2. Clone the Repository

```bash
git clone https://github.com/synapse-93/Veil.git
cd Veil
```

## 3. Install Dependencies

From the repository root:

```bash
npm install
```

## 4. Configure Environment Variables

Create the required environment files using the repository's existing environment templates/configuration.

The backend requires a PostgreSQL connection and authentication secret in production-style environments.

Typical backend variables are:

```env
DATABASE_URL=your_postgresql_connection_string
JWT_SECRET=your_secure_jwt_secret
FRONTEND_ORIGIN=http://localhost:5173
```

**Never commit real database credentials, JWT secrets, or other secrets to GitHub.**

## 5. Prepare the Database

From the repository root, generate the Prisma client:

```bash
npx prisma generate --schema=apps/backend/prisma/schema.prisma
```

If your local PostgreSQL database requires migrations, run the repository's Prisma migration workflow before starting the backend.

## 6. Typecheck the Project

```bash
npm run typecheck
```

## 7. Build the Project

```bash
npm run build
```

## 8. Start the Backend

From the repository root:

```bash
npm run dev:backend
```

The backend runs on the configured backend port, normally:

```text
http://localhost:3000
```

Health check:

```text
http://localhost:3000/health
```

Expected response:

```json
{"status":"ok"}
```

## 9. Start the Frontend

Open a second terminal in the repository root:

```bash
npm run dev:frontend
```

The frontend normally runs at:

```text
http://localhost:5173
```

Open that address in your browser.

## 10. Try Veil

Recommended first-time flow:

1. Open the home page.
2. Create a test capsule.
3. Enter information to protect.
4. Configure the capsule lifecycle/access behaviour.
5. Generate the share link.
6. Open the share link in another browser tab/window.
7. Test the recipient viewing flow.
8. Test expiration/view/burn behaviour.
9. Create an account and explore History.
10. Open **Veil Chat** and test messaging/capsule sharing.
11. Explore **Risk Lens**.

> **Note:** The exact npm scripts available in the current checkout can be verified with `npm run` if your environment differs from the standard development setup above.

---

# ✨ Overview

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

A capsule can be created and shared through the chat experience, allowing secure information sharing to become part of an existing conversation.

---

# 📜 Capsule History

Authenticated users can access their capsule history through the History / Secrets interface.

This provides a centralized view of capsule activity and allows users to manage capsules associated with their account.

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
│   └── shared/
│       ├── Types
│       ├── Constants
│       ├── Zod Schemas
│       └── Shared Validation
│
└── cli/
    └── Command-line client
```

## Frontend Architecture

The frontend is responsible for the user-facing experience and client-side security workflows.

Main responsibilities include:

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

## Backend Architecture

The backend is implemented using **Fastify** and follows a layered structure:

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

Responsible for HTTP request handling, input extraction, validation, and HTTP responses.

### Services

Responsible for business logic, capsule operations, authentication workflows, conversation logic, and lifecycle operations.

### Repositories

Responsible for database access, Prisma queries, and persistence operations.

### Plugins

Responsible for cross-cutting backend functionality such as authentication, rate limiting, error handling, and CORS.

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

Database access is performed through Prisma.

---

# 🔒 Security Architecture

Security is treated as a first-class product requirement.

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

# 👨‍⚖️ Judge's Quick Tour

The fastest way to understand Veil is to follow this workflow:

1. Open the home page.
2. Create a test capsule.
3. Enter information to protect.
4. Configure lifecycle/access behaviour.
5. Generate the share link.
6. Open the share link in another browser tab/window.
7. Test the recipient viewing flow.
8. Test expiration/view/burn behaviour.
9. Create an account and explore History.
10. Open Veil Chat and test messaging/capsule sharing.
11. Explore Risk Lens.

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

---

# 📁 Repository

GitHub:

https://github.com/synapse-93/Veil

---

# 🏆 CloneFest 2.0

Veil was developed for **CloneFest 2.0** with a focus on privacy-focused engineering, secure information sharing, controlled-access digital content, and a polished full-stack user experience.

The project combines product design, frontend engineering, backend engineering, database architecture, cryptography, authentication, security controls, testing, and responsive UI into a single full-stack application.

---

**Veil — Share sensitive information. Not your trust.**
