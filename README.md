# ACES 5G RAN Fault Injection & Performance Analyzer

A **frontend-only**, interactive, three-cell 5G RAN fault visualization demo. No backend, SDR, or srsRAN installation required.

## Features
- Three gNBs with distinct PCIs and ten selectable UEs
- Network topology and conceptual radio-coverage display
- Fault scenarios: interference, gNB power reduction, congestion, outage
- Fault severity and target gNB selection
- Per-UE RSRP, SINR, CQI, MCS, BLER, throughput and PRB utilization
- KPI time-series charts, cell summaries, event log, scenario comparison
- Pause/start, reset, and CSV KPI export

**Important:** This is a simplified illustrative radio model, not an accurate system-level 3GPP simulator. It does not use live srsRAN or Open5GS metrics. The geometry is conceptual; interference, PRB load and throughput use simplified assumptions. Do not use outputs for network planning or performance guarantees.

## Local development
Install Node.js 20.19+ or 22.12+ (compatible with Vite 6), then:

```bash
npm install
npm run dev
```

Open the localhost URL shown in the terminal.

## Deploy to Vercel (GitHub)
1. Create a GitHub repository and upload **the contents of this folder** (package.json at repository root).
2. Log in at https://vercel.com and select **Add New → Project**.
3. Import the GitHub repository. Framework should detect **Vite**.
4. Confirm build command `npm run build` and output directory `dist`.
5. Select **Deploy**. Vercel will provide a public HTTPS URL.
6. To remove the temporary demo later, delete the project in Vercel project settings (or disable its deployment as appropriate).

## Deploy to Vercel (CLI)
```bash
npm install
npm run build
npx vercel
npx vercel --prod
```

Follow the Vercel authentication and project prompts. You must have a Vercel account and permission to deploy.

## Technology
React 18, Vite 6, Recharts, Lucide React. Entirely client-side; no environment variables, database, or secrets.
