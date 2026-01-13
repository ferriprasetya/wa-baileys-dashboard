# WhatsApp Gateway (Baileys) Dashboard

![Node.js](https://img.shields.io/badge/Node.js-v20-green)
![Fastify](https://img.shields.io/badge/Fastify-v5-black)
![TypeScript](https://img.shields.io/badge/TypeScript-v5-blue)
![Docker](https://img.shields.io/badge/Docker-Enabled-blue)

A centralized, high-performance WhatsApp Gateway (SaaS-lite) designed to manage multiple WhatsApp sessions via a single dashboard.

Built with a **Module-Driven Architecture** (Vertical Slicing) on Fastify, ensuring rapid development without sacrificing performance. It solves common connection issues using Redis-based queuing and database-persistent sessions.

## ⚠️ Disclaimer

This project uses [**Baileys**](https://github.com/WhiskeySockets/Baileys), an **unofficial WhatsApp library**. Baileys is not affiliated with WhatsApp Inc. and operates through reverse-engineering WhatsApp's web client. Please be aware of the following:

- **Use at your own risk:** WhatsApp's Terms of Service may not permit automated access via unofficial libraries.
- **Account suspension risk:** Using this library may result in your WhatsApp account being temporarily or permanently banned.
- **No warranty:** This project and Baileys are provided as-is without any warranty or official support from WhatsApp.

For official WhatsApp integration, consider using the [WhatsApp Business API](https://developers.facebook.com/docs/whatsapp/).

## 📱 Purpose

This project is specifically designed to manage **multi-device WhatsApp logins** using Baileys library, enabling you to:

- Create and manage multiple independent WhatsApp sessions (one per device/phone number)
- Automate WhatsApp messaging at scale via a centralized API
- Persist session credentials securely in PostgreSQL
- Handle high message throughput with Redis-based job queuing
- Monitor session status and message logs through a unified dashboard

## 🚀 Key Features

- **Multi-Tenant Support:** Manage multiple independent WhatsApp sessions (Tenants) in one instance.
- **Robust Queue System:** Uses **BullMQ (Redis)** to handle high-throughput messaging and prevent rate-limiting bans.
- **Persistent Sessions:** Baileys credentials are stored in **PostgreSQL**, making the system container-friendly (stateless application logic).
- **Real-time UI:** Server-driven dashboard using **EJS + HTMX** for QR code streaming and status updates.

## 🛠 Tech Stack

| Component           | Technology                     | Reason                                       |
| :------------------ | :----------------------------- | :------------------------------------------- |
| **Runtime**         | Node.js (ESM) + TypeScript     | Type safety & modern ecosystem.              |
| **Framework**       | Fastify                        | Low overhead, high performance.              |
| **Architecture**    | Module Driven (Vertical Slice) | Scalability & organized codebase.            |
| **Database**        | PostgreSQL + Drizzle ORM       | Relational integrity & rapid query building. |
| **Queue**           | Redis + BullMQ                 | Reliable job processing.                     |
| **WhatsApp Engine** | @whiskeysockets/baileys        | Native WebSocket handling.                   |
| **Frontend**        | EJS + HTMX + TailwindCSS       | Zero-build step, server-driven UI.           |
| **Validation**      | TypeBox                        | JSON Schema validation & TS inference.       |

## 📂 Project Structure

```text
src/
├── app.ts                 # App Factory & Autoload configuration
├── server.ts              # Entry point
├── common/                # Shared utilities & Database Schema
├── plugins/               # Global setup (DB, Redis, Env, View)
└── modules/               # Feature-based Modules
    ├── whatsapp/          # WA Engine, Baileys Logic, Workers
    └── dashboard/         # UI Controllers & Views
```

## ⚡ Getting Started

### Prerequisites

- Node.js >= 20
- Docker & Docker Compose
- npm

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/ferriprasetya/wa-baileys-dashboard.git
cd wa-baileys-dashboard
```

2. **Environment Setup**

Copy the example environment file:

```bash
cp .env.example .env
```

Ensure `DATABASE_URL` and `REDIS_HOST` match your local setup.

**Generate Session Key (Critical)**: Run this command to generate a valid 32-byte key file. Do not use shell redirection (>) as it may corrupt the key with newlines.

```bash
node -e "require('fs').writeFileSync('secret-key', require('crypto').randomBytes(32))"
```

3. **Start Infrastructure (DB & Redis)**

Run PostgreSQL and Redis via Docker:

```bash
docker compose up -d postgres redis
```

4. **Install Dependencies**

```bash
npm install
```

5. **Database Migration & Seeding**

Push the schema to the database and seed initial data (Admin user):

```bash
npm run db:generate
npm run db:migrate
npm run db:seed  # (Optional: creates default admin)
```

6. **Run Development Server**

Start the app with hot reload:

```bash
npm run dev
```

Access the dashboard at `http://localhost:3000`.

## 📜 Available Scripts

- `npm run dev` - Start development server with tsx watch
- `npm run build` - Compile TypeScript to `dist/`
- `npm start` - Run production build
- `npm run format` - Format code using Prettier & ESLint
- `npm run db:generate` - Generate SQL migrations from Drizzle schema
- `npm run db:migrate` - Apply migrations to the database
- `npm run db:seed` - Seed initial data (admin user)

## 🐳 Docker Production

### Strategy: Volume Mapping (Recommended)

**Generate the key on your host machine** (Production Server) once:

```bash
node -e "require('fs').writeFileSync('secret-key', require('crypto').randomBytes(32))"
```

To run the full application (App + DB + Redis) in a production simulation:

```bash
docker compose up --build
```

## 📝 License

This project is licensed under the MIT License.
