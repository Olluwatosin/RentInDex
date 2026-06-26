# RentInDex

Nigeria's first rent intelligence platform. Helps renters understand fair market prices, calculate true move-in costs, and avoid being overcharged.

Built with Next.js 15, TypeScript, Tailwind CSS, Groq AI, Resend, and Google Sheets.

---

## Features

- **Landing page** — data insights, statistics from real submissions, waitlist signup
- **Data submission form** — 6-step form collecting state, area, property type, rent range, and move-in costs
- **RentBot** — AI chatbot that helps users check if their rent is fair and collects data conversationally
- **Admin export** — CSV export of the waitlist via a protected API route

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in all values in `.env` — see the table below for what each one does.

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `RESEND_API_KEY` | Yes | Resend API key for sending emails |
| `RESEND_AUDIENCE_ID` | Optional | Resend audience ID for waitlist management |
| `GROQ_API_KEY` | Yes | Groq API key for the chatbot LLM |
| `OPENROUTER_API_KEY` | Optional | Fallback LLM provider if Groq is unavailable |
| `GOOGLE_SHEET_ID` | Yes | Spreadsheet ID for storing chatbot-collected rent data |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Yes | Full service account JSON (single-line string) |
| `OWNER_EMAIL` | Yes | Email that receives form submissions and waitlist signups |
| `ADMIN_SECRET` | Yes | Secret token for `/api/admin/waitlist` — generate with `openssl rand -hex 32` |

---

## API Routes

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/submit-data` | POST | None | Save form submission, email owner and submitter |
| `/api/response-count` | GET | None | Count of rows in the Google Sheet (cached 60s) |
| `/api/waitlist` | POST | None | Join the waitlist (saved to Resend Audience) |
| `/api/chat` | POST | None | RentBot chatbot responses via Groq |
| `/api/chatbot/extract-data` | POST | None | Extract rent data from a chatbot conversation to Google Sheets |
| `/api/admin/waitlist` | GET | `?secret=ADMIN_SECRET` | List all waitlist contacts |
| `/api/admin/waitlist/export` | GET | `?secret=ADMIN_SECRET` | Download waitlist as CSV |

---

## Deployment

Deployed on [Vercel](https://vercel.com). The `vercel.json` sets `NEXT_PUBLIC_SITE_URL`. All environment variables must be set in Vercel project settings.

```bash
vercel deploy
```
