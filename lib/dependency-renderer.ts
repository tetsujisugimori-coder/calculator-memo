import { applyDependencyLabels, prepareDependencyLayout, sanitizeDependencySvg } from './dependency-svg';

let renderSequence = 0;
let rendering: Promise<unknown> = Promise.resolve();
// Mermaid has global configuration. Serialize this app's renders and never use
// bindFunctions or Mermaid click callbacks. Only our validated IDs are interactive.
export function renderDependencyGraph(text: string, ids: string[], cancelled: () => boolean, historical = false) {
  const task = rendering.catch(() => undefined).then(async () => {
    if (cancelled()) return null;
    const { default: mermaid } = await import('mermaid');
    if (cancelled()) return null;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false,
      flowchart: { htmlLabels: false, useMaxWidth: false, wrappingWidth: 600 },
      maxTextSize: 250_000, maxEdges: 256, suppressErrorRendering: true });
    const staging = document.createElement('div');
    staging.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none';
    staging.setAttribute('aria-hidden', 'true');
    document.body.append(staging);
    try {
      const layout = prepareDependencyLayout(text, historical);
      const { svg } = await mermaid.render(`dependencyGraph${++renderSequence}`, layout.text, staging);
      if (cancelled()) return null;
      const clean = sanitizeDependencySvg(svg, ids, document);
      applyDependencyLabels(clean, layout.labels, document);
      return clean;
    } finally { staging.remove(); }
  });
  rendering = task;
  return task;
}

