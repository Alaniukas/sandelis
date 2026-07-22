"use client";

import Link from "next/link";
import { useWms } from "@/lib/use-wms";

export default function ArchivePage() {
  const state = useWms();
  const archived = state.orders.filter((o) => o.status === "archived");
  const handovers = state.handovers;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-semibold">Archyvas</h1>
      <div className="rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-100">
            <tr>
              <th className="px-3 py-2">Projektas</th>
              <th className="px-3 py-2">Kodas</th>
              <th className="px-3 py-2">Klientas</th>
              <th className="px-3 py-2">Išduota</th>
            </tr>
          </thead>
          <tbody>
            {archived.map((o) => {
              const h = handovers.find((x) => x.orderId === o.id);
              return (
                <tr key={o.id} className="border-t">
                  <td className="px-3 py-2">
                    <Link href={`/orders/${o.id}`} className="underline">
                      {o.project}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{o.orderCode}</td>
                  <td className="px-3 py-2">{o.client}</td>
                  <td className="px-3 py-2">
                    {h
                      ? `${h.recipientName} · ${new Date(h.issuedAt).toLocaleString("lt-LT")}`
                      : "—"}
                  </td>
                </tr>
              );
            })}
            {archived.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-stone-500">
                  Archyvas tuščias
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
