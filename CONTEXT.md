# Sandėlio WMS — CONTEXT

Visas projekto kontekstas vienoje vietoje. Skaityk šį failą prieš bet kokį darbą.

> **Agentams:** techninė platforma, maršrutai ir failų žemėlapis — [`AGENT_BRIEF.md`](AGENT_BRIEF.md). Šis failas = verslo kontekstas.

## Kas tai

Vidinė sandėlio valdymo sistema ExpoDesign (EXPO) + DILED. Viena svetainė (kompas + telefonas): žemėlapis, priėmimas, lipdukai, atsiėmimas, archyvas.

**Stack:** Next.js (App Router) + TypeScript + Tailwind → Vercel; Supabase (DB/Auth/Storage); Gemini API (PDF/screenshot unifikacija).

**Vartotojai v1:** tik savininkas (1 account). UI lietuvių kalba.

## Sandėlio fizika

- Matmenys: **~29–30 m** × **~11 m**.
- **Išdėstymas (fiksuotas):** stelažai **1–18 palei dvi ilgasias sienas** (kaip brėžinys + sandėlio foto):
  - Viršus: `7 8 9 10 11 12` — **EXIT** — `13 14 15`
  - Apačia: `6 5 4 3 2 1` — **IEJIMAS** — `18 17 16` (**tarp 6–5 tarpo nėra**)
  - Praėjimų smulkūs **prie sienos**: kairė 6↔7 (smulkūs prie sienos + praėjimas); dešinė 15↔16 **tunelis** (siena → smulkūs → praėjimas → smulkūs)
  - **BROKAS** ne prie ieimo (giliau); **STAGING** centro plotelis atsiemimui
  - **LONG** = 3 aukštas / virš EXIT (ne grindų zona maketo apačioje); 2D tik žyma, UI bus 3D su aukštais
- **IEJIMAS** tarp **1** (kaire) ir **18** (desine).
- **Raudona 2.9×1.5×1.9:** 1–4, 9–12, 14–15, 16–17. **Mėlyna 1.9×1.5×1.8:** 5–8, 13, 18.
- Nuo ieimo: **kaire ≈ EXPO (1–12)**, **desine ≈ DILED (13–18)**.
- Aukštai 1–3 ir K/D — tik sistemoje; fiziskas lipdukas = **1–18**.
- Žr. `docs/zonu-schema.svg`, `docs/zonu-schema-preview.png`.

### Adresas sistemoje

`{ZONA}-{stelazas}-{K|D}-{aukštas}` pvz. `DILED-12-K-2`

Zonos: `EXPO` | `DILED` | `STAGING` | `BROKAS` | `LONG`

Smulkūs stelažai: `EXPO-6/7-S-{n}`, `DILED-15/16-A|B-{n}`, `DILED-16/17-A-{n}`.

## Specialios zonos / atvejai

| Vieta | Aprašymas |
|-------|-----------|
| Smulkūs po dideliais (įėjimas → dešinė) | DILED smulkūs klientų daiktai |
| Praėjimas 6–7 | Maži stelažai |
| Praėjimas 15–16 | Maži stelažai abiejose pusėse |
| Siena 16–17 (1 aukštas) | Smulkūs stelažai prie dešinės sienos, įėjimo pusėje |
| Virš EXIT | Ilgas saugojimas (LONG), pvz. nuo 2024 |
| Dubai tipo projektai | 9–11 stelažai, keli aukštai + grindų eilė; traukti iš priekio (`block_storage`) |
| Lenta prie stelažo | Dabartinis „inbox“ (važtaraščiai) — sistemoje = siuntų eilė |

## Dabartinė eiga (prieš sistemą)

### Priėmimas

1. Vadyba praneša apie atvykimą + prekių sąrašą (su klientais arba be; 1 siunta gali turėti kelis klientus; 1 prekė = kelios dėžės).
2. Sandėlininkas (Antanas) spausdina lapą → klijuoja ant lentos.
3. Kurjeris skambina → priėmimas, apžiūra; brokas → Viber; OK → parašas.
4. Atpažįsta pagal gamintoją / dėžes.
5. DILED arba ExpoDesign programoje randa užsakymą, sutikrina.
6. BarTender/TSC lipdukas: projektas/kodas, pl/dėž, data, gavėjas.
7. Pastaato — **vieta tik atmintyje**. Projektas gali atvykti per kelias siuntas.

### Išdavimas

1. Skambutis (projektas/vardas) → paieška atmintyje.
2. Vadyba atsiunčia važtaraštį.
3. Klientas/kurjeris pasirašo, pasiima.
4. Važtaraštis eina vadybai.

### Lipdukų pavyzdžiai (seni)

- `Dubai` / `2 pl` / `16 dėž` / `07.17`
- `BJ-1987` / `07.08` / `9 cll` / `Vytautas Vasiliauskas`

## Norima eiga (sistema)

### Priėmimas

1. Įkelti PDF/screenshot (važtaraštis / DILED-Distyle info).
2. Gemini ištraukia unifikuotą JSON → rankinis edit.
3. Generuoti lipdukus kiekvienai dėžei/paletei (`1/N` + QR).
4. Putaway pasiūlymas pagal zoną/kubatūrą.
5. Atvykus: data, pl/dėž, brokas (+foto), papildomi unitai jei daugiau.
6. Lipdukai → pastatyti → įrašyti stelažą + K/D + aukštą.
7. Žemėlapyje matosi viskas.

### Atsiėmimas

1. Search pagal projektą/vardą.
2. Pažymėti atsiėmimą → važtaraščio PDF.
3. STAGING → pasiėmė → lokacija laisva → archyvas.

## Sprendimai (užrakinta)

- Be DILED/Distyle API — tik PDF/screenshot + Gemini.
- Lipdukai prekėms: PDF + CSV → BarTender (be tiesioginės TSC integracijos).
- Fiziniai stelažų lipdukai: tik 1–18; K/D/aukštą įrašo vartotojas sistemoje.
- 3D vizualizacija (React Three Fiber).
- Hosting: Vercel + Supabase, prieiga iš bet kur.

## Duomenų modelis (santrauka)

- `locations`, `shipments`, `orders`, `units`, `defects`, `documents`, `handovers`
- Unit statusai: `expected` → `received` → `stored` → `staged` → `issued` → `archived`

## Failai / docs

- `docs/ZONU_PLANAS.md` — piešimo gidas fiziniam reset
- `docs/zonu-schema.svg` — referencinė schema
- `docs/FIZINIS_RESET.md` — checklista po reset

## Kontaktinė / operacinė info (iš Antano lapų)

- Raktų / krautuvo / plastiko konteinerio kontaktai — ne WMS scope, bet sandėlio ops.
- DILED: užsakymai iš programos + mail; Distyle: PPA mailu, TU kodai.
- Kuro kortelės EXPO/DILED rotacija — ne WMS.

## Ne MVP

Antanas/vadyba roles, DILED/Distyle API, TSC tiesioginė integracija, Viber botas, fotogrametrinis twin.
