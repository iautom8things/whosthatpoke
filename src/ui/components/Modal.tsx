import { AnimatePresence, motion } from "motion/react";
import { useContext, useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { holdInert } from "../../lib/inert";
import { KeyLayerContext, openKeyLayer, useKeys } from "../../lib/useKeys";
import { Button } from "./Button";
import { cx } from "./cx";
import { IconBack, IconCheck, IconPlay, IconX } from "./icons";
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

function focusVisible(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return false; // Safari before 15.4 has no :focus-visible.
  }
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
    // Hand focus back on close only to a keyboard user. After a tap or click the opener (the quit X)
    // would keep focus, and the next Space would press it and open the dialog again.
    const previous = document.activeElement as HTMLElement | null;
    const restore = previous && focusVisible(previous) ? previous : null;
    const target = panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current?.querySelector<HTMLElement>("button");
    target?.focus({ preventScroll: true });
    // The app behind is inert, so Tab, VoiceOver and Enter cannot reach the buttons under the
    // scrim. The portal sits outside #root, so the dialog itself stays live.
    const root = document.getElementById("root");
    const releaseRoot = root ? holdInert(root) : () => {};
    return () => {
      releaseRoot();
      restore?.focus({ preventScroll: true });
    };
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
  /**
   * "danger" (quit, reset): the safe cancel becomes the big bright button and the risky confirm
   * an outlined one, so a kid who opened it by accident taps the inviting button and keeps going.
   */
  tone?: "primary" | "danger";
  /** Icons for kids who cannot read yet. Default: a play arrow (danger) or back arrow on cancel, X (danger) or check on confirm. */
  cancelIcon?: ReactNode;
  confirmIcon?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Yes/no question, the replacement for window.confirm. Focus starts on the safe (cancel) button; Escape cancels. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Yes",
  cancelLabel = "No",
  tone = "primary",
  cancelIcon,
  confirmIcon,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const danger = tone === "danger";
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      className={s.confirm}
      actions={
        <>
          <Button
            variant={danger ? "primary" : "secondary"}
            size="lg"
            sfx="back"
            icon={cancelIcon ?? (danger ? <IconPlay /> : <IconBack />)}
            onPress={onCancel}
            data-autofocus
          >
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "ghost" : "primary"}
            size="lg"
            icon={confirmIcon ?? (danger ? <IconX /> : <IconCheck />)}
            className={danger ? s.risky : undefined}
            onPress={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message}
    </Modal>
  );
}
