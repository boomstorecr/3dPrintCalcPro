# Technical Specifications: 3D Printing Quote Engine (3DPrintCalc Pro)

## 1. Executive Summary
Develop a SaaS platform for 3D printing entrepreneurs to calculate precise production costs, manage multi-user access per company, and generate professional quotes (PDF/DOCX). The app focuses on financial sustainability by factoring in machine depreciation, failure rates, and real-time energy consumption.

## 2. Recommended Tech Stack
* **Frontend:** React.js with Vite or Next.js (SPA Architecture).
* **Styling:** Tailwind CSS for a modern, responsive UI.
* **Backend/Database:** Firebase (Authentication, Firestore for data, Cloud Storage for assets).
* **3D Processing:** `3mf-parser` or `stlatl` for client-side metadata extraction.
* **Document Generation:** `jsPDF` (PDF) and `docx` library (Word).

## 3. Database Schema (Firebase Firestore)
* **`Companies` Collection:** - `id`, `name`, `logo_url`.
    - `global_config`: { `currency`, `kwh_cost`, `printer_wattage`, `hourly_amortization_fee`, `base_profit_margin`, `failure_margin` }.
* **`Users` Collection:** `id`, `display_name`, `role` (Admin/Worker), `company_id`.
* **`Materials` Collection:** `id`, `company_id`, `name`, `type` (PLA, PETG, etc.), `cost_per_kg`.
* **`Quotes` Collection:** `id`, `company_id`, `user_id`, `client_name`, `date`, `design_url`, `photo_url`, `cost_breakdown`, `total_price`, `status`.

## 4. Feature Modules & Business Logic

### Phase 1: Authentication & Multi-tenancy
* Implement Firebase Auth. 
* **Access Control:** Workers can only view/create data associated with their `company_id`.

### Phase 2: Advanced Control Panel (Settings)
* **Company Profile:** Logo upload and currency selection.
* **Energy Config:** Inputs for cost per kWh and average printer power consumption (W).
* **Machine Amortization:** "Hourly machine fee" to cover maintenance and wear/tear.
* **Risk Management:** Global % for Profit Margin and % for Print Failure (Safety Margin).
* **Material Inventory:** CRUD for filaments with specific pricing per spool.

### Phase 3: Project Analysis (Slicer-Lite)
* **File Import:** Support for `.3mf` and `.stl` files.
* **Storage Optimization:** Do NOT upload raw 3D files. Process locally in the browser to extract: total weight (grams), estimated time (hours), and number of plates/parts.
* **Multi-material Support:** Allow assigning multiple filament types to a single quote (e.g., PLA for the part + PVA for supports).

### Phase 4: The Pricing Algorithm
The system must calculate:
1.  **Material Cost:** $\sum (\text{grams}_{n} \times (1 + \text{\%failure}) \times (\text{price\_per\_kg}_{n} / 1000))$
2.  **Electricity Cost:** $(\text{hours} \times \text{wattage} / 1000) \times \text{kwh\_cost}$.
3.  **Amortization Cost:** $\text{hours} \times \text{hourly\_machine\_fee}$.
4.  **Extra Costs:** Dynamic list for additional items (magnets, screws, post-processing, shipping).
5.  **Final Quote Price:** $(\text{Sum of all costs}) \times (1 + \text{\%profit\_margin})$.

### Phase 5: Professional Quote Generator (Template)
* Export to `.pdf` or `.docx` containing:
    - Company Header (Logo + Info).
    - Detailed Table: Parts, materials used, additional services, and total print time.
    - Product Photo and Design URL.
    - **Payment Terms:** "A 50% upfront deposit is required to start the order."
    - Timestamp and expiration date.

### Phase 6: History & Versioning
* Dashboard for historical quotes.
* "Duplicate & Edit" functionality for quick revisions based on client feedback.

## 5. Prompts for Copilot Implementation
1.  "Create a React component using `3mf-parser` to read a local file and return the volume and estimated time