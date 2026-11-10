import type { IControl } from "mapbox-gl";

export type StackButtonId = "locate" | "zoomIn" | "zoomOut";

/** Top to bottom, whichever are present. */
const ORDER: readonly StackButtonId[] = ["locate", "zoomIn", "zoomOut"];

export type StackButton = {
  /** Tooltip and accessible name. */
  label: string;
  /** What the button shows: text, or markup such as an svg. */
  html: string;
  onPress: () => void;
  /** Extra class on the button (Mapbox draws its zoom icons from `mapboxgl-ctrl-zoom-in` / `-out`). */
  className?: string;
  color?: string;
  opacity?: number;
  disabled?: boolean;
  /** Fade in and out, for "working on it". */
  pulse?: boolean;
};

/**
 * A map's corner buttons (locate, zoom) as ONE Mapbox control: a single rounded box
 * with a hairline between buttons, like Mapbox's own zoom control. Separate controls would be
 * separate boxes, each with its own margin, corners and shadow, and could never line up as one.
 *
 * The control only owns the markup. What each button does is given by `set`, from React effects,
 * so the buttons can come and go (locate only where the map asks for it).
 */
export class MapControlStack implements IControl {
  private el?: HTMLDivElement;
  /**
   * What each button should be. Kept apart from the DOM because Mapbox only calls `onAdd` once the
   * map has the control, which can be after React effects have already registered buttons: those
   * must not be lost, so `onAdd` draws whatever was registered by then.
   */
  private readonly specs = new Map<StackButtonId, StackButton>();
  private readonly buttons = new Map<StackButtonId, HTMLButtonElement>();
  private readonly handlers = new Map<StackButtonId, () => void>();
  private readonly pulses = new Map<StackButtonId, Animation>();

  onAdd() {
    const el = document.createElement("div");
    el.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
    this.el = el;
    this.specs.forEach((spec, id) => this.draw(id, spec));
    return el;
  }

  onRemove() {
    this.pulses.forEach((a) => a.cancel());
    this.pulses.clear();
    this.buttons.clear();
    this.handlers.clear();
    this.el?.remove();
    this.el = undefined;
  }

  /** Adds the button, or updates it if it is already there. Safe to call before the map has the control. */
  set(id: StackButtonId, spec: StackButton) {
    this.specs.set(id, spec);
    this.draw(id, spec);
  }

  private draw(id: StackButtonId, spec: StackButton) {
    const el = this.el;
    if (!el) return;
    let button = this.buttons.get(id);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      // Mapbox's buttons are plain blocks (its icons are background images): lay the content out
      // ourselves so text and svg both sit in the middle.
      button.style.display = "flex";
      button.style.alignItems = "center";
      button.style.justifyContent = "center";
      button.addEventListener("click", () => this.handlers.get(id)?.());
      this.buttons.set(id, button);
    }
    this.handlers.set(id, spec.onPress);
    button.className = spec.className ?? "";
    button.title = spec.label;
    button.setAttribute("aria-label", spec.label);
    button.innerHTML = spec.html;
    button.style.color = spec.color ?? "#111";
    button.style.opacity = spec.opacity === undefined ? "" : String(spec.opacity);
    button.disabled = Boolean(spec.disabled);

    this.pulses.get(id)?.cancel();
    this.pulses.delete(id);
    if (spec.pulse) {
      this.pulses.set(
        id,
        button.animate([{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], {
          duration: 1200,
          iterations: Infinity,
        }),
      );
    }
    this.layout();
  }

  remove(id: StackButtonId) {
    this.specs.delete(id);
    this.pulses.get(id)?.cancel();
    this.pulses.delete(id);
    this.buttons.get(id)?.remove();
    this.buttons.delete(id);
    this.handlers.delete(id);
  }

  /** Keeps the buttons in their fixed order however they were added. */
  private layout() {
    const el = this.el;
    if (!el) return;
    for (const id of ORDER) {
      const button = this.buttons.get(id);
      if (button) el.appendChild(button);
    }
  }
}
