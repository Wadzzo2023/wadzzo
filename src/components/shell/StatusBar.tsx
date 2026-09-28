import { useEffect, useState } from "react";

/**
 * A simulated iOS status bar, shown only inside the desktop device shell.
 *
 * On a real phone the OS draws this and the app must not; that's why it's
 * `lg:` only. Inside the desktop frame there's nothing above the screen, and
 * its absence is the single thing that most breaks the illusion of looking at
 * a phone — so we draw it there, and only there.
 */
export function StatusBar() {
  const [time, setTime] = useState<string | null>(null);

  // Rendered client-side only. Formatting a clock during SSR guarantees a
  // hydration mismatch the moment the server and the viewer disagree about
  // the minute, which they eventually always do.
  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        }),
      );
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-50 hidden h-[52px] items-center justify-between px-8 pt-1 lg:flex">
      <span className="font-hud text-[15px] font-semibold tabular-nums text-ar-text">
        {time ?? " "}
      </span>

      <div className="flex items-center gap-1.5 text-ar-text">
        {/* Signal */}
        <svg viewBox="0 0 18 12" className="h-[11px] w-[17px]" fill="currentColor">
          {[0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x={i * 4.6}
              y={9 - i * 2.7}
              width="3"
              height={3 + i * 2.7}
              rx="1"
              opacity={i === 3 ? 0.35 : 1}
            />
          ))}
        </svg>

        {/* Wi-Fi */}
        <svg viewBox="0 0 16 12" className="h-[11px] w-[15px]" fill="currentColor">
          <path d="M8 10.6 5.9 8.2a3.2 3.2 0 0 1 4.2 0L8 10.6Z" />
          <path
            d="M3.6 5.9a6.6 6.6 0 0 1 8.8 0"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M1.3 3.4a9.9 9.9 0 0 1 13.4 0"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </svg>

        {/* Battery — green, because the app is about being out walking */}
        <svg viewBox="0 0 26 12" className="h-[12px] w-[25px]">
          <rect
            x="0.6"
            y="0.6"
            width="21"
            height="10.8"
            rx="3"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.4"
          />
          <rect
            x="2.2"
            y="2.2"
            width="14"
            height="7.6"
            rx="1.8"
            fill="hsl(var(--ar-green))"
          />
          <path
            d="M23.4 4.2c1.1.3 1.1 3.3 0 3.6V4.2Z"
            fill="currentColor"
            fillOpacity="0.4"
          />
        </svg>
      </div>
    </div>
  );
}
