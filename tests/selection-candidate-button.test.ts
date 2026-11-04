// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { SelectionCandidateButton } from '../components/SelectionCandidateButton';
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
const toggled = vi.fn();
function Fixture() { const [selected, setSelected] = useState(false); return createElement(SelectionCandidateButton, { selected, onToggle: () => { toggled(); setSelected(value => !value); } }); }
const button = () => host.querySelector('button')!;
async function key(type: 'keydown' | 'keyup', options: KeyboardEventInit = {}) { const e = new KeyboardEvent(type, { key: ' ', bubbles: true, cancelable: true, ...options }); await act(async () => button().dispatchEvent(e)); return e; }
beforeEach(async () => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); toggled.mockClear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); await act(async () => root.render(createElement(Fixture))); button().focus(); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it('owns one Space pair and routes one click, with selection and removal retaining the same node/focus', async () => {
  const original = button();
  for (const selected of ['true', 'false']) {
    const before = toggled.mock.calls.length;
    expect((await key('keydown')).defaultPrevented).toBe(true);
    expect(toggled).toHaveBeenCalledTimes(before);
    expect((await key('keyup')).defaultPrevented).toBe(true);
    expect(toggled).toHaveBeenCalledTimes(before + 1);
    expect(button().getAttribute('aria-pressed')).toBe(selected);
    expect(button()).toBe(original); expect(document.activeElement).toBe(original);
  }
});
it('repeat down cannot produce repeated activation and unmatched up/repeat cannot arm', async () => {
  await key('keyup'); await key('keydown', { repeat: true }); await key('keyup'); expect(toggled).not.toHaveBeenCalled();
  await key('keydown'); await key('keydown', { repeat: true }); await key('keydown', { repeat: true }); await key('keyup'); await key('keyup'); expect(toggled).toHaveBeenCalledTimes(1);
});
it('blur cancels a held key even when focus returns before release', async () => {
  await key('keydown'); button().blur(); button().focus(); await key('keyup'); expect(toggled).not.toHaveBeenCalled();
});
it('replacement/unmount cannot transfer an armed press to a new node', async () => {
  await key('keydown'); const old = button(); await act(async () => root.render(createElement(Fixture, { key: 'replacement' }))); button().focus(); await key('keyup'); expect(button()).not.toBe(old); expect(toggled).not.toHaveBeenCalled();
});
it('does not activate when disabled before release', async () => {
  await key('keydown'); button().disabled = true; await key('keyup'); expect(toggled).not.toHaveBeenCalled();
});
it.each(['altKey', 'ctrlKey', 'metaKey'] as const)('does not arm or activate modified Space (%s)', async modifier => {
  expect((await key('keydown', { [modifier]: true })).defaultPrevented).toBe(false); await key('keyup', { [modifier]: true }); expect(toggled).not.toHaveBeenCalled();
});
it('leaves Enter untouched and keeps native click available', async () => {
  expect((await key('keydown', { key: 'Enter' })).defaultPrevented).toBe(false);
  expect((await key('keyup', { key: 'Enter' })).defaultPrevented).toBe(false);
  await act(async () => button().click()); expect(toggled).toHaveBeenCalledTimes(1);
});

it('honors cancelled key input rather than overriding an earlier handler', async () => {
  const cancel = (event: Event) => event.preventDefault();
  button().addEventListener('keydown', cancel, true); await key('keydown'); await key('keyup'); expect(toggled).not.toHaveBeenCalled();
  button().removeEventListener('keydown', cancel, true); await key('keydown'); button().addEventListener('keyup', cancel, true); await key('keyup'); expect(toggled).not.toHaveBeenCalled();
});
