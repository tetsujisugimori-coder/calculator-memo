"use client";

import { useRef } from "react";

/**
 * Own the Space press/release pair instead of relying on the UA's transient
 * pointer :active state. Chromium's mixed touch/keyboard path can clear that
 * state before keyup while this same button remains focused and connected.
 * Enter, pointer and assistive-technology clicks still use the native button.
 */
export function SelectionCandidateButton({ selected, onToggle }: { selected: boolean; onToggle: () => void }) {
  const pressed = useRef<HTMLButtonElement | null>(null);
  return <button type="button" className="button-secondary" aria-pressed={selected}
    onClick={onToggle}
    onBlur={() => { pressed.current = null; }}
    onKeyDown={event => {
      if (event.defaultPrevented || event.key !== " " || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      if (!event.repeat) pressed.current = event.currentTarget;
    }}
    onKeyUp={event => {
      if (event.key !== " ") return;
      const button = pressed.current;
      pressed.current = null;
      if (event.defaultPrevented) return;
      // Prevent a second native activation, including an unmatched release.
      event.preventDefault();
      if (button === event.currentTarget && button.isConnected && !button.disabled &&
          document.activeElement === button && !event.altKey && !event.ctrlKey && !event.metaKey) {
        // Preserve the one click -> one toggle path. This application-generated
        // click follows a trusted key pair; it is not a second browser click.
        button.click();
      }
    }}
  >{selected ? "候補から解除" : "復元候補に選択"}</button>;
}
