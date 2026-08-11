"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { uploadAttachment } from "@/lib/attachments";
import { issueOrder, loadState } from "@/lib/demo-store";
import { useWms } from "@/lib/use-wms";
import {
  formatLocationHuman,
  unitStatusLabel,
  zoneLabel,
} from "@/lib/ui-labels";
import { pushWmsStateNow } from "@/lib/wms-sync";

export default function PickPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const state = useWms();
  const order = state.orders.find((o) => o.id === orderId);
  const units = state.units.filter(
    (u) => u.orderId === orderId && u.status !== "archived",
  );
  const expectedCount = units.length;
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [recipient, setRecipient] = useState("");
  const [confirmedCount, setConfirmedCount] = useState(
    expectedCount > 0 ? String(expectedCount) : "",
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    if (!photoFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  if (!order) {
    return (
      <div className="mx-auto max-w-xl space-y-2 py-6">
        <p>Užsakymas nerastas.</p>
        <Link href="/orders" className="text-sm underline">
          ← Užsakymai
        </Link>
      </div>
    );
  }

  function printWaybill() {
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = units
      .map((u) => {
        const loc = state.locations.find((l) => l.id === u.locationId);
        const floor = u.floorAreaId
          ? state.floorAreas.find((f) => f.id === u.floorAreaId)
          : null;
        const place = floor
          ? floor.label || "Ant grindų"
          : formatLocationHuman(loc?.code ?? null, loc?.label);
        return `<tr><td>${u.indexInSet}/${u.totalInSet}</td><td>${u.labelTitle}</td><td>${place}</td><td>${unitStatusLabel(u.status)}</td></tr>`;
      })
      .join("");
    w.document.write(`<!doctype html><html><head><title>Važtaraštis</title>
      <style>body{font-family:sans-serif;padding:24px} table{border-collapse:collapse;width:100%}
      td,th{border:1px solid #333;padding:6px;text-align:left}</style></head><body>
      <h1>Prekių priėmimo–perdavimo aktas</h1>
      <p><b>Projektas:</b> ${order!.project}<br/>
      <b>Kodas:</b> ${order!.orderCode}<br/>
      <b>Klientas:</b> ${order!.client}<br/>
      <b>Data:</b> ${new Date().toLocaleString("lt-LT")}</p>
      <table><thead><tr><th>Dėžė</th><th>Pavadinimas</th><th>Kur stovėjo</th><th>Būsena</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p style="margin-top:40px">Išdavė: _________________ &nbsp;&nbsp; Gavo: _________________</p>
      <script>window.print()</script></body></html>`);
    w.document.close();
  }

  async function confirmIssue() {
    const name = recipient.trim() || "Klientas";
    const count = Number(confirmedCount);
    if (!Number.isFinite(count) || count < 1) {
      setError("Įrašyk kiek dėžių atiduodi");
      return;
    }
    if (expectedCount > 0 && count !== expectedCount) {
      const ok = window.confirm(
        `Sistemoje ${expectedCount} ${expectedCount === 1 ? "dėžė" : "dėžės"}, o tu įrašei ${count}. Tikrai tęsti?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    setError("");
    let photoUrls: string[] | undefined;
    if (photoFile) {
      const uploaded = await uploadAttachment(photoFile);
      if (!uploaded.storageUrl) {
        setBusy(false);
        setError(
          uploaded.error ||
            "Nepavyko įkelti nuotraukos — bandyk dar kartą arba be foto",
        );
        return;
      }
      photoUrls = [uploaded.storageUrl];
    }
    const next = issueOrder(loadState(), orderId, name, "", {
      confirmedCount: count,
      photoUrls,
    });
    try {
      await pushWmsStateNow(next);
    } catch {
      /* local saved */
    }
    setDone("Išduota klientui");
    setBusy(false);
    setTimeout(() => router.push("/"), 800);
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 py-4 pb-28 sm:py-6">
      <div>
        <Link
          href={`/orders/${orderId}`}
          className="text-sm text-stone-500 underline decoration-stone-300 underline-offset-2"
        >
          ← Užsakymas
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
          Išdavimas klientui
        </p>
        <h1 className="font-display mt-1 text-3xl font-semibold text-stone-900">
          Atsiėmimas
        </h1>
        <p className="mt-1 text-sm text-stone-600">
          {[order.project, order.client, zoneLabel(order.zone)]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <section className="card-panel">
        <h2 className="font-display text-lg font-semibold text-stone-900">
          Kas išvežama
        </h2>
        <ul className="mt-3 divide-y divide-stone-100">
          {units.map((u) => {
            const loc = state.locations.find((l) => l.id === u.locationId);
            const floor = u.floorAreaId
              ? state.floorAreas.find((f) => f.id === u.floorAreaId)
              : null;
            const place = floor
              ? floor.label || "Ant grindų"
              : formatLocationHuman(loc?.code ?? null, loc?.label);
            return (
              <li key={u.id} className="py-3">
                <p className="font-semibold text-stone-900">
                  {u.indexInSet}/{u.totalInSet} — {u.labelTitle}
                </p>
                <p className="mt-0.5 text-sm text-stone-600">
                  <span className="font-medium">{unitStatusLabel(u.status)}</span>
                  {" · "}
                  {place}
                </p>
              </li>
            );
          })}
          {units.length === 0 && (
            <li className="py-4 text-sm text-stone-500">Nėra prekių</li>
          )}
        </ul>
      </section>

      <section className="card-panel space-y-4">
        <button type="button" onClick={printWaybill} className="btn-secondary w-full">
          Spausdinti važtaraštį
        </button>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">
            Kiek dėžių atiduodi?
          </span>
          <input
            className="field"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder={expectedCount ? String(expectedCount) : "Skaičius"}
            value={confirmedCount}
            onChange={(e) =>
              setConfirmedCount(e.target.value.replace(/[^\d]/g, ""))
            }
          />
          {expectedCount > 0 && (
            <p className="mt-1 text-xs text-stone-500">
              Sistemoje: {expectedCount}
            </p>
          )}
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">
            Kas pasiėmė?
          </span>
          <input
            className="field"
            placeholder="Vardas, įmonė, vežėjas…"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />
        </label>

        <div>
          <span className="mb-1 block text-sm font-medium text-stone-700">
            Nuotrauka (rekomenduojama)
          </span>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              setPhotoFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              setPhotoFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="flex min-h-12 items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-3 py-3 text-sm font-semibold text-stone-800 active:bg-stone-100"
              onClick={() => cameraInputRef.current?.click()}
            >
              Fotografuoti
            </button>
            <button
              type="button"
              className="flex min-h-12 items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-3 py-3 text-sm font-semibold text-stone-800 active:bg-stone-100"
              onClick={() => galleryInputRef.current?.click()}
            >
              Iš galerijos
            </button>
          </div>
          {previewUrl && (
            <div className="mt-2 overflow-hidden rounded-xl border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt=""
                className="max-h-48 w-full object-cover"
              />
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <button
          type="button"
          disabled={busy}
          onClick={() => void confirmIssue()}
          className="btn-primary w-full"
        >
          {busy ? "Saugoma…" : "Pažymėti: pasiėmė"}
        </button>

        {done && (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {done}
          </p>
        )}
      </section>
    </div>
  );
}
