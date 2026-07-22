-- Seed pagal brėžinį: stelažai 1-18 palei ilgasias sienas
-- Viršus: 7-12 | EXIT | 13-15
-- Apačia: 6-1 | IEJIMAS | 18-16 (be tarpo 6-5)
-- red: 1-4,9-12,14-15,16-17 | blue: 5-8,13,18

truncate locations cascade;

do $$
declare
  r int;
  s text;
  lv int;
  z zone_type;
  code text;
  rack_size text;
begin
  for r in 1..18 loop
    if r <= 12 then z := 'EXPO'; else z := 'DILED'; end if;
    if r in (5,6,7,8,13,18) then rack_size := 'blue_1.9'; else rack_size := 'red_2.9'; end if;
    foreach s in array array['K','D'] loop
      for lv in 1..3 loop
        if lv = 3 and r in (12, 13) then
          code := 'LONG-' || r::text || '-' || s || '-' || lv::text;
          insert into locations (code, zone, rack, side, level, kind, label, capacity_hint)
          values (code, 'LONG', r, s::side_type, lv, 'pallet', code || ' (virš EXIT)', 
            case when rack_size = 'red_2.9' then 2.9*1.5*1.9 else 1.9*1.5*1.8 end);
        else
          code := z::text || '-' || r::text || '-' || s || '-' || lv::text;
          insert into locations (code, zone, rack, side, level, kind, label, capacity_hint)
          values (code, z, r, s::side_type, lv, 'pallet', code || ' (' || rack_size || ')',
            case when rack_size = 'red_2.9' then 2.9*1.5*1.9 else 1.9*1.5*1.8 end);
        end if;
      end loop;
    end loop;
  end loop;

  insert into locations (code, zone, rack, side, level, kind, label) values
    ('EXPO-6/7-S-1', 'EXPO', 6, 'K', 1, 'small_shelf', 'Smulkūs 6/7 prie sienos L1'),
    ('EXPO-6/7-S-2', 'EXPO', 6, 'K', 2, 'small_shelf', 'Smulkūs 6/7 prie sienos L2'),
    ('EXPO-6/7-S-3', 'EXPO', 6, 'K', 3, 'small_shelf', 'Smulkūs 6/7 prie sienos L3'),
    ('EXPO-6/7-S-4', 'EXPO', 6, 'K', 4, 'small_shelf', 'Smulkūs 6/7 prie sienos L4'),
    ('DILED-15/16-A-1', 'DILED', 15, 'D', 1, 'small_shelf', 'Tunelis 15/16 prie sienos L1'),
    ('DILED-15/16-A-2', 'DILED', 15, 'D', 2, 'small_shelf', 'Tunelis 15/16 prie sienos L2'),
    ('DILED-15/16-A-3', 'DILED', 15, 'D', 3, 'small_shelf', 'Tunelis 15/16 prie sienos L3'),
    ('DILED-15/16-A-4', 'DILED', 15, 'D', 4, 'small_shelf', 'Tunelis 15/16 prie sienos L4'),
    ('DILED-15/16-B-1', 'DILED', 15, 'K', 1, 'small_shelf', 'Tunelis 15/16 vidus L1'),
    ('DILED-15/16-B-2', 'DILED', 15, 'K', 2, 'small_shelf', 'Tunelis 15/16 vidus L2'),
    ('DILED-15/16-B-3', 'DILED', 15, 'K', 3, 'small_shelf', 'Tunelis 15/16 vidus L3'),
    ('DILED-15/16-B-4', 'DILED', 15, 'K', 4, 'small_shelf', 'Tunelis 15/16 vidus L4'),
    ('DILED-16/17-A-1', 'DILED', 16, 'D', 1, 'small_shelf', 'Smulkūs 16/17 prie sienos 1'),
    ('DILED-16/17-A-2', 'DILED', 16, 'D', 2, 'small_shelf', 'Smulkūs 16/17 prie sienos 2'),
    ('DILED-16/17-A-3', 'DILED', 16, 'D', 3, 'small_shelf', 'Smulkūs 16/17 prie sienos 3'),
    ('DILED-16/17-A-4', 'DILED', 16, 'D', 4, 'small_shelf', 'Smulkūs 16/17 prie sienos 4'),
    ('STAGING-0-K-1', 'STAGING', 0, 'K', 1, 'special', 'STAGING'),
    ('BROKAS-0-K-1', 'BROKAS', 0, 'K', 1, 'special', 'BROKAS');
end $$;
