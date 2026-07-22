# AGENT_BRIEF — Sandėlio WMS

**Skaityk šį failą pirmiausia**, prieš bet kokį darbą šiame projekte.  
Versija atnaujinta: 2026-07-21.

Papildomas verslo kontekstas (Antano procesai, lipdukų pavyzdžiai): [`CONTEXT.md`](CONTEXT.md).

---

## 1. Kas tai ir kam

**Sandėlio WMS** — vidinė sandėlio valdymo sistema **UAB ExpoDesign** sandeliui.

- Dvi prekių kryptys: **EXPO** (ExpoDesign, įėjimo kairė) ir **DILED** (įėjimo dešinė)
- Vienas savininkas naudoja per **kompiuterį ir telefoną**
- UI kalba: **lietuvių** — be IT žargono (ne „unit“, ne „placement“, ne „DI“ vartotojui)
- Tikslas: žinoti kur kas stovi, registruoti atvykimus, spausdinti lipdukus, rasti prekes, atsiimti

**Ne MVP (nedaryti be aiškaus prašymo):** multi-user roles, DILED/Distyle API, TSC tiesioginė integracija, Viber botas, fotogrametrinis twin.

---

## 2. Platforma ir stack

| Sluoksnis | Technologija |
|-----------|--------------|
| Framework | **Next.js 16** (App Router) — žr. `node_modules/next/dist/docs/` (breaking changes nuo senų versijų) |
| UI | React 19, **Tailwind CSS 4**, `src/app/globals.css` |
| 3D sandėlis | **React Three Fiber** + drei + three — `src/components/Warehouse3D.tsx` |
| AI parsinimas | **Google Gemini** (`gemini-2.0-flash`) — PDF/screenshot → JSON |
| DB (planuota) | **Supabase** — schema paruošta, bet **demo režime nenaudojama** |
| Hosting (planuota) | **Vercel** |
| Lipdukai | CSV + HTML → **BarTender** (ne tiesioginė spausintuvo integracija) |
| Demo duomenys | **`localStorage`** raktas `sandelio-wms-v1` — `src/lib/demo-store.ts` |

### Paleidimas

```bash
npm install
npm run dev
# http://localhost:3000
```

### Env (`.env.local`)

```env
GEMINI_API_KEY=...              # PDF/screenshot parsinimas (be jo — ribotas demo parseris)
NEXT_PUBLIC_SUPABASE_URL=...    # vėliau produkcijai
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_APP_URL=http://localhost:3000   # QR nuorodoms
```

---

## 3. Maršrutai (puslapiai)

| Kelias | Failas | Paskirtis |
|--------|--------|-----------|
| `/` | `src/app/page.tsx` | **Pradžia** — suvestinė (atvykimai, atsiėmimai, užimtumas) |
| `/map` | `src/app/map/page.tsx` | **Sandėlis 3D** — pagrindinis žemėlapis, žymėjimas, teleportas |
| `/search` | `src/app/search/page.tsx` | **Paieška** — viso inventoriaus filtrai + „Rodyti sandėlyje“ |
| `/orders` | `src/app/orders/page.tsx` | Užsakymų sąrašas |
| `/orders/[id]` | `src/app/orders/[id]/page.tsx` | Užsakymo detalė, lipdukai, vieta |
| `/receive/[shipmentId]` | `src/app/receive/...` | Atvykimo priėmimas |
| `/pick/[orderId]` | `src/app/pick/...` | Atsiėmimas / važtaraštis |
| `/archive` | `src/app/archive/page.tsx` | Archyvuoti užsakymai |
| `/vizualizacija` | `src/app/vizualizacija/page.tsx` | 2D planas (SVG/PNG) |
| `/u/[token]` | `src/app/u/[token]/page.tsx` | QR lipduko puslapis |
| `/map?new=1` | — | Atidaro modalą „Naujas atvykimas“ |
| `/map?rack=N&unit=ID&hint=1` | — | Teleportas + paryškinimas iš paieškos |

### API

| Endpoint | Failas | Paskirtis |
|----------|--------|-----------|
| `POST /api/parse-document` | `src/app/api/parse-document/route.ts` | Gemini PDF/tekstas |
| `POST /api/suggest-placement` | `src/app/api/suggest-placement/route.ts` | Vietos siūlymas pagal pastabas |
| `POST /api/labels` | `src/app/api/labels/route.ts` | Lipdukų CSV + HTML |

---

## 4. Projekto struktūra (svarbiausi failai)

```
src/
├── app/                    # Next.js puslapiai + API
├── components/
│   ├── AppNav.tsx          # Navigacija (Pradžia, Sandėlis, Paieška…)
│   ├── DashboardCards.tsx  # Pradžios suvestinė
│   ├── Warehouse3D.tsx     # 3D scena (~2000 eilučių — keisti atsargiai)
│   ├── NewShipmentModal.tsx # Naujas atvykimas + parsinimas + custom laukai
│   ├── LocationDetailModal.tsx
│   └── ui/
│       ├── Modal.tsx
│       ├── LtDatePicker.tsx   # LT kalendorius (ne OS picker)
│       └── HintLabel.tsx      # ? tooltip etiketėms
└── lib/
    ├── demo-store.ts       # Visa demo logika + localStorage
    ├── locations.ts        # Stelažų geometrija + seed lokacijos
    ├── types.ts            # TypeScript tipai (+ CustomField)
    ├── placement.ts        # Vietos siūlymo algoritmas
    ├── gemini.ts           # Universalus LT/EN Gemini parseris
    ├── manufacturer-profiles.ts  # Gamintojų profiliai (localStorage)
    ├── ui-labels.ts        # LT būsenų etiketės UI
    ├── labels.ts           # BarTender CSV
    └── use-wms.ts          # React hook būsenai

docs/
├── zonu-schema.svg         # 2D referencinis planas
├── ZONU_PLANAS.md          # Fizinio žymėjimo gidas
└── FIZINIS_RESET.md

supabase/
├── schema.sql
└── seed_locations.sql

CONTEXT.md                  # Verslo kontekstas (žr. §1)
AGENT_BRIEF.md              # Šis failas
```

---

## 5. Sandėlio fizika (fiksuota — nekeisti be savininko)

- Matmenys: **~29–30 m × ~11 m**
- **Viršus (EXIT siena):** stelažai `7 8 9 10 11 12` — EXIT — `13 14 15`
- **Apačia (ĮĖJIMAS):** `6 5 4 3 2 1` — ĮĖJIMAS — `18 17 16` (tarp 6–5 tarpo nėra)
- **Kairė (1–12) ≈ EXPO**, **dešinė (13–18) ≈ DILED**
- **Raudoni stelažai 2.9×1.5×1.9 m:** 1–4, 9–12, 14–15, 16–17
- **Mėlyni 1.9×1.5×1.8 m:** 5–8, 13, 18
- Fiziniai lipdukai ant stelažų: tik **1–18**. K/D pusė ir aukštas (1–3) — tik sistemoje.

### Lokacijų kodai

| Tipas | Pavyzdys |
|-------|----------|
| Paletės vieta | `DILED-12-K-2` (zona-stelažas-pusė-aukštas) |
| Ilgas saugojimas | `LONG-12-K-3` (virš EXIT, 3 aukštas) |
| Smulkūs 6/7 | `EXPO-6/7-S-1` … `S-4` |
| Tunelis 15/16 | `DILED-15/16-A-1` (prie sienos), `B-1` (vidus) |
| Siena 16/17 | `DILED-16/17-A-1` … `A-4` |
| Specialūs | `STAGING-0-K-1`, `BROKAS-0-K-1` |

Geometrija: `src/lib/locations.ts` → `getRackLayout()`, `getSmallShelfLayout()`.

### 3D kameros presetai

`overview`, `entrance`, `exit`, `top`, `expo`, `diled`, `tunnel1516`, `tunnel1617` — `Warehouse3D.tsx`.

---

## 6. Duomenų modelis

Tipai: `src/lib/types.ts`. Saugojimas demo režime: `src/lib/demo-store.ts`.

| Entitetas | Aprašymas |
|-----------|-----------|
| **Order** | Užsakymas: kodas, projektas, klientas, zona, pastabos, `customFields[]` |
| **Shipment** | Atvykimas: statusas, vežėjas, datos, `parsedJson`, `customFields[]` |
| **CustomField** | `{ id, label, value, showOnLabel }` — lankštūs papildomi laukai |
| **ManufacturerProfile** | Gamintojo formato pastabos AI kontekstui (`localStorage`) |
| **Unit** | Viena dėžė arba paletė: QR, lipduko tekstas, vieta, footprint |
| **Location** | Stelažo vieta (108+ pallet + small_shelf + special) |
| **FloorArea** | Stačiakampis ant grindų (žymimas 3D tempiant) |
| **Handover** | Atsiėmimo įrašas |
| **Defect** | Brokas priėmimo metu |

### Unit būsenos (kode → UI)

```
expected   → Laukiama
received   → Priimta
stored     → Sandėlyje
staged     → Paruošta atsiėmimui
issued     → Išduota
archived   → Archyvuota
```

Vertimai: `src/lib/ui-labels.ts`.

### Pagrindinės store funkcijos

- `createOrderFromParsed()` — naujas užsakymas iš Gemini JSON (+ custom laukai)
- `issueUnitFromQr(qrToken)` — viena dėžė išvykusi per QR; atlaisvina vietą; archyvuoja užsakymą jei paskutinė
- `placeUnit()` / `placeUnitOnFloor()` — padėti į vietą
- `receiveShipment()` — priimti atvykimą
- `stageOrder()` / `issueOrder()` — atsiėmimo eiga
- `searchInventory()` — paieška su filtrais
- `getDashboardSummary()` — pradžios suvestinė
- `suggestLocations()` / `placement.ts` — kur statyti

---

## 7. Verslo eiga (sistema)

### Atvykimas

1. **+ Atvykimas** → įkelti PDF/screenshot arba įklijuoti tekstą
2. Gemini (universalus LT/EN) užpildo standartinius laukus + `customFields` → rankinis pataisymas
3. Pasirinkti gamintojo profilį (optional) — padeda AI atpažinti formatą
4. Pasirinkti / pasiūlyti vietą (stelažas, pusė, aukštas arba „visas stelažas“)
5. Sugeneruoti lipdukus (QR + iki 2 custom laukų ant lipduko)
6. Fiziškai užklijuoti → sistemoje pažymėti vietą 3D žemėlapyje

### QR lipdukas → išvykimas

1. Lipduke QR → `/u/[token]` (telefone ar kompiuteryje)
2. Matoma: projektas, klientas, vieta, visi custom laukai
3. **„Pažymėti išvykus“** → `unit.status = issued`, `locationId = null` (stelažas laisvas)
4. Jei paskutinė dėžė užsakyme → `order.status = archived`
5. **Pastaba:** demo režime QR veikia tik tame pačiame naršyklės profilyje; vėliau — Supabase

### Paieška ir radimas

1. `/search` — filtruoti pagal projektą, kodą, gamintoją, datas
2. **„Rodyti sandėlyje“** → kamera teleportuoja, stelažas paryškinamas oranžine

### Atsiėmimas

1. Paieška arba užsakymo puslapis
2. Paruošti atsiėmimui → važtaraštis → pažymėti kad pasiėmė → archyvas

---

## 8. UI ir kalbos taisyklės

- Vartotojui matomas tekstas — **paprasta lietuvių kalba**
- Vengti: „unit“, „shipment“, „placement“, „footprint“, „DI“ (UI etiketėse)
- Naudoti: „dėžė / paletė“, „atvykimas“, „kur padėta“, „pasiūlyk kur statyti“
- Navigacija: **Pradžia · Sandėlis · Paieška · Užsakymai · Archyvas**
- Mobile-friendly: didesni mygtukai, `dvh`, `safe-area` — `globals.css`, `AppNav.tsx`
- Ilgi paaiškinimai — ne pastraipose, o `HintLabel` (?) tooltip
- Datos laukai — `LtDatePicker` (lietuviškas kalendorius, ne OS picker Windows)

---

## 9. Dokumentų parsinimas (Gemini)

- Failas: `src/lib/gemini.ts`
- **Universalus** LT + EN: sąskaitos, packing list, el. laiškai, screenshot, važtaraščiai
- Išvestis: standartiniai laukai + `customFields[]` (bet kokie rasti laukai su human-readable label)
- API: `POST /api/parse-document` priima `manufacturerHint`, `profileNotes`
- `parseIguzziniInvoiceText()` — heuristika Iguzzini tekstiniams invoice
- Be `GEMINI_API_KEY`: ribotas fallback; vartotojas užpildo ranka arba įklijuoja tekstą

---

## 10. Kas jau padaryta (2026-07-21)

- [x] 3D sandėlio žemėlapis su užimtumu, žymėjimu ant grindų/sijų
- [x] Pradžios suvestinė (`/`)
- [x] Pilna paieška (`/search`) su teleportu
- [x] Naujas atvykimas + Gemini parse + vietos siūlymas
- [x] Lipdukai (CSV + print HTML)
- [x] Smulkūs stelažai: 6/7, 15/16 tunelis, **16/17 prie sienos**
- [x] LT UI be žargono + `HintLabel` tooltip
- [x] Lietuviškas `LtDatePicker` (custom, ne OS)
- [x] Lankštūs `customFields` + gamintojo profiliai
- [x] QR puslapis `/u/[token]` su „Pažymėti išvykus“
- [x] Universalus Gemini parseris (LT/EN + customFields)
- [ ] Supabase integracija (schema paruošta, UI dar localStorage)
- [ ] Auth / multi-user
- [ ] Produkcinis deploy Vercel

---

## 11. Dažnos klaidos agentams

1. **Nekeisti stelažų numeracijos** — ji sutampa su fiziniais lipdukais 1–18.
2. **Demo režimas** — duomenys `localStorage`; po schema keitimo gali reikėti migracijos `demo-store.ts`.
3. **Next.js 16** — nesiremti sena App Router dokumentacija.
4. **`Warehouse3D.tsx` didelis** — keisti tiksliai, neperrašyti viso failo.
5. **Naujos lokacijos** — atnaujinti ir `locations.ts`, ir `supabase/seed_locations.sql`, ir 3D layout.
6. **Plan mode** — implementacija vyksta tik **Agent** režime, ne Plan.

---

## 12. Nuorodos ir medžiaga

| Kas | Kur |
|-----|-----|
| Verslo kontekstas, Antano procesai | [`CONTEXT.md`](CONTEXT.md) |
| 2D planas | `docs/zonu-schema.svg`, `/vizualizacija` |
| Fizinio žymėjimo gidas | `docs/ZONU_PLANAS.md` |
| Ankstesnis pokalbis (istorija) | Cursor agent transcript `c87129fa-ff14-4106-9b2d-3b399480eea1` |
| Testinis PDF | `F196031.pdf` (Iguzzini, užs. I-1079-01, Tomas Veinšreideris) |

---

## 13. Greitas checklist naujam agentui

1. Perskaityti šį failą + `CONTEXT.md` § sandėlio fizika
2. `npm run dev` — patikrinti `/`, `/map`, `/search`
3. Prieš keičiant lokacijas — pažiūrėti `locations.ts` ir 3D
4. UI tekstus dėti lietuviškai per `ui-labels.ts` arba tiesiai komponentuose
5. Po pakeitimų: `npx tsc --noEmit`
