# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are hospital staff at Roxas Memorial Provincial Hospital (RMPH) working across time-sensitive discharge and verification stations:

- **Wards & Emergency Room (ER) Nurses / Clerks:** Look up patients from iHOMIS by encounter or hospital number, initiate clearance routing, track department sign-offs in real time, and print completed F07 clearance forms.
- **Cost Center Staff** (CSR, Radiology, Laboratory, Pharmacy, Cardiopulmonary, Operating Room, Labor & Delivery Room, Hemodialysis/HDU, Credit & Collection): Clear pending patients assigned to their unit's originating wards and, for Credit & Collection, manage promissory notes, grantors, and credit reports.
- **Billing & Claims Staff:** Monitor active routing queues, receive cleared patients ready for billing, review cost-center turnaround, and archive completed clearances.
- **Supervisors & ICT / Admin:** Monitor hospital-wide clearance status and turnaround analytics, manage staff accounts and department configurations, and intervene on stalled, edited, or cancelled transactions.
- **Patients & Families (ER Waiting Area):** Passive viewers of the public `/tv-queue` display showing ER patients cleared and ready for billing.

## Product Purpose

RMPH Clearance digitizes and coordinates the multi-department hospital discharge clearance workflow—replacing manual paper chasing with synchronized routing, live sign-off visibility, and automated F07 form generation—so patients move from clinical clearance to Billing & Claims quickly and accurately.

Success means faster patient discharge turnaround, unmistakable department sign-off status at every handoff, and zero missed or ambiguous clearances across wards and cost centers.

## Positioning

Unlike generic ticketing or standalone hospital forms, RMPH Clearance connects directly to RMPH's iHOMIS patient encounter records (`henctr` and `hperson`), automatically routes clearances to only the relevant cost centers based on originating ward/unit rules (including OR, LR/DR, HDU/Dialysis, and admitted-only Credit & Collection checks), and outputs the hospital's official F07 clearance document with real-time SLA and TV queue coordination.

## Operating Context

- **Environment:** Internal hospital operations running on a local Laragon/web server environment across ward stations, ancillary cost centers, billing counters, administrative workstations, and an ER waiting-area TV display.
- **Key Workflows & Artifacts:**
  - iHOMIS encounter lookup (`enccode` / `hpercode` search) and clearance transaction initiation.
  - Real-time queue synchronization via Laravel Reverb / WebSockets (`clearance-updates`) with polling fallback and audio alerts (`public/sounds/`).
  - Ward-specific cost center routing rules (base ancillary units plus conditional OR, LR/DR, HDU/Dialysis, and admitted-only Credit & Collection).
  - Promissory note, grantor, and No Balance Billing (NBB) tracking in Credit & Collection.
  - Printable **F07** clearance form (`Clearance/PrintF07`) recording department signatories and timestamps (`Asia/Manila`).
  - Public **ER Billing Queue** TV screen (`/tv-queue`) displaying cleared Emergency Room patients ready for billing.

## Capabilities and Constraints

- **iHOMIS Integration Constraint:** Patient and encounter lookups read from the external `ihomis` database connection (`henctr`, `hperson`) in a read-only capacity; future work must preserve iHOMIS read-only lookups and existing clearance routing rules.
- **Apache / URL Safety:** Encounter codes (`enccode`) contain slashes; safe query-parameter endpoints (such as `/clearance-data/fetch?enccode=...` and `/print-clearance/document?enccode=...`) exist to avoid Apache slash-blocking and must be preserved.
- **Data Privacy on Public Displays:** The public `/tv-queue` ER display formats names in masked form (e.g., `Dela Cruz - J.`) and is restricted strictly to `Emergency Room` cleared transactions.
- **Workflow States:** Clearances transition through `Routing in Progress`, `Cleared`, `Cancelled`, and `Archived`.
- **Undecided / Open:** Specific Filipino/Hiligaynon phrasing for patient-facing TV/public guidance has not yet been authored or approved.

## Brand Commitments

- **Product & Institution Name:** `RMPH Clearance` — Integrated Patient Discharge & Verification Portal for **Roxas Memorial Provincial Hospital (RMPH)**, Province of Capiz.
- **Official Seals / Logos:** Province of Capiz seal (`public/images/capiz.jpg`) and RMPH logo (`public/images/rmph.jpg` / `public/images/rmph.jfif`).

## Evidence on Hand

- **Existing Web Application:** Laravel 12 + Inertia.js v2 + React 18 codebase in `c:\laragon\www\er-clearance-react` with routes in `routes/web.php` and role-specific Inertia views under `resources/js/Pages/`.
- **Assets:**
  - Logos: `public/images/capiz.jpg`, `public/images/rmph.jpg`, `public/images/rmph.jfif`
  - Audio alerts: `public/sounds/check.mp3`, `public/sounds/epic_26.mp3`, `public/sounds/notif.wav`
- **No fabricated claims:** No external patient testimonials, clinical outcome statistics, or external marketing copy exist in the repository; future work must not invent any.

## Product Principles

1. **Speed to Clear:** Prioritize fast queue scanning, one-step search/routing, and rapid discharge turnaround from ward request to billing readiness.
2. **Unambiguous Sign-Off State:** Every role must see immediately which departments have cleared, which are pending, and what action is required next.
3. **Preserve Routing & iHOMIS Integrity:** Honor established iHOMIS read-only lookups, ward-to-cost-center routing filters, and F07 signatory rules as source-of-truth domain logic.
4. **Respect Patient Privacy in Public Spaces:** Keep sensitive identifiers off public-facing screens while keeping patient-facing guidance clear and understandable.
5. **Reliable Real-Time Handoffs:** Keep stations synchronized across shifts with live updates, clear timestamps (`Asia/Manila`), and dependable fallback behavior.

## Accessibility & Inclusion

- **Language:** English across internal clinical, billing, and administrative interfaces, with **English plus Filipino/Hiligaynon** patient-facing guidance on public/TV screens (such as `/tv-queue`) so patients and families in Capiz can easily follow discharge billing instructions.
- **Legibility:** Clear status differentiation and readable display formatting for shared clinical workstations and distant ER waiting-area TV viewing.
