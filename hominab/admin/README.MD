Admin Panel README

This document is the definitive onboarding and operations guide for every admin section/page. Unknown items are explicitly marked “Unknown (needs confirmation).”

Dashboard
Purpose: Central operations view to monitor key metrics (entries, contests, draw dates, winners, participation) without editing data.  
Who uses it: Operations admins and analysts monitoring daily health.  
Where to find it: Sidebar → Dashboard (admin/index.html).  
Inputs: None; data auto-loads from Google Sheets via data-fetcher.js, results-fetcher.js, recharge-validator.js.  
Buttons & actions:  
- Refresh: Re-fetch entries/results/recharges, re-run validator, redraw widgets.  
Step-by-step usage:  
1) Open Dashboard. 2) Click Refresh. 3) Review key metrics, participation breakdown, winners by contest, top entrants, and recent entries.  
Data stored/changed: None written; reads Sheets only.  
Rules & constraints: Read-only; values reflect last successful fetch; network to Sheets required.  
Success & error messages: Loading indicator during fetch; error banner on fetch failure.  
Audit/logging: None persisted; console only.  
Security & permissions: Auth required (auth.js). Sharing sessions can expose sensitive stats.  
Examples:  
- After Refresh, Total Entries rises from 1200 to 1240 reflecting new rows in Sheets.  
- After adding contest results to the results sheet, “Winners by Contest” shows updated prize-tier counts.  
Common mistakes & troubleshooting: Blank widgets → fetch failed or no data; check console/network and Refresh. Stale numbers → Refresh.

Entries
Purpose: Browse all ticket entries and inspect metadata.  
Who uses it: Ops/admin staff validating submissions or searching player activity.  
Where to find it: Sidebar → Entries (admin/pages/entries.html).  
Inputs: Filters (Contest, Draw Date, WhatsApp search, Prize filters if present). Exact set should be verified in the UI.  
Buttons & actions: Refresh to reload data; filter controls apply instantly; Export if available.  
Step-by-step usage:  
1) Open Entries. 2) Apply filters. 3) Review rows; export if needed.  
Data stored/changed: None; read-only from entries sheet via data-fetcher.js.  
Rules & constraints: Client-side filtering; relies on valid registrationDateTime parsing.  
Success & error messages: Loading indicator; error banner on fetch failure.  
Audit/logging: None persisted; console only.  
Security & permissions: Auth required; exported data may include WhatsApp—handle securely.  
Examples:  
- Filter by contest 2001 to see its entries.  
- Search a WhatsApp number to list that player’s tickets.  
Common mistakes & troubleshooting: Empty table → check filters or source data; invalid dates can exclude rows.

Results
Purpose: Display contest results (winning numbers) that drive validation.  
Who uses it: Ops/admin entering or verifying outcomes.  
Where to find it: Sidebar → Results (admin/pages/results.html).  
Inputs: Results fetched from Google Sheet (gid=300277644). Any manual input fields on the page are Unknown (needs confirmation).  
Buttons & actions: Refresh to reload results from Sheets; other actions Unknown (needs confirmation).  
Step-by-step usage:  
1) Open Results. 2) Click Refresh. 3) Verify contests, draw dates, and winning numbers.  
Data stored/changed: Reads only; no client writes.  
Rules & constraints: Missing results → winners cannot be derived and Winners page shows “No Results Configured.” Dates normalized to yyyy-mm-dd.  
Success & error messages: Error banner on fetch issues.  
Audit/logging: None persisted; console only.  
Security & permissions: Auth required; incorrect sheet data mislabels winners—control sheet access.  
Examples:  
- Add winning numbers for contest 2025-12-18 in the sheet, then Refresh to see them.  
- Verify contest 1234 lists five winning numbers and the correct draw date.  
Common mistakes & troubleshooting: Wrong date format or missing rows prevents validation; fix source sheet then Refresh.

Winners
Purpose: Validate entries against results, list/export winners, and show a lightweight today-vs-yesterday comparison of unique ticket creators (people, not ticket volume).  
Who uses it: Ops/admin handling payouts and participation checks.  
Where to find it: Sidebar → Winners (admin/pages/winners.html).  
Inputs: Filters — Contest, Draw Date, Prize Level, WhatsApp search.  
Buttons & actions:  
- Refresh / Refresh (Summary): Re-fetch data/results and re-run validation.  
- Reload Winners: Re-validate winners with current filters.  
- Export Winners: Download filtered winners CSV.  
- Clear Filters: Reset all filters.  
Step-by-step usage:  
1) Open Winners. 2) Click Refresh (or Reload Winners) to pull latest data/results and compute winners. 3) Apply filters. 4) Review table/summary. 5) Export if needed. 6) Check “Ticket creators (unique) – Today vs Yesterday” for quick daily comparison.  
Data stored/changed: None written; winners derived client-side from entries (data-fetcher.js) + results (results-fetcher.js) via validator.js. CSV export is client-side only.  
Rules & constraints:  
- Requires contest results; otherwise “No Results Configured.”  
- Winners are highest-match entries per contest/drawDate; ties split prize.  
- Ticket creators chart: unique gameId per registrationDateTime day; window = last 7 days; bars show only today vs yesterday.  
Success & error messages: Error banner on fetch/validation issues; “No Winners Found” when none match filters; “No Results Configured” when results absent.  
Audit/logging: None persisted; console only.  
Security & permissions: Auth required; exports include WhatsApp—handle securely.  
Examples:  
- Example 1: Set Prize Level = 4 → table shows 4-hit winners; Export produces CSV of filtered set.  
- Example 2: Day with 10 ticket creators vs 7 yesterday → chart bars show 10 vs 7; footnote lists last-7-day counts per date.  
Common mistakes & troubleshooting: Empty table → check filters/results presence. Chart shows 0/0 → no entries today/yesterday or unparseable registrationDateTime (supports ISO or yyyy-mm-dd; space-delimited also normalized).

Reports
Purpose: Reporting views (content currently Unknown (needs confirmation)).  
Who uses it: Likely ops/analysts.  
Where to find it: Sidebar → Reports (admin/pages/reports.html).  
Inputs: Unknown (needs confirmation).  
Buttons & actions: Unknown (needs confirmation).  
Step-by-step usage: Unknown (needs confirmation).  
Data stored/changed: Unknown (needs confirmation).  
Rules & constraints: Unknown (needs confirmation).  
Success & error messages: Unknown (needs confirmation).  
Audit/logging: Unknown (needs confirmation).  
Security & permissions: Auth required.  
Examples: Unknown (needs confirmation).  
Common mistakes & troubleshooting: Unknown (needs confirmation)—clarify available filters/actions.

Login
Purpose: Authenticate admins and establish session storage for protected pages.  
Who uses it: Admin staff with credentials stored in the auth sheet.  
Where to find it: admin/login.html (redirect target for unauthenticated access).  
Inputs: Account and password fields (labels to confirm in UI). Values checked against credentials fetched from AUTH_SHEET_CSV_URL in auth.js.  
Buttons & actions: Login/Submit (label to confirm) triggers credential check; on success sets session and redirects.  
Step-by-step usage:  
1) Open login page. 2) Enter account + password. 3) Submit. 4) On success, session (12h TTL) is saved; redirected to dashboard.  
Data stored/changed: Session payload in sessionStorage (key ps_admin_session) with { account, expiresAt }.  
Rules & constraints: TTL 12h; expired sessions redirect to login; failed auth blocks navigation.  
Success & error messages: Auth failure message (exact text to confirm); redirect on success.  
Audit/logging: None persisted; console only.  
Security & permissions: Protect credentials sheet; sessionStorage is per-tab; always logout on shared devices.  
Examples:  
- Valid credentials → redirect to dashboard; session set.  
- Invalid password → error shown; stay on login.  
Common mistakes & troubleshooting: Stuck redirect → clear sessionStorage; ensure auth sheet reachable; verify credentials and network.

Admin Panel Overview
All sections require authentication enforced by auth.js. Data is fetched from Google Sheets CSVs into fetchers and validator, then rendered client-side. No admin page writes back; exports are client-side only.

Data flow (text diagram):  
User action (Login/Refresh) -> auth.js session check -> data-fetcher.js (entries CSV) + results-fetcher.js (results CSV) + recharge-validator.js (recharge CSV) -> validator.js computes winners -> pages render (Dashboard metrics, Entries list, Results view, Winners table/summary/ticket-creator chart, Reports TBD) -> optional CSV export to user.