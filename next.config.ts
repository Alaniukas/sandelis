import type { NextConfig } from "next";

/**
 * Dev serveris iš telefono eina per LAN IP (ne localhost).
 * Be šito Next blokuoja /_next/* — JS neįsikrauna, login forma „nieko nedaro“.
 */
function allowedDevOrigins(): string[] {
  const fromEnv = process.env.WMS_ALLOWED_DEV_ORIGINS;
  const extras = fromEnv?.trim()
    ? fromEnv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return [
    "10.173.52.132",
    "localhost",
    "127.0.0.1",
    // Privatus LAN — kad po Wi‑Fi IP pasikeitimo nereikėtų redaguoti
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
    "172.17.*.*",
    "172.18.*.*",
    "172.19.*.*",
    "172.20.*.*",
    "172.21.*.*",
    "172.22.*.*",
    "172.23.*.*",
    "172.24.*.*",
    "172.25.*.*",
    "172.26.*.*",
    "172.27.*.*",
    "172.28.*.*",
    "172.29.*.*",
    "172.30.*.*",
    "172.31.*.*",
    ...extras,
  ];
}

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: allowedDevOrigins(),
};

export default nextConfig;
