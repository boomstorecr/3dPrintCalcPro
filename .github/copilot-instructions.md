# 3DPrintCalc Pro — Workspace Instructions

## Project Overview
SaaS platform for 3D printing entrepreneurs to calculate production costs, manage multi-user access per company, and generate professional quotes (PDF/DOCX).

## Tech Stack
- **Frontend:** React.js with Vite (SPA)
- **Styling:** Tailwind CSS
- **Backend/Database:** Firebase (Authentication, Firestore, Cloud Storage)
- **3D Processing:** `3mf-parser` / `stlatl` (client-side only)
- **Document Generation:** `jsPDF` (PDF), `docx` (Word)

## Key Constraints
- All Firestore queries must scope by `company_id` for multi-tenancy
- 3D files are processed in-browser only — never upload raw `.3mf`/`.stl` to storage
- Firebase security rules must enforce company-level data isolation
- The pricing algorithm must include: material cost, electricity, amortization, extras, failure margin, profit margin

## Specifications
Full technical specifications are in `Files/3DPrintCalc Pro.md`.
