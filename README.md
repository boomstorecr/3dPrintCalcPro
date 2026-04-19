# 3DPrintCalc Pro

[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%7C%20Firestore%20%7C%20Storage-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)

SaaS platform for 3D printing entrepreneurs to calculate production costs, manage multi-user access per company, and generate professional quotes.

## Overview

3DPrintCalc Pro is a multi-tenant quoting system designed for 3D printing businesses. It analyzes model files in the browser, computes production pricing with transparent cost breakdowns, and exports branded quotes in PDF and DOCX formats.

## Tech Stack

- Frontend: React 18 + Vite 6 (SPA)
- Styling: Tailwind CSS 4
- Backend/Database: Firebase (Authentication, Firestore, Cloud Storage)
- 3D Processing: JSZip + fast-xml-parser (3MF), custom STL parser, G-code parser (all client-side)
- Document Generation: jsPDF (PDF), docx (Word)
- Testing: Vitest
- Icons: Lucide React

## Key Features

1. Multi-tenant company system with Admin/Worker roles
2. 3D file analysis (.3mf, .stl, .gcode) fully client-side (no raw 3D file uploads)
3. Multi-file upload with plate detection, color extraction, filament usage, and print time from 3MF/G-code metadata
4. Preset printer catalog (25+ printers: Bambu Lab, Prusa, Creality, Anycubic, Voron, Elegoo, and more) with per-printer config
5. Advanced pricing algorithm with material, electricity, amortization, extras, failure margin, and profit margin
6. Professional quote export (PDF & DOCX) with company branding
7. Quote history with filtering, duplication, and status tracking
8. Team management with invite codes
9. Material catalog management (PLA, PETG, TPU, etc.)

## Pricing Formula

```text
Material Cost = Σ(grams × (1 + failureMargin) × (costPerKg / 1000))
Electricity   = (hours × wattage / 1000) × kwhCost
Amortization  = hours × hourlyMachineFee
Final         = (Material + Electricity + Amortization + Extras) × (1 + profitMargin)
```

## Scripts

```bash
npm run dev            # Start dev server
npm run build          # Production build
npm run preview        # Preview production build
npm run test           # Run tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
npm run lint           # ESLint
```

## Getting Started

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy environment template:

   ```bash
   cp .env.example .env
   ```

4. Fill Firebase values in `.env`
5. Start development server:

   ```bash
   npm run dev
   ```

## Environment Variables

Required variables from `.env.example`:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## Project Structure

```text
src/
├── components/     # Reusable UI components + FileImport, CostBreakdown
├── contexts/       # AuthContext, ToastContext
├── hooks/          # useAuth, useToast
├── layouts/        # AuthLayout, DashboardLayout
├── lib/            # Firebase, parsers, pricing engine, CRUD, exporters
└── pages/          # Dashboard, Quotes (new/preview/history), Settings, Auth
```

## Routes

- `/` — Dashboard
- `/quotes/new` — Create/edit quote
- `/quotes/:id` — Preview and export
- `/quotes` — Quote history
- `/settings/profile` — Company profile
- `/settings/electricity` — kWh cost
- `/settings/printers` — Printer management
- `/settings/materials` — Material catalog
- `/settings/team` — Team and invites

## Security & Data Handling

- Multi-tenancy enforced by `company_id` scoping on data access
- Firebase rules are designed for company-level isolation
- Raw `.3mf` / `.stl` files are processed in-browser only and are not uploaded

## Screenshots

> Add product screenshots here (dashboard, quote builder, and quote preview/export screens).

![App Screenshot Placeholder](./Files/screenshot-placeholder.png)

## License

MIT
