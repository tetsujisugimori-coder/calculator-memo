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
  function emitObservation(record) {
    try { emit(record); }
    catch (error) { console.error('NOT_OBSERVABLE tap frame evidence write failed:', String(error)); }
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
    async beginTapFrames(locator) {
      const started = performance.now();
      try { await locator.evaluate(element => {
        const record = { started: performance.now(), initialVisibility: document.visibilityState, samples: [], lifecycle: [], stopped: false, truncated: false };
        globalThis.__wkDiagnosticTapFrames = record;
        const onVisibility = () => { if (record.lifecycle.length < 100) record.lifecycle.push({ event: 'visibilitychange', at: performance.now(), visibility: document.visibilityState }); else { record.truncated = true; record.stop(); } };
        document.addEventListener('visibilitychange', onVisibility);
        const sample = timestamp => {
          if (record.stopped) return;
          if (record.samples.length >= 1200 || performance.now() - record.started > 10000) { record.truncated = true; record.stop(); return; }
          const begin = performance.now();
          const rect = element.getBoundingClientRect();
          const end = performance.now();
          record.samples.push({ timestamp, begin, rectMs: end - begin, connected: element.isConnected, visibility: document.visibilityState, x: rect.x, y: rect.y, width: rect.width, height: rect.height });
          record.raf = requestAnimationFrame(sample);
        };
        record.stop = () => { record.stopped = true; cancelAnimationFrame(record.raf); document.removeEventListener('visibilitychange', onVisibility); };
        record.raf = requestAnimationFrame(sample);
      }); } catch (error) { emitObservation({ event: 'tap-frame-observer-error', phase: 'begin', result: 'NOT_OBSERVABLE', error: String(error), state: state() }); }
      finally { emitObservation({ event: 'tap-frame-observer-cost', phase: 'begin', durationMs: performance.now() - started, state: state() }); }
    },
    async endTapFrames(page) {
      const started = performance.now();
      try { const record = await page.evaluate(() => {
        const record = globalThis.__wkDiagnosticTapFrames;
        if (!record) return { missing: true };
        record.stop();
        const { stop, raf, ...value } = record;
        delete globalThis.__wkDiagnosticTapFrames;
        return { ...value, ended: performance.now() };
      });
      emitObservation({ event: 'tap-frames', observerOnly: true, state: state(), record });
      } catch (error) { emitObservation({ event: 'tap-frame-observer-error', phase: 'end', result: 'NOT_OBSERVABLE', error: String(error), state: state() }); }
      finally { emitObservation({ event: 'tap-frame-observer-cost', phase: 'end', durationMs: performance.now() - started, state: state() }); }
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
