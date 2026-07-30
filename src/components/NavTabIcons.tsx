export type NavTabId = "home" | "map" | "search" | "orders";

export function NavTabIcon({
  id,
  active,
}: {
  id: NavTabId;
  active: boolean;
}) {
  const cls = active ? "text-white" : "text-stone-600";
  const box = `flex h-8 w-8 items-center justify-center rounded-lg transition ${
    active ? "bg-stone-900" : "bg-stone-200"
  }`;

  return (
    <span className={box} aria-hidden>
      <svg
        className={`h-4 w-4 ${cls}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {id === "home" && (
          <>
            <path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H8v6H5a1 1 0 01-1-1v-9.5z" />
          </>
        )}
        {id === "map" && (
          <>
            <path d="M3 7l7-3 8 3 7-3v14l-7 3-8-3-7 3V7z" />
            <path d="M10 4v14M18 7v14" />
          </>
        )}
        {id === "search" && (
          <>
            <circle cx="11" cy="11" r="6" />
            <path d="M20 20l-4-4" />
          </>
        )}
        {id === "orders" && (
          <>
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
            <path d="M9 12h6M9 16h6" />
          </>
        )}
      </svg>
    </span>
  );
}
