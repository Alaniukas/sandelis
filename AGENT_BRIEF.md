# AGENT_BRIEF — Sandėlio WMS

**Skaityk šį failą pirmiausia**, prieš bet kokį darbą šiame projekte.  
Versija atnaujinta: 2026-08-11.

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
| DB | **Supabase** — schema + sync (`WmsProvider`, `wms-sync.ts`); demo vis dar remiasi `localStorage` |
| Hosting | **Vercel** — produkcija: `https://sandelio.vercel.app` |
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
| `/map` | `src/app/(protected)/map/page.tsx` | **Sandėlis 3D** — žymėjimas, perkėlimas, teleportas |
| `/search` | `src/app/search/page.tsx` | **Paieška** — viso inventoriaus filtrai + „Rodyti sandėlyje“ |
| `/orders` | `src/app/orders/page.tsx` | Užsakymų sąrašas |
| `/orders/[id]` | `src/app/orders/[id]/page.tsx` | Užsakymo detalė, lipdukai, vieta |
| `/laukia/[shipmentId]` | `src/app/(protected)/laukia/...` | Laukiamas atvykimas (dar neatvažiavo) |
| `/laikoma/[shipmentId]` | `src/app/(protected)/laikoma/...` | Laikymo eilė: atvyko, skaičius + foto, dar nepriskirta |
| `/pick/[orderId]` | `src/app/pick/...` | Atsiėmimas / važtaraštis |
| `/archive` | `src/app/archive/page.tsx` | Archyvuoti užsakymai |
| `/vizualizacija` | `src/app/vizualizacija/page.tsx` | 2D planas (SVG/PNG) |
| `/u/[token]` | `src/app/u/[token]/page.tsx` | QR lipduko puslapis |
| `/map?new=1` | — | Atidaro modalą „Naujas atvykimas“ |
| `/map?move=UNIT_ID` | — | Perkėlimo režimas (footprint ant sijos / plotas ant grindų) |
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
│   ├── FloorAreaModal.tsx
│   ├── ShelfFootprintModal.tsx
│   ├── ExistingOrderAssignFields.tsx  # Esamas užsakymas: nauja dėžė arba perkelti
│   ├── UnitPicker.tsx
│   ├── WmsProvider.tsx       # Supabase sync + būsena
│   └── ui/
│       ├── Modal.tsx
│       ├── LtDatePicker.tsx   # LT kalendorius (ne OS picker)
│       └── HintLabel.tsx      # ? tooltip etiketėms
└── lib/
    ├── demo-store.ts       # Visa demo logika + localStorage + migracijos
    ├── wms-sync.ts         # Remote pull/push, dirty flag, backoff
    ├── map-focus.ts        # Teleportas / paryškinimas žemėlapyje
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
- **Kairė (1–12) ≈ EXPO / Distyle**, **dešinė (13–18) ≈ DILED**
- **Stelažų aukštai** (`rackLevelDefs` in `locations.ts`):
  - **12** — 3 standartiniai aukštai (1, 2, 3)
  - **13** — tik **2 aukštai** (1, 2); 3 aukšto nėra
  - **14** — 1, **mini M**, 2, 3
  - **1, 9, 10** — 2 aukštai (2 aukštas aukštas)
- **3D ženklelis** ant stelažo: `badgeY` skaičiuojamas pagal faktinį aukštų skaičių (2 aukštų stelažams nenaudoti `beamYs[2]`).
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
| **Handover** | Atsiėmimo įrašas; `unitPlacements` — vietų snapshot archyvui |
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
- `placeUnit()` / `placeUnitOnFloor()` / `moveUnitToLocation()` — padėti / perkelti
- `footprintConflictsAtLocation()` — ar footprint telpa ant sijos (K/D dalinasi vieną aukštą)
- `unitsAtLocation()` — visos prekės tame pačiame aukšte (įsk. shared deck)
- `assignOrderToShelf()` / `assignOrderToFloor()` — `assignMode: 'new' | 'move'`
- `restoreOrderFromArchive()` — grąžina užsakymą + vienas iš `unitPlacements`
- `issueUnitToClient()` — viena dėžė atsiimta iš žemėlapio (saugo `previousFloorAreaId`)
- `findOverlappingFloorArea()` / `pruneEmptyFloorAreas()` — grindų plotų sujungimas / tuščių šalinimas
- `getDashboardSummary()` — užimtumas (žr. §6.1)
- `zoneAtFloorPoint(x, z)` — EXPO/DILED pagal artimiausią stelažą (grindų skaidymui)

### 6.1 Užimtumas (pradžios kortelė)

| Rodiklis | Skaičiavimas |
|----------|----------------|
| **Visas sandėlis %** | užimtos paletės vietos / visos paletės vietos |
| **Distyle %** | EXPO+LONG užimtos / **visos** vietos (dalis iš 100%) |
| **Diled %** | DILED užimtos / **visos** vietos |
| **Ant grindų %** | prekių footprint m² / `ROOM.length × ROOM.width` (330 m²) |
| **Grindys Distyle/Diled** | to paties ploto skaidymas pagal `zoneAtFloorPoint` |

**Svarbu:** ant sijos kelios dėžės gali stovėti tame pačiame aukšte — tikrinti `footprintConflictsAtLocation`, ne `slotOccupancy` (binary).

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

### Perkėlimas (3D žemėlapis)

1. Užsakymo detalė arba žemėlapis → **Perkelti**
2. Spustelėti naują vietą arba **pabrėžti laisvą plotą** ant sijos (net jei jau stovi kita dėžė)
3. Sistema tikrina footprint persidengimą, ne „visa vieta užimta“

### Archyvas

- **Grąžinti iš archyvo** — atkuria vietas iš `Handover.unitPlacements` (senesni archyvai be snapshot gali reikalauti rankinio pastatymo)
- **Klientas atsiėmė** — viena prekė iš žemėlapio be viso užsakymo archyvavimo

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

## 10. Kas jau padaryta (2026-08-11)

- [x] 3D sandėlio žemėlapis su užimtumu, žymėjimu ant grindų/sijų
- [x] Perkėlimo režimas + footprint ant dalinai užimtos sijos
- [x] Esamo užsakymo priskyrimas: nauja dėžė arba perkelti esamą
- [x] Archyvo grąžinimas + „Klientas atsiėmė“ ant žemėlapio
- [x] Užimtumo skaidymas Distyle / Diled (stelažai + grindys)
- [x] Stelažų 12–14 geometrija ir 13 stelažo 2 aukštai
- [x] Supabase sync (dalinė — `WmsProvider`; localStorage vis dar šaltinis)
- [x] Produkcinis deploy Vercel (`sandelio.vercel.app`)
- [x] Pradžios suvestinė, paieška, Gemini parse, lipdukai, QR, LT UI
- [ ] Pilnas Supabase kaip vienintelis šaltinis (be localStorage priklausomybės)
- [ ] Auth / multi-user

---

## 11. Dažnos klaidos agentams

1. **Nekeisti stelažų numeracijos** — ji sutampa su fiziniais lipdukais 1–18.
2. **Demo režimas** — duomenys `localStorage`; po schema keitimo gali reikėti migracijos `demo-store.ts`.
3. **Next.js 16** — nesiremti sena App Router dokumentacija.
4. **`Warehouse3D.tsx` didelis** — keisti tiksliai, neperrašyti viso failo.
5. **Naujos lokacijos** — atnaujinti ir `locations.ts`, ir `supabase/seed_locations.sql`, ir 3D layout.
6. **Perkėlimas / dalinė sija** — naudoti `footprintConflictsAtLocation`, ne `slotOccupancy` (binary).
7. **Rack 13 migracijos** — nebekurti L2→L1 taisyklės, kuri atšauktų perkėlimą į 2 aukštą.
8. **Deploy** — tik su savininko leidimu (`git push` → Vercel auto-deploy).
9. **Plan mode** — implementacija vyksta tik **Agent** režime, ne Plan.

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
