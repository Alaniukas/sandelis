import type { Shipment } from "./types";

const BUCKET = "wms-attachments";

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Nepavyko skaityti failo"));
    r.readAsDataURL(file);
  });
}

export function storagePathFromUrl(url: string): string | null {
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx >= 0) return url.slice(idx + marker.length).split("?")[0] ?? null;
  const publicMarker = `/object/public/${BUCKET}/`;
  const pubIdx = url.indexOf(publicMarker);
  if (pubIdx >= 0) return url.slice(pubIdx + publicMarker.length).split("?")[0] ?? null;
  return null;
}

export function attachmentViewHref(
  storagePath: string | null | undefined,
  publicUrl: string | null | undefined,
): string | null {
  if (storagePath?.trim()) {
    return `/api/attachments/view?path=${encodeURIComponent(storagePath.trim())}`;
  }
  if (publicUrl && !publicUrl.startsWith("data:")) {
    return `/api/attachments/view?u=${encodeURIComponent(publicUrl)}`;
  }
  return null;
}

export function isLikelyImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(file.name);
}

/** Įkelia į serverio saugyklą. */
export async function uploadAttachment(file: File): Promise<{
  url: string;
  storageUrl: string | null;
  storagePath: string | null;
  dataUrl: string | null;
  error: string | null;
}> {
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/api/attachments", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (res.ok) {
      const data = (await res.json()) as { url: string; path?: string };
      return {
        url: data.url,
        storageUrl: data.url,
        storagePath: data.path ?? storagePathFromUrl(data.url),
        dataUrl: null,
        error: null,
      };
    }
    let errText = "Nepavyko įkelti į serverį";
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) errText = j.error;
    } catch {
      /* ignore */
    }
    if (res.status === 401) errText = "Sesija pasibaigė — prisijunk iš naujo";
    return {
      url: "",
      storageUrl: null,
      storagePath: null,
      dataUrl: null,
      error: errText,
    };
  } catch {
    return {
      url: "",
      storageUrl: null,
      storagePath: null,
      dataUrl: null,
      error: "Tinklo klaida — patikrink internetą",
    };
  }
}

export function shipmentAttachmentHref(shipment: Shipment): string | null {
  const proxy = attachmentViewHref(
    shipment.attachmentStoragePath,
    shipment.attachmentUrl,
  );
  if (proxy) return proxy;
  return shipment.attachmentDataUrl || null;
}

/** Laikymo nuotraukų peržiūros URL (proxy) */
export function holdingPhotoHrefs(shipment: Shipment): string[] {
  const urls = shipment.holdingPhotoUrls ?? [];
  const paths = shipment.holdingPhotoStoragePaths ?? [];
  const out: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const href = attachmentViewHref(paths[i] ?? null, urls[i]) ?? mediaViewHref(urls[i]);
    if (href) out.push(href);
  }
  return out;
}

export function mediaViewHref(url: string): string {
  if (url.startsWith("data:")) return url;
  if (url.includes(BUCKET) || url.startsWith("http")) {
    return `/api/attachments/view?u=${encodeURIComponent(url)}`;
  }
  return url;
}
