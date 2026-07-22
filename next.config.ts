import type { NextConfig } from "next";

function allowedDevOrigins(): string[] {
  const raw = process.env.WMS_ALLOWED_DEV_ORIGINS;
  if (raw?.trim()) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  /** Leidžia atidaryti dev serverį iš telefono / LAN (pvz. 192.168.x.x) */
  allowedDevOrigins: allowedDevOrigins(),
};

export default nextConfig;
