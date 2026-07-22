"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Deep-link: /shipments/new → map with modal */
export default function NewShipmentPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/map?new=1");
  }, [router]);
  return (
    <p className="py-16 text-center text-sm text-stone-500">
      Atidaromas siuntos langas…
    </p>
  );
}
