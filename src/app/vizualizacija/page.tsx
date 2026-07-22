import Image from "next/image";
import Link from "next/link";

export default function VizPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-semibold">2D planas</h1>
        <p className="text-sm text-stone-600">
          Maketas fiziniam reset / orientacijai. Failai:{" "}
          <code className="text-xs">docs/vizualizacija/</code>
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-stone-300 bg-white p-2">
        <Image
          src="/vizualizacija/zonu-schema-preview.png"
          alt="Sandėlio zonų schema"
          width={1200}
          height={580}
          className="h-auto w-full"
          priority
        />
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <a className="underline" href="/vizualizacija/zonu-schema.svg" target="_blank">
          Atsisiųsti SVG
        </a>
        <Link className="underline" href="/map">
          Atidaryti 3D
        </Link>
      </div>
    </div>
  );
}
