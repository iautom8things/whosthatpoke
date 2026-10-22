import { createContext, useContext, useEffect, useRef } from "react";

/**
 * Keyboard layers. Screens listen on layer 0. An open Modal raises the layer, so arrow keys and
 * number keys stop reaching the screen behind it. Only handlers on the top open layer fire.
 */
export const KeyLayerContext = createContext(0);

const openLayers = new Map<number, number>();

function topLayer(): number {
  let top = 0;
  for (const [layer, count] of openLayers) if (count > 0 && layer > top) top = layer;
  return top;
}

/** Marks `layer` as open until the returned function runs. Used by Modal. */
export function openKeyLayer(layer: number): () => void {
  openLayers.set(layer, (openLayers.get(layer) ?? 0) + 1);
  return () => openLayers.set(layer, (openLayers.get(layer) ?? 1) - 1);
}

export type KeyHandler = (event: KeyboardEvent) => void;

export interface UseKeysOptions {
  enabled?: boolean;
  /** Fire again while a key is held down. Default false. */
  allowRepeat?: boolean;
  /** Call preventDefault on handled keys. Default true. */
  preventDefault?: boolean;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (target as HTMLInputElement).type;
  return !["button", "checkbox", "radio", "range", "submit", "reset", "color"].includes(type);
}

/** "Space" is the readable name for " ". Letters match either case. */
function normalize(key: string): string {
  if (key === " ") return "space";
  return key.toLowerCase();
}

/**
 * Global key bindings for the lifetime of the component.
 *
 *   useKeys({
 *     "1|2|3|4": (e) => pick(Number(e.key) - 1),
 *     "ArrowRight|PageDown|Space|Enter": next,
 *     Escape: back,
 *   });
 *
 * Keys are KeyboardEvent.key values, case-insensitive, joined with "|". Ignored while typing in a
 * field, with Ctrl/Meta/Alt held, or when a Modal sits above this component's layer.
 * When two mounted components bind the same key, the one registered first wins (children
 * register before parents).
 */
export function useKeys(map: Record<string, KeyHandler>, options: UseKeysOptions = {}): void {
  const { enabled = true, allowRepeat = false, preventDefault = true } = options;
  const layer = useContext(KeyLayerContext);
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.repeat && !allowRepeat) return;
      if (isTyping(event.target)) return;
      if (layer !== topLayer()) return;
      const key = normalize(event.key);
      for (const [combo, handler] of Object.entries(mapRef.current)) {
        if (combo.split("|").some((k) => normalize(k.trim()) === key)) {
          if (preventDefault) event.preventDefault();
          handler(event);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, allowRepeat, preventDefault, layer]);
}
