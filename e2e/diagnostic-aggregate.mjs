// Pure summary of observations; missing values are never treated as zero time.
export function summarizeCase(record) {
  const actions = record.actions || [], samples = record.resourceSamples || [];
  const duration = (start, end) => Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null;
  const total = values => ({ count: values.filter(v => v !== null).length, missing: values.filter(v => v === null).length, sumMs: values.some(v => v !== null) ? values.reduce((n, v) => n + (v ?? 0), 0) : null });
  const dispatch = actions.map(a => duration(a.dispatchStartMs, a.dispatchEndMs));
  const complete = actions.map(a => duration(a.requestMs, a.endMs));
  const browserLike = sample => (sample.resources?.processTree?.processes || []).filter(p => /webkit|playwright|minibrowser/i.test(p.command || ''));
  const expected = Math.ceil(actions.length / 20);
  return {
    actions: actions.length, requestToEnd: total(complete), dispatch: total(dispatch),
    resource: { expectedSamples: expected, samples: samples.length, missingSamples: Math.max(0, expected - samples.length),
      missingProcessTree: samples.filter(s => !Array.isArray(s.resources?.processTree?.processes)).length,
      noBrowserNamedProcess: samples.filter(s => browserLike(s).length === 0).length,
      collection: total(samples.map(s => Number.isFinite(s.resources?.observationDurationMs) ? s.resources.observationDurationMs : null)),
      attribution: 'Name matching is a hint only; visible descendants can be missing, exited, reparented or inaccessible. Raw ticks and RSS cannot prove browser cost per action.' },
    dom: { observations: (record.observations || []).length, expected: record.observe ? 3 : 0 },
  };
}
