import { Home, Search } from "lucide-react";
import Link from "next/link";

/** 404, FC88-style: a giant number, a marker joke and two chunky ways out. */
export function NotFoundView() {
  return (
    <div className="flex min-h-[75dvh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl text-center">
        <p className="marker text-muted-foreground mb-4 -rotate-3 text-lg">*whoops — offside!*</p>
        <p className="display text-primary text-[10rem] leading-[0.8] sm:text-[14rem]">404</p>
        <h1 className="display mt-3 text-5xl sm:text-6xl">This page wandered off</h1>
        <p className="marker text-primary mx-auto mt-3 max-w-sm -rotate-1 text-base">
          the link may be old, or the item, post or brand moved somewhere else
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="blob tilt-l bg-primary text-primary-foreground inline-flex h-14 items-center gap-2.5 px-7 transition-transform hover:scale-[1.03] hover:rotate-0"
          >
            <Home className="size-5" strokeWidth={2.6} />{" "}
            <span className="marker text-lg">Take me home</span>
          </Link>
          <Link
            href="/search"
            className="blob tilt-r bg-surface-3 inline-flex h-14 items-center gap-2.5 px-6 transition-transform hover:scale-[1.03] hover:rotate-0"
          >
            <Search className="size-5" strokeWidth={2.6} />{" "}
            <span className="marker text-lg">Search</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
