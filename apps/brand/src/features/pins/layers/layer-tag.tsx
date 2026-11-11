import { LayerBadge } from "@wadzzo/ui/patterns/layer-icon";

/** A layer's name with its badge (docs/layers), for summaries and lists. */
export function LayerTag({
  layer,
}: {
  layer: { name: string; icon: string; color: string } | null | undefined;
}) {
  if (!layer) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <LayerBadge icon={layer.icon} color={layer.color} size={18} />
      {layer.name}
    </span>
  );
}
