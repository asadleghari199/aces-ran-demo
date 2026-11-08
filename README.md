# RAN PULSE — 9 Small Cells / 3 Logical Cells

## Confirmed architecture

- Nine physical small-cell radio heads; three synchronized heads per EU.
- Three logical cells, one PCI and one PRB pool per EU: PCI 10, 20, 30 (illustrative IDs).
- All nine heads transmit on the same carrier; frequency reuse 1.
- One shared 5G Core, one Fronthaul Gateway, three AUs, three EUs.
- Main view: nine radio heads, UEs and group-colored coverage.
- Transport Topology tab: core, gateway, AU, EU, radio heads and editable illustrative link/transport KPIs.

## Simulation assumptions

- Within each logical cell, received power from the three heads is combined **non-coherently in linear mW**. This is a simplified approximation, not phase-aware distributed transmission.
- UE association uses the strongest *combined logical-cell received power*. The displayed serving small cell is the strongest individual head in the selected logical cell.
- Other logical cells contribute co-channel interference; default effective activity factor is 0.08. Interference fault increases activity for a target EU group.
- One shared PRB pool per EU (273 PRBs default). UE demand is allocated within that pool; aggregate allocated PRBs never exceed the pool. Congestion targets the selected EU group.
- Small-cell outage and power backoff affect a selected physical head only.
- RF distribution attenuation defaults to **zero** because digital eCPRI transport does not inherently subtract dB from RF RSRP. Optional RF attenuation inputs are only illustrative equivalent analog losses.
- Transport latency and packet loss are separate metrics; throughput is a simplified estimate rather than a 3GPP PHY/MAC scheduler output.
- No protocol-level eCPRI/5GC, HARQ, synchronized coherent combining, real packet forwarding or RRC handover is implemented.

## Deploy

Replace `src/main.jsx` and `src/style.css` in the existing GitHub repo. Keep `public/ACES-logo.png` and `public/small-cell.png.PNG` unchanged.

Run `npm install` then `npm run build` to validate locally. A full Vite production build could not be executed in the generation environment because npm dependencies were not available; JSX syntax was independently parsed using TypeScript.
