import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { cx } from "./cx";
import s from "./Toast.module.css";

export type ToastTone = "info" | "good" | "bad" | "hi";

export type ToastPlace = "top" | "bottom";

interface ToastItem {
  id: number;
  /** React key: the caller's key, or one of its own. */
  key: string;
  message: ReactNode;
  tone: ToastTone;
  icon?: ReactNode;
  place: ToastPlace;
}

interface ToastState {
  items: ToastItem[];
}

const useToasts = create<ToastState>(() => ({ items: [] }));
let nextId = 1;

export interface ToastOptions {
  tone?: ToastTone;
  icon?: ReactNode;
  /** How long it stays, ms. Default 2200. */
  ms?: number;
  /** Default "top". "bottom" keeps a long hint off the top HUD (score, progress, menu pills). */
  place?: ToastPlace;
  /** A toast with the same key takes over the one on screen in place, so fast repeats never stack. */
  key?: string;
}

/** Shows a short message at the top (or bottom) of the screen. Safe to call from anywhere. Returns a dismiss function. */
export function toast(message: ReactNode, { tone = "info", icon, ms = 2200, place = "top", key }: ToastOptions = {}): () => void {
  const id = nextId++;
  const item: ToastItem = { id, key: key ?? `toast-${id}`, message, tone, icon, place };
  // Filtered by id, so the timer of a toast that was taken over leaves its successor alone.
  const dismiss = () => useToasts.setState((st) => ({ items: st.items.filter((t) => t.id !== id) }));
  useToasts.setState((st) => {
    const at = key === undefined ? -1 : st.items.findIndex((t) => t.key === key);
    if (at < 0) return { items: [...st.items.slice(-2), item] };
    const items = st.items.slice();
    items[at] = item;
    return { items };
  });
  window.setTimeout(dismiss, ms);
  return dismiss;
}

const PLACES: ToastPlace[] = ["top", "bottom"];

/** Renders toasts. Mount once at the app root (App.tsx does). */
export function ToastHost() {
  const items = useToasts((st) => st.items);
  return createPortal(
    PLACES.map((place) => {
      // Slides in from its own edge.
      const from = place === "top" ? -1 : 1;
      return (
        <div key={place} className={s.host} data-place={place} aria-live="polite" aria-atomic="false">
          <AnimatePresence initial={false}>
            {items
              .filter((t) => t.place === place)
              .map((t) => (
                <motion.div
                  key={t.key}
                  layout
                  className={cx(s.toast)}
                  data-tone={t.tone}
                  initial={{ y: from * 40, opacity: 0, scale: 0.8 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ y: from * 20, opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 600, damping: 32 }}
                >
                  {t.icon && <span className={s.icon}>{t.icon}</span>}
                  <span>{t.message}</span>
                </motion.div>
              ))}
          </AnimatePresence>
        </div>
      );
    }),
    document.body,
  );
}
