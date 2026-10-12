import { cn } from "../lib/cn";

/**
 * The outer box of every page: centred, padded, with room at the bottom for the
 * app's own bottom bar. Each app sets the numbers once in its stylesheet:
 *
 *   --page-max            content width            (default 64rem)
 *   --page-max-wide       width of `wide` pages    (default 80rem)
 *   --page-pad-bottom     bottom room              (default 2.5rem)
 *   --page-pad-bottom-lg  bottom room from `lg` up (default 2.5rem)
 *   --page-pad-bottom-form / -lg  bottom room of create/edit pages (default 2.5rem)
 *   --page-pad-x-lg       side padding from `lg` up (default 1.5rem)
 */
export function pageContainerClass({
  wide = false,
  form = false,
  className,
}: { wide?: boolean; form?: boolean; className?: string } = {}) {
  return cn(
    "mx-auto w-full px-4 pt-5 sm:px-6 lg:pt-8 lg:px-[var(--page-pad-x-lg,1.5rem)]",
    form
      ? "pb-[var(--page-pad-bottom-form,2.5rem)] lg:pb-[var(--page-pad-bottom-form-lg,2.5rem)]"
      : "pb-[var(--page-pad-bottom,2.5rem)] lg:pb-[var(--page-pad-bottom-lg,2.5rem)]",
    wide ? "max-w-[var(--page-max-wide,80rem)]" : "max-w-[var(--page-max,64rem)]",
    className,
  );
}
