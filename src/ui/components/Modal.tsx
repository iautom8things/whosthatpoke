import { AnimatePresence, motion } from "motion/react";
import { useContext, useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { KeyLayerContext, openKeyLayer, useKeys } from "../../lib/useKeys";
import { Button } from "./Button";
import { cx } from "./cx";
import s from "./Modal.module.css";

export interface ModalProps {
  open: boolean;
  /** Called on Escape or a tap outside, when dismissible. */
  onClose?: () => void;
  title?: ReactNode;
  children?: ReactNode;
  /** Buttons row at the bottom. */
  actions?: ReactNode;
  /** Escape and backdrop tap close it. Default true. */
  dismissible?: boolean;
  /** "dialog" pops in the middle; "sheet" slides up from the bottom. */
  variant?: "dialog" | "sheet";
  className?: string;
}

function Layer({ children }: { children: ReactNode }) {
  const layer = useContext(KeyLayerContext) + 1;
  useEffect(() => openKeyLayer(layer), [layer]);
  return <KeyLayerContext.Provider value={layer}>{children}</KeyLayerContext.Provider>;
}

function Body({ onClose, title, children, actions, dismissible = true, variant = "dialog", className }: Omit<ModalProps, "open">) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useKeys({ Escape: () => dismissible && onClose?.() });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const target = panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current?.querySelector<HTMLElement>("button");
    target?.focus({ preventScroll: true });
    return () => previous?.focus?.({ preventScroll: true });
  }, []);

  const sheet = variant === "sheet";
  return (
    <motion.div
      className={s.scrim}
      data-variant={variant}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onPointerDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose?.();
      }}
    >
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cx(s.panel, className)}
        initial={sheet ? { y: "100%" } : { scale: 0.7, opacity: 0, rotate: -3 }}
        animate={sheet ? { y: 0 } : { scale: 1, opacity: 1, rotate: 0 }}
        exit={sheet ? { y: "100%" } : { scale: 0.85, opacity: 0 }}
        transition={{ type: "spring", stiffness: 520, damping: 30 }}
      >
        {title && (
          <h2 id={titleId} className={cx("wtp-display", s.title)}>
            {title}
          </h2>
        )}
        {children && <div className={s.content}>{children}</div>}
        {actions && <div className={s.actions}>{actions}</div>}
      </motion.div>
    </motion.div>
  );
}

/** In-page dialog or bottom sheet. Keys pressed while it is open never reach the screen behind. */
export function Modal({ open, ...rest }: ModalProps) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <Layer key="modal">
          <Body {...rest} />
        </Layer>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" paints the confirm button red (quit, reset). */
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

/** Yes/no question, the replacement for window.confirm. Focus starts on the safe (cancel) button; Escape cancels. */
export function ConfirmDialog({ open, title, message, confirmLabel = "Yes", cancelLabel = "No", tone = "primary", onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      actions={
        <>
          <Button variant="secondary" size="lg" sfx="back" onPress={onCancel} data-autofocus>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} size="lg" onPress={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message}
    </Modal>
  );
}
