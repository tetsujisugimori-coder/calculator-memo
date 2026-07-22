"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

const modalStack: symbol[] = [];

function isTopModal(token: symbol): boolean {
  return modalStack.at(-1) === token;
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const titleId = `${useId()}-modal-title`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const modalToken = useRef(Symbol("modal"));

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const token = modalToken.current;
    modalStack.push(token);
    restoreFocus.current = document.activeElement as HTMLElement;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>("button, input, textarea, select")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (!isTopModal(token)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
        return;
      }
      if (event.key === "Tab" && dialog) {
        const items = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input, textarea, select")];
        if (!items.length) return;
        const first = items[0];
        const last = items.at(-1)!;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      const index = modalStack.lastIndexOf(token);
      if (index >= 0) modalStack.splice(index, 1);
      restoreFocus.current?.focus();
    };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
        <header className="modal-header">
          <div><span className="eyebrow">CALCULATION MEMO</span><h2 id={titleId}>{title}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="閉じる">×</button>
        </header>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
}
