import { v4 as uuid } from "uuid";
import type { CustomField, ManufacturerProfile } from "./types";

const PROFILES_KEY = "sandelio-wms-profiles";

export function loadManufacturerProfiles(): ManufacturerProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ManufacturerProfile[];
  } catch {
    return [];
  }
}

export function saveManufacturerProfiles(profiles: ManufacturerProfile[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  window.dispatchEvent(new Event("wms-updated"));
}

export function upsertManufacturerProfile(
  name: string,
  notes: string,
): ManufacturerProfile {
  const profiles = loadManufacturerProfiles();
  const existing = profiles.find(
    (p) => p.name.toLowerCase() === name.trim().toLowerCase(),
  );
  if (existing) {
    const updated = { ...existing, notes: notes.trim() };
    saveManufacturerProfiles(
      profiles.map((p) => (p.id === existing.id ? updated : p)),
    );
    return updated;
  }
  const profile: ManufacturerProfile = {
    id: uuid(),
    name: name.trim(),
    notes: notes.trim(),
    createdAt: new Date().toISOString(),
  };
  saveManufacturerProfiles([profile, ...profiles]);
  return profile;
}

export function newCustomField(
  partial?: Partial<CustomField>,
): CustomField {
  return {
    id: uuid(),
    label: partial?.label ?? "",
    value: partial?.value ?? "",
    showOnLabel: partial?.showOnLabel ?? false,
  };
}

export function customFieldsFromParsed(
  fields?: CustomField[],
): CustomField[] {
  if (!fields?.length) return [];
  return fields.map((f) => newCustomField(f));
}
