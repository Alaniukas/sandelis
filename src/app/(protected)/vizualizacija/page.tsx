import Image from "next/image";
import Link from "next/link";

export default function VizPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5 py-4 sm:py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
          Orientacija
        </p>
        <h1 className="font-display mt-1 text-3xl font-semibold text-stone-900">
          2D planas
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Sandėlio schema — kur ExpoDesign, kur Diled, kur įėjimas
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white p-2 shadow-sm">
        <Image
          src="/vizualizacija/zonu-schema-preview.png"
          alt="Sandėlio zonų schema"
          width={1200}
          height={580}
          className="h-auto w-full"
          priority
        />
      </div>
      <div className="page-mobile-stack">
        <a
          className="btn-secondary"
          href="/vizualizacija/zonu-schema.svg"
          target="_blank"
          rel="noopener noreferrer"
        >
          Atsisiųsti schemą
        </a>
        <Link className="btn-primary" href="/map">
          Atidaryti 3D sandėlį
        </Link>
      </div>
    </div>
  );
}
