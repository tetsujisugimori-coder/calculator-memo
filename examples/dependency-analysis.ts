/** Synthetic, read-only example: npx --no-install vite-node --config vitest.config.ts examples/dependency-analysis.ts */
import { analyzeDependencyImpact } from '../lib/dependency-analysis';
import { toMermaid } from '../lib/dependency-mermaid';
import type { CalculationMemoBlock } from '../lib/types';

const block = (id: string, expression: string, evaluationMode?: string): CalculationMemoBlock => ({
  id, type: 'calculation', expression, displayExpression: expression,
  result: null, resultText: '', error: null, ...(evaluationMode ? { evaluationMode } : {}),
});
const before: CalculationMemoBlock[] = [
  block('source', 'x=2', 'note-variables'),
  block('unrelated', '99'),
  block('consumer', 'y=x*2', 'note-variables'),
  { ...block('final', '@{1}+1', 'block-references'), references: { version: 1, entries: [{ slot: 1, blockId: 'consumer' }] } },
];
const after = before.map(b => b.id === 'source' ? { ...b, expression: 'x=4' } : b);
const impact = analyzeDependencyImpact(before, after);
console.error(JSON.stringify({ changedIds: impact.changedIds, affectedIds: impact.affectedIds, uncertainIds: impact.uncertainIds }));
console.log(toMermaid(impact.after, { changedIds: new Set(impact.changedIds), affectedIds: new Set(impact.affectedIds) }));
