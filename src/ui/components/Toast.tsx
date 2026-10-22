import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { cx } from "./cx";
import s from "./Toast.module.css";

export type ToastTone = "info" | "good" | "bad" | "hi";

interface ToastItem {
  id: number;
  message: ReactNode;
  tone: ToastTone;
  icon?: ReactNode;
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
}

/** Shows a short message at the top of the screen. Safe to call from anywhere. Returns a dismiss function. */
export function toast(message: ReactNode, { tone = "info", icon, ms = 2200 }: ToastOptions = {}): () => void {
  const id = nextId++;
  const dismiss = () => useToasts.setState((st) => ({ items: st.items.filter((t) => t.id !== id) }));
  useToasts.setState((st) => ({ items: [...st.items.slice(-2), { id, message, tone, icon }] }));
  window.setTimeout(dismiss, ms);
  return dismiss;
}

/** Renders toasts. Mount once at the app root (App.tsx does). */
export function ToastHost() {
  const items = useToasts((st) => st.items);
  return createPortal(
    <div className={s.host} aria-live="polite" aria-atomic="false">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={cx(s.toast)}
            data-tone={t.tone}
            initial={{ y: -40, opacity: 0, scale: 0.8 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -20, opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 600, damping: 32 }}
          >
            {t.icon && <span className={s.icon}>{t.icon}</span>}
            <span>{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
