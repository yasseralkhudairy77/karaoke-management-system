# Local-First Hybrid Architecture Guide

## Overview
This document describes the Phase 2 implementation of the local-first backend server for **Happy Song Karaoke Management System**.

## Key Components
1. **Server Directory (`server/`):**
   - Built with Node.js & Express.js.
   - Listens on `http://localhost:3000`.
   - Supports legacy Apps Script routing (`GET /exec` & `POST /exec`) for zero-change frontend compatibility.
   - Standard REST routes (`/api/rooms`, `/api/transactions`, `/api/inventory`, etc.).

2. **PostgreSQL Database (`happy_song_pos`):**
   - DDL schema in `server/src/db/schema.sql`.
   - Includes 37 relational tables covering all 36 legacy Google Sheet tabs plus `sync_outbox`.
   - 10:00 AM WIB operational cutoff date logic (`server/src/utils/operationalDate.js`).

3. **Background Outbox Synchronization (`sync_outbox`):**
   - Transactions, closing snapshots, and stock movements are queued in `sync_outbox` with status `pending`.
   - Outbox worker pushes records asynchronously to Railway Cloud PostgreSQL when online.
   - When offline, cashier operates 100% locally with zero latency or network errors.

4. **Scripts:**
   - `npm run db:init` - Initializes PostgreSQL local database and executes DDL.
   - `npm run db:migrate` - Imports baseline CSV data into local PostgreSQL.
   - `npm run db:validate` - Audits record counts and revenue integrity.

5. **Front-End Switch:**
   - Change `API_BASE_URL` in `js/config.js` to `"http://localhost:3000/exec"`.
