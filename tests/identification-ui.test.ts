// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { IdentificationSettings } from '../components/Identification';

it('keeps the native default option short and its responsive meaning visibly described without changing settings', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); const onChange = vi.fn();
  try {
    await act(async () => root.render(createElement(IdentificationSettings, { onChange })));
    const select = host.querySelector('select')!;
    expect(select.selectedOptions[0].textContent).toBe('初期設定'); expect(select.value).toBe('');
    const explanation = document.getElementById(select.getAttribute('aria-describedby')!);
    expect(explanation?.textContent).toBe('初期設定では画面幅に合わせて識別表示を選びます。');
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => { select.value = 'labels'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('labels');
    await act(async () => root.render(createElement(IdentificationSettings, { mode: 'labels', onChange })));
    expect(select.value).toBe('labels'); expect(select.hasAttribute('aria-describedby')).toBe(false); expect(host.querySelector('small')).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
