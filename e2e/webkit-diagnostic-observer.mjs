// Diagnostic only: no application writes and no replacement of formal acceptance.
import { appendFileSync, writeFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';

export function observer(directory, fixture = null) {
  const scope = new AsyncLocalStorage();
  let state = () => ({}), serial = 0, ioMs = 0;
  function emit(record) {
    const started = performance.now();
    appendFileSync(directory + '/operations.ndjson', JSON.stringify({ utc: new Date().toISOString(), monotonicMs: started, ...record }) + '\n');
    ioMs += performance.now() - started;
  }
  return {
    fixture,
    bind(readState) { state = readState; },
    captureFixture(value) {
      const raw = JSON.stringify(value);
      writeFileSync(directory + '/comparison-fixture.json', raw + '\n');
      emit({ event: 'fixture', bytes: Buffer.byteLength(raw), sha256: createHash('sha256').update(raw).digest('hex'), state: state() });
    },
    async captureScreen(page) {
      const started = performance.now();
      const screen = await page.evaluate(() => ({
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        localStorageRaw: Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])),
        sessionStorageRaw: Object.fromEntries(Object.keys(sessionStorage).map(key => [key, sessionStorage.getItem(key)])),
        controls: [...document.querySelectorAll('input,textarea,select')].map(e => ({ tag: e.tagName, id: e.id, name: e.name, label: e.getAttribute('aria-label'), value: e.value, checked: e.checked,
          selectionStart: e.selectionStart, selectionEnd: e.selectionEnd, selectionDirection: e.selectionDirection, selectedIndex: e.selectedIndex })),
        activeElement: document.activeElement ? { tag: document.activeElement.tagName, id: document.activeElement.id, role: document.activeElement.getAttribute('role'), label: document.activeElement.getAttribute('aria-label'), text: document.activeElement.textContent?.slice(0, 500) } : null,
        selectedControls: [...document.querySelectorAll('[aria-selected],[aria-pressed],[aria-current]')].map(e => ({ tag: e.tagName, id: e.id, text: e.textContent, selected: e.getAttribute('aria-selected'), pressed: e.getAttribute('aria-pressed'), current: e.getAttribute('aria-current') })),
        scroll: { x: scrollX, y: scrollY },
        dialogs: [...document.querySelectorAll('[role=dialog]')].map(e => ({ visible: e.getBoundingClientRect().width > 0, text: e.innerText, scrollTop: e.scrollTop, scrollLeft: e.scrollLeft })),
        modalContents: [...document.querySelectorAll('.modal-content')].map(e => ({ scrollTop: e.scrollTop, scrollLeft: e.scrollLeft, clientWidth: e.clientWidth, scrollWidth: e.scrollWidth })),
        details: [...document.querySelectorAll('details')].map(e => ({ open: e.open, summary: e.querySelector('summary')?.textContent })),
        domElements: document.querySelectorAll('*').length,
        reactAcquisitionGeneration: 'NOT_OBSERVABLE through public DOM; no React state mutation/introspection',
      }));
      writeFileSync(directory + '/comparison-start-screen.json', JSON.stringify(screen, null, 2) + '\n');
      emit({ event: 'screen-capture', observerOnly: true, durationMs: performance.now() - started, state: state() });
    },
    async awaited(operation, location) {
      const id = ++serial, parent = scope.getStore() ?? null, started = performance.now();
      emit({ event: 'begin', id, parent, location: JSON.parse(location), state: state() });
      return scope.run(id, async () => {
        try {
          const result = await operation();
          emit({ event: 'end', id, durationMs: performance.now() - started, observerIoMs: ioMs, state: state() });
          return result;
        } catch (error) {
          emit({ event: 'error', id, durationMs: performance.now() - started, error: String(error.stack || error), state: state() });
          throw error;
        }
      });
    },
  };
}
