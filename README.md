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

### Development

- `npm run dev` - Start development server with tsx watch
- `npm run build` - Compile TypeScript to `dist/`
- `npm start` - Run production build
- `npm run format` - Format code using Prettier & ESLint

### Database

- `npm run db:generate` - Generate SQL migrations from Drizzle schema
- `npm run db:migrate` - Apply migrations to the database
- `npm run db:seed` - Seed initial data (admin user)

### Docker

- `npm run docker:dev` - Start development environment with Docker Compose
- `npm run docker:dev:down` - Stop development environment
- `npm run docker:dev:logs` - View logs from development container
- `npm run docker:prod` - Start production environment with Docker Compose
- `npm run docker:prod:down` - Stop production environment
- `npm run docker:prod:logs` - View logs from production container
- `npm run docker:prod:seed` - Run seeder in production container

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

### Database Migrations & Seeding

After starting the production environment, run migrations and seed the database:

```bash
# Apply database migrations
npm run docker:prod:migrate

# Seed initial data (creates default admin user)
npm run docker:prod:seed
```

Or manually inside the running container:

```bash
docker compose exec app npm run db:migrate
docker compose exec app npm run db:seed
```

## � Integration Guide

This section explains how to integrate the WhatsApp Gateway with external services (e.g., Nuxt applications, microservices, etc.).

### REST API: Send Message

Send messages to WhatsApp via HTTP POST request.

**Endpoint:** `POST /public/api/send`

**Getting Credentials:**

1. Log in to the dashboard at `http://localhost:3000`
2. Navigate to the **Tenant List** section
3. Click the **"View Credentials"** button on the desired tenant
4. Copy the `Tenant ID` and `API Key` from the modal dialog

**Request Body:**

```json
{
  "tenantId": "YOUR_TENANT_ID_HERE",
  "apiKey": "YOUR_API_KEY_HERE",
  "to": "628123456789",
  "message": "Your message here with optional formatting"
}
```

**Request Body Parameters:**

| Parameter  | Type   | Description                                       |
| :--------- | :----- | :------------------------------------------------ |
| `tenantId` | string | Unique identifier for the WhatsApp tenant/session |
| `apiKey`   | string | API key for authenticating the request            |
| `to`       | string | Recipient phone number (format: 628xxx...)        |
| `message`  | string | Message content (supports formatting)             |

**Request Headers:**

```
Content-Type: application/json
```

**Response (200 OK):**

```json
{
  "status": "queued",
  "jobId": "12345",
  "queuePosition": 5
}
```

**Response (404 Not Found):**

```json
{
  "error": "Tenant not found"
}
```

**Response (401 Unauthorized):**

```json
{
  "error": "Invalid API Key"
}
```

**Message Formatting Support:**

WhatsApp supports the following text formatting:

- `*text*` → **bold**
- `_text_` → _italic_
- `~text~` → ~~strikethrough~~
- `` `text` `` → `monospace`
- `\n` → newline

**Example Request with Formatting:**

```json
{
  "tenantId": "YOUR_TENANT_ID_HERE",
  "apiKey": "YOUR_API_KEY_HERE",
  "to": "628123456789",
  "message": "*Notifikasi Penting*\n\nAnda memiliki tugas baru:\n_Submission Deadline: 2024-01-31_\n\nSilakan login untuk informasi lebih lanjut."
}
```

### WebSocket: Real-time Session Connection

Connect to WhatsApp sessions in real-time using WebSocket to receive QR codes and connection status updates.

**Endpoint:** `WS /public/tenants/:tenantId/ws?apiKey=YOUR_API_KEY`

**Connection Example (JavaScript):**

```javascript
const tenantId = '01baba0d-a4cf-4cff-a5b4-5f5450699579'
const apiKey = '7e60eeffcdc7d96ed9c1fc3a57e80753942696139dc45b91af1251d07b47c367'

const ws = new WebSocket(`ws://localhost:3000/public/tenants/${tenantId}/ws?apiKey=${apiKey}`)

ws.onopen = () => {
  console.log('Connected to WhatsApp session')
}

ws.onmessage = (event) => {
  const message = JSON.parse(event.data)

  switch (message.type) {
    case 'qr':
      // Display QR code for scanning
      console.log('QR Code:', message.data)
      displayQRCode(message.data)
      break

    case 'ready':
      // Session is connected
      console.log('WhatsApp connected as:', message.jid)
      updateStatus('connected', message.jid)
      break

    case 'close':
      // Session disconnected
      console.log('WhatsApp session closed')
      updateStatus('disconnected')
      break
  }
}

ws.onerror = (error) => {
  console.error('WebSocket error:', error)
}

ws.onclose = () => {
  console.log('Connection closed')
}
```

**Connection Example (TypeScript):**

```typescript
class WhatsAppSessionClient {
  private socket: WebSocket | null = null
  private tenantId: string
  private apiKey: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 3000

  constructor(tenantId: string, apiKey: string) {
    this.tenantId = tenantId
    this.apiKey = apiKey
  }

  connect(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.warn('Already connected')
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/public/tenants/${this.tenantId}/ws?apiKey=${this.apiKey}`

    this.socket = new WebSocket(wsUrl)

    this.socket.onopen = () => {
      console.log('Connected to WhatsApp session')
      this.reconnectAttempts = 0 // Reset on successful connection
      this.onConnect?.()
    }

    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data)

      switch (message.type) {
        case 'qr':
          console.log('QR Code received')
          this.onQRCode?.(message.data)
          break

        case 'ready':
          console.log('WhatsApp session connected:', message.jid)
          this.onReady?.(message.jid)
          break

        case 'close':
          console.log('WhatsApp session closed')
          this.onClose?.()
          break
      }
    }

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error)
      this.onError?.(error)
    }

    this.socket.onclose = () => {
      console.log('WebSocket closed')
      this.attemptReconnect()
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
      setTimeout(() => this.connect(), this.reconnectDelay)
    } else {
      console.error('Max reconnection attempts reached')
      this.onMaxReconnectReached?.()
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
  }

  // Event handlers (override these in your code)
  onConnect?: () => void
  onQRCode?: (qrImage: string) => void
  onReady?: (jid: string) => void
  onClose?: () => void
  onError?: (error: Event) => void
  onMaxReconnectReached?: () => void
}

// Usage example
const client = new WhatsAppSessionClient(
  '01baba0d-a4cf-4cff-a5b4-5f5450699579',
  '7e60eeffcdc7d96ed9c1fc3a57e80753942696139dc45b91af1251d07b47c367'
)

client.onConnect = () => {
  console.log('Ready to receive events')
}

client.onQRCode = (qrImage: string) => {
  // Display QR code to user
  const img = document.getElementById('qr-code') as HTMLImageElement
  if (img) {
    img.src = qrImage
    img.style.display = 'block'
  }
}

client.onReady = (jid: string) => {
  console.log('Session connected as:', jid)
  // Hide QR code and show success
  const img = document.getElementById('qr-code') as HTMLImageElement
  if (img) img.style.display = 'none'
}

client.onClose = () => {
  console.log('Session disconnected')
}

client.onError = (error: Event) => {
  console.error('Connection error:', error)
}

// Connect to session
client.connect()

// Disconnect when needed
// client.disconnect()
```

**WebSocket Message Types:**

| Type    | Description          | Payload                                        |
| :------ | :------------------- | :--------------------------------------------- |
| `qr`    | QR code generated    | `{ type: 'qr', data: '...' }` (base64 image)   |
| `ready` | Session connected    | `{ type: 'ready', jid: '...' }` (WhatsApp JID) |
| `close` | Session disconnected | `{ type: 'close' }`                            |

**Connection States:**

- **Awaiting QR Scan:** Client receives `qr` message with QR code image. User scans with WhatsApp to authenticate.
- **Connected:** After successful scan, client receives `ready` message with WhatsApp JID (phone number).
- **Auto-reconnect on Disconnect:** If connection is interrupted, client can manually reconnect by re-establishing WebSocket.

## 📝 License

This project is licensed under the MIT License.
