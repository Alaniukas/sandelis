# Sandėlio WMS (EXPO / DILED)

Vidinė sandėlio sistema: 3D žemėlapis, siuntos, Gemini parse, lipdukai, priėmimas, atsiėmimas, archyvas.

## Paleidimas (demo — be Supabase)

```bash
npm install
npm run dev
```

Atidaryk http://localhost:3000 — duomenys saugomi naršyklės `localStorage`.

## Env (nebūtina demo režimui)

Nukopijuok `.env.example` → `.env.local`:

- `GEMINI_API_KEY` — PDF/screenshot ištrauka (be rakto veikia demo parseris)
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — vėliau produkcijai
- `NEXT_PUBLIC_APP_URL` — QR nuorodoms

Supabase SQL: `supabase/schema.sql` + `supabase/seed_locations.sql`.

## Vizualizacija

Išsaugota čia:

- `docs/vizualizacija/` — SVG, PNG, rankinis brėžinys, aprašymas
- UI: `/vizualizacija` (2D) ir `/map` (3D)

## Kontekstas

- **Agentams (pradėk čia):** [`AGENT_BRIEF.md`](AGENT_BRIEF.md) — platforma, maršrutai, failai, kas padaryta
- **Verslo kontekstas:** [`CONTEXT.md`](CONTEXT.md) — sandėlio eiga, Antano procesai, sprendimai
