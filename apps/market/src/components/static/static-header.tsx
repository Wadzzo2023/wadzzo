import type { ReactNode } from "react";

/** The top of an info page (About, FAQ, Support, Privacy): a green block with a marker eyebrow, giant title and one line. */
export function StaticHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <header className="side-scope blob bg-side text-side-ink relative overflow-hidden p-6 sm:p-10">
      <p className="marker -rotate-2 text-base">*{eyebrow.toLowerCase()}*</p>
      <h1 className="display mt-2 text-5xl break-words sm:text-6xl lg:text-7xl xl:text-8xl">
        {title}
      </h1>
      {description && (
        <p className="text-side-ink/80 mt-3 max-w-2xl font-semibold">{description}</p>
      )}
    </header>
  );
}
