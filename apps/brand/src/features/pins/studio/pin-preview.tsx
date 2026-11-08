import { Label } from "@wadzzo/ui/components/label";
import { Switch } from "@wadzzo/ui/components/switch";
import { PinGlyph } from "@wadzzo/ui/patterns/pin-glyph";
import { Input } from "@wadzzo/ui/poster/input";

/** The pin states the studio shows a shape in. */
export const PIN_STATES = [
  { label: "Active", ring: "hsl(var(--primary))", className: "" },
  { label: "Collected", ring: "hsl(var(--info))", className: "opacity-80" },
  { label: "Expired", ring: "hsl(var(--muted-foreground))", className: "opacity-40 grayscale" },
] as const;

/** One outline drawn as a pin, with the brand's logo inside when there is one. */
export function PinPreview({
  path,
  size,
  ring = PIN_STATES[0].ring,
  className,
  imageUrl,
}: {
  /** Leave out (or empty) for the plain circle. */
  path?: string;
  size: number;
  ring?: string;
  className?: string;
  imageUrl: string | null;
}) {
  return (
    <PinGlyph
      path={path === "" ? undefined : path}
      size={size}
      defaultColor="hsl(var(--muted))"
      imageUrl={imageUrl}
      ringColor={ring}
      ringWidth={size > 80 ? 3 : 2}
      className={className}
    />
  );
}

/**
 * The top of the options column, always in view: the shape's name and how the
 * pin looks in each state, with a switch for the logo.
 */
export function PreviewStrip({
  name,
  onName,
  path,
  logo,
  showLogo,
  onShowLogo,
}: {
  name: string;
  onName: (name: string) => void;
  path: string;
  /** The brand's logo. */
  logo: string | null | undefined;
  showLogo: boolean;
  onShowLogo: (show: boolean) => void;
}) {
  const imageUrl = showLogo ? (logo ?? null) : null;
  return (
    <div className="bg-surface-2/50 shrink-0 space-y-4 border-b p-4">
      <div className="space-y-1.5">
        <Label htmlFor="shape-name">Shape name</Label>
        <Input
          id="shape-name"
          maxLength={40}
          value={name}
          placeholder="e.g. Forest troll"
          onChange={(e) => onName(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-4">
        <div className="shrink-0">
          <PinPreview path={path} size={88} imageUrl={imageUrl} />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-end gap-3">
            {PIN_STATES.map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-1">
                <PinPreview
                  path={path}
                  size={34}
                  ring={s.ring}
                  className={s.className}
                  imageUrl={imageUrl}
                />
                <span className="text-muted-foreground text-[11px]">{s.label}</span>
              </div>
            ))}
          </div>
          <label className="flex items-center justify-between gap-2 text-sm">
            Logo inside
            <Switch checked={showLogo} onCheckedChange={onShowLogo} />
          </label>
        </div>
      </div>
    </div>
  );
}
