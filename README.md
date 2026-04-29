# White-Label Booking System

A production-ready, fully white-label booking platform modelled on Fresha's UX. Sell to salons, barbershops, gyms, clinics, spas, coaches — any appointment-based business. All branding is driven by a single config file; zero hardcoded colours, fonts, or copy in components.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS v4 + CSS custom properties |
| Routing | React Router v7 |
| State | Zustand |
| Dates | date-fns |
| Backend | Supabase (Postgres + Auth + Realtime) |

---

## Quick Start

### 1. Clone & install

```bash
git clone <repo>
cd white-label-booking
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. In the **SQL Editor**, run the three migration files in order:
   - `supabase/migrations/001_schema.sql` — tables
   - `supabase/migrations/002_rls.sql` — Row Level Security policies
   - `supabase/migrations/003_seed.sql` — demo data (optional)

### 3. Set environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_BUSINESS_ID=00000000-0000-0000-0000-000000000001
```

> `VITE_BUSINESS_ID` is the UUID from the `businesses` table. The seed file uses `00000000-0000-0000-0000-000000000001`.

### 4. Run

```bash
npm run dev
```

- Booking flow: `http://localhost:5173/`
- Admin panel: `http://localhost:5173/admin`

---

## Deploying to a New Client

Everything needed to white-label the app for a new business is in **one file**:

### `src/config/brand.ts`

```ts
const brand: BrandConfig = {
  brandName: 'Luxe Studios',       // shown in header, title, footer
  logo: '/logo.svg',               // place file in /public
  primaryColour: '#7C3AED',        // all CTAs, selected states, active nav
  secondaryColour: '#F59E0B',      // accent badges, secondary actions
  backgroundColour: '#FAFAFA',     // page background
  textColour: '#111827',           // body text
  fontFamily: "'Inter', system-ui, sans-serif",  // Google Font or system stack
  borderRadius: 'lg',              // 'none' | 'sm' | 'md' | 'lg' | 'full'
  currency: 'GBP',                 // ISO 4217 currency code
  locale: 'en-GB',                 // BCP 47 locale for number/date formatting
  businessEmail: 'hello@luxestudios.com',
  socialLinks: {
    instagram: 'https://instagram.com/luxestudios',
    facebook: 'https://facebook.com/luxestudios',
    tiktok: 'https://tiktok.com/@luxestudios',
  },
}
```

On app mount, `applyBrandTheme()` injects all values as CSS custom properties on `:root`. Every component reads from those variables — never hardcoded Tailwind colour classes.

---

## Project Structure

```
src/
├── config/
│   └── brand.ts              ← Single source of truth for branding
├── lib/
│   ├── supabase.ts           ← Supabase client
│   ├── theme.ts              ← CSS variable injection
│   ├── slots.ts              ← Time slot generation + ICS builder
│   ├── currency.ts           ← Locale-aware price + duration formatting
│   └── cn.ts                 ← clsx + tailwind-merge helper
├── types/
│   └── index.ts              ← All shared TypeScript types
├── store/
│   ├── bookingStore.ts       ← Zustand: booking flow draft state
│   └── authStore.ts          ← Zustand: auth session + admin flag
├── hooks/
│   └── useAuth.ts            ← Supabase auth listener
├── components/
│   ├── ui/                   ← Button, Card, Badge, Input, Modal, Spinner, Avatar
│   └── layout/               ← BookingLayout, AdminLayout, ProtectedRoute
└── pages/
    ├── booking/              ← ServiceSelection, StaffSelection, DateTimePicker,
    │                            CustomerDetails, Confirmation, MyBookings
    └── admin/                ← Login, Dashboard, Calendar, Bookings,
                                 Services, Staff, Settings
supabase/
└── migrations/
    ├── 001_schema.sql        ← All tables with constraints + indexes
    ├── 002_rls.sql           ← Row Level Security for all tables
    └── 003_seed.sql          ← Demo business, staff, services, availability
```

---

## Feature Overview

### Public Booking Flow (`/`)

| Step | Route | What it does |
|---|---|---|
| 1 | `/` | Service grid with category tabs + search |
| 2 | `/staff` | Staff cards with "No Preference" default |
| 3 | `/datetime` | Monthly calendar + 15-min time slots (gaps around existing bookings + blocked times) |
| 4 | `/details` | Customer info form with optional Supabase magic-link login |
| 5 | `/confirm` | Summary review → Supabase insert → success screen + .ics download |
| — | `/my-bookings` | Authenticated customer's upcoming/past bookings with cancel (>24h policy) |

### Admin Panel (`/admin`)

| Page | What it does |
|---|---|
| Dashboard | Today's schedule + week stats (bookings, revenue, cancellations) |
| Calendar | Fresha-style week view — staff columns, colour-coded by service category |
| Bookings | Paginated table with status filters, detail modal, status updates, CSV export |
| Services | Full CRUD — name, description, duration, price (stored in pence), category, active toggle |
| Team | Full CRUD — name, role, avatar, bio, per-day working hours editor |
| Settings | Live brand config editor with colour pickers, font, radius, social links, live preview |

---

## Database Schema

```
businesses    — id, name, config (jsonb), created_at
staff         — id, business_id, user_id (auth), name, role, avatar_url, bio
services      — id, business_id, name, description, duration_minutes, price, category, is_active
customers     — id, business_id, user_id (auth), name, email, phone
availability  — id, staff_id, day_of_week (0–6), start_time, end_time
blocked_times — id, staff_id, starts_at, ends_at, reason
bookings      — id, business_id, customer_id, staff_id, service_id, starts_at, ends_at,
                status (pending|confirmed|cancelled|completed), notes
```

Prices are stored as **integers in the smallest currency unit** (pence/cents). `formatCurrency()` in `lib/currency.ts` handles display.

---

## Adding a Real Admin User

After running the migrations, create a user in Supabase Auth (Dashboard → Authentication → Users), then run:

```sql
UPDATE staff
SET user_id = '<paste-auth-user-uuid>'
WHERE name = 'Alex Morgan';
```

That user can now sign in at `/admin/login`.

---

## Multi-Tenant Deployment

Each client gets their own:
- Supabase project (or a shared project with isolated `business_id` rows)
- `VITE_BUSINESS_ID` pointing to their row in `businesses`
- Deployed instance with their own `brand.ts` and logo

RLS ensures data isolation even on a shared Supabase project.

---

## Building for Production

```bash
npm run build
# Output in /dist — deploy to Vercel, Netlify, or any static host
```

For Vercel, add a `vercel.json` to handle SPA routing:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```
