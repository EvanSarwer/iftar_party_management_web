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
- JSON file storage for event data and attendees
- Floating WhatsApp contact button

## Tech Stack

- Node.js
- Express.js
- EJS templates
- Tailwind CSS via CDN
- JSON file storage

## Setup

1. Install dependencies:
   - `npm install`
2. Start the app:
   - `npm start`
3. Open the site at:
   - `http://localhost:3000`

## Admin Login

By default, the fixed admin password is:

- `CBA14@2026`

You can change it with environment variables:

- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `PORT`

## Data File

Attendee data is stored in:

- `data/store.json`

You can edit the sample entries there if needed.
