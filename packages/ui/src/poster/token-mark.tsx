import { cn } from "../lib/cn";

/**
 * A platform logo drawn as a mask, so it takes the surrounding text colour (the artwork itself
 * is usually the brand colour, which would vanish on brand-coloured stickers). Sized by height;
 * the width follows the logo's 5:4 shape.
 */
export function TokenMark({ src, className }: { src: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-4 bg-current align-middle", className)}
      style={{
        aspectRatio: "5 / 4",
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
