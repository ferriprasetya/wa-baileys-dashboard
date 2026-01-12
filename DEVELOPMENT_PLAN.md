# 🗺️ Module-Driven Implementation Plan: WhatsApp Gateway

## 🏗️ Module 0: Foundation & Shared Kernel

_Focus: Setup database schema global dan konfigurasi environment._

### Scope 0.1: Database Schema (Drizzle)

- [ ] **Define `admins` table:** Username, Password (Argon2 hash).
- [ ] **Define `tenants` table:** `id` (UUID), `name`, `api_key` (token untuk API endpoint), `webhook_url` (optional).
- [ ] **Define `sessions` table:** `session_id` (unique, linked to tenant), `status` (enum: CONNECTING, CONNECTED, DISCONNECTED), `jid` (nomor WA).
- [ ] **Define `auth_credits` table:** Penyimpanan kredensial Baileys (noise key, signed key, pair key) agar persist di DB.
- [ ] **Setup Migration:** Script `db:migrate` untuk inisialisasi tabel di Postgres.

---

## 🔐 Module 1: Authentication Module

_Focus: Proteksi Dashboard hanya untuk Super Admin._

### Scope 1.1: Security Setup

- [ ] **Install Plugins:** `@fastify/secure-session` (cookie management) dan `@fastify/websocket` (persiapan untuk nanti).
- [ ] **Hash Utility:** Helper function untuk hashing password admin.
- [ ] **Seeding:** Script untuk membuat default admin user.

### Scope 1.2: Login Flow

- [ ] **UI Login:** Halaman `.ejs` sederhana (Tailwind) untuk input username/password.
- [ ] **Handler `POST /auth/login`:** Validasi kredensial -> Set Cookie Session.
- [ ] **Handler `POST /auth/logout`:** Destroy session.

### Scope 1.3: Middleware Protection

- [ ] **Hook `onRequest`:** Cek validitas session cookie. Redirect ke `/login` jika belum auth.
- [ ] **Global Decorator:** Inject `request.user` ke context Fastify jika login valid.

---

## 📊 Module 2: Dashboard Module (Tenant Management)

_Focus: CRUD Tenant sebagai entitas logis untuk endpoint API._

### Scope 2.1: Tenant Listing

- [ ] **UI Dashboard:** Sidebar layout + Tabel daftar Tenant.
- [ ] **Data Fetching:** Query ke DB `tenants` join `sessions` untuk menampilkan status terkini.
- [ ] **UI Component:** Badge status (Hijau: Connected, Merah: Disconnected, Kuning: Scanning).

### Scope 2.2: Create/Delete Tenant

- [ ] **Create Logic:** Input nama Tenant -> Generate UUID & API Key otomatis -> Insert DB -> Create placeholder di tabel `sessions`.
- [ ] **Delete Logic:** Hapus Tenant -> Trigger event untuk mematikan socket WA (jika aktif) -> Hapus data di DB.
- [ ] **Refresh Token:** Fitur untuk me-regenerate API Key jika bocor.

---

## 💬 Module 3: WhatsApp Engine Module (The Core)

_Focus: Integrasi Baileys, WebSocket QR, dan Sending API._

### Scope 3.1: Custom Session Store (Database Adapter)

- [ ] **Interface Implementation:** Membuat adapter yang menerjemahkan logic `useMultiFileAuthState` (bawaan Baileys) menjadi SQL Query ke tabel `auth_credits`.
- [ ] **Goal:** Memastikan session tidak hilang saat container Docker restart.

### Scope 3.2: Connection Manager (Service Layer)

- [ ] **Connection Factory:** Fungsi `startSession(tenantId)` yang menginisialisasi socket Baileys.
- [ ] **Event Listeners:**
  - `connection.update`: Update kolom `status` di tabel `sessions`.
  - `creds.update`: Simpan kredensial baru ke DB via Adapter.
- [ ] **Graceful Handling:** Auto-reconnect logic jika koneksi terputus bukan karena logout manual.

### Scope 3.3: WebSocket Integration (QR Streaming)

- [ ] **Endpoint WS:** `ws://host/api/tenants/{tenantId}/ws`.
- [ ] **Flow:**
  1. Client (Dashboard UI) connect ke WS.
  2. Server mentrigger `startSession`.
  3. Server stream event `qr` (base64 image) ke socket client secara real-time.
  4. Server stream event `connection.open` saat berhasil login.

### Scope 3.4: Message Queue (Producer)

- [ ] **API Endpoint:** `POST /api/send`.
  - _Payload:_ `{ tenantId, apiKey, to, message }`.
  - _Validation:_ Cek kecocokan Tenant ID dan API Key.
- [ ] **Queue Logic:** Masukkan payload ke Redis (BullMQ) dengan prioritas standar. Response API instant: `{ status: 'queued', jobId: '...' }`.

### Scope 3.5: Message Worker (Consumer)

- [ ] **Worker Process:** Setup BullMQ Worker terpisah (namun dalam satu repo).
- [ ] **Processing:**
  1. Ambil Job.
  2. Cek apakah Socket untuk tenant tersebut `CONNECTED`.
  3. Jika ya, kirim pesan via Baileys `sendMessage`.
  4. Jika tidak, delay job (backoff strategy).

---

## 🚀 Module 4: Logging & Monitoring (Optional/Final Polish)

- [ ] **Message Logs:** Simpan riwayat pesan keluar (sukses/gagal) ke tabel `message_logs`.
- [ ] **History UI:** Tambahkan tombol "View Logs" di setiap baris Tenant pada dashboard.
