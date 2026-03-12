# CBA14 Iftar Gathering 2026

A simple event website for the CBA14 iftar get-together.

## Features

- Beautiful landing page with event details
- Searchable attendee list
- Public form to add a name with `pending` status
- Contact page with payment and venue information
- Admin login with fixed password
- Admin dashboard to confirm pending attendees
- Today's confirmation card on the admin page
- MySQL storage for event data and attendees
- Floating WhatsApp contact button

## Tech Stack

- Node.js
- Express.js
- EJS templates
- Tailwind CSS via CDN
- MySQL

## Setup

1. Install dependencies:
   - `npm install`
2. Configure environment:
   - copy `.env.example` to `.env`
   - update `ADMIN_PASSWORD`, `SESSION_SECRET`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
3. Run database migrations:
   - `npm run migrate`
4. Start the app:
   - `npm start`
5. Open the site at:
   - `http://localhost:3000`

## MySQL Configuration

The app requires these variables:

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

Migration files:

- `database/migrations/001_create_core_tables.sql`
- `database/migrations/002_seed_event_settings.sql`

## Server Migration Process

1. Make sure the database exists in MySQL.
2. Set the MySQL variables in the server environment file.
3. Pull the latest code.
4. Run `npm install --omit=dev`.
5. Run `npm run migrate`.
6. Restart the app service.

Migrations are tracked in the `schema_migrations` table. Already-applied migrations are skipped automatically. If you need a schema change later, add a new SQL file in `database/migrations` instead of editing an old one.

## Admin Login

By default, the fixed admin password is:

- `CBA14@2026`

You can change it with environment variables:

- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `PORT`
