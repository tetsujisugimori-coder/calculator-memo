import { inspectPreviewReferences, parseSelectionCurrent, samePreviewStructure, type PreviewDocument, type PreviewItem, type PreviewReference } from './selection-preview';
import { parseStrictJson, validateRestoreRaw, type RestoreCounts } from './restore-validation';

export const PLAN_RULE_VERSION = 1;
export const MAX_PLAN_SELECTION = 200;
const MAX_PLAN_REFERENCES = 20000;
export type PlanStatus = 'PASS' | 'BLOCKED' | 'UNKNOWN' | 'STALE';
export type PlanOperation = 'ADD' | 'REPLACE' | 'UNCHANGED' | 'BLOCKED' | 'UNKNOWN' | 'STALE';
export type PlanReference = {
  namespace: 'backup' | 'current' | 'after'; source: string; target: string;
  status: 'FOUND' | 'MISSING' | 'AMBIGUOUS' | 'UNSUPPORTED' | 'UNPARSEABLE' | 'UNKNOWN';
  message: string; targetIdentity?: string;
};
export type PlanItem = {
  key: string; category: PreviewItem['category'] | null; id: string | null; scope: string | null;
  backupIdentity: string | null; currentIdentities: string[]; operation: PlanOperation;
  proposedOperation: 'ADD' | 'REPLACE' | 'UNCHANGED' | null; collision: boolean;
  difference: string; reasons: string[]; blockedReasons: string[]; unknowns: string[];
  references: PlanReference[]; coveredBy: string | null;
  before: unknown; after: unknown;
};
export type RestorePlan = {
  ruleVersion: number; status: PlanStatus; executionAllowed: false;
  items: PlanItem[]; reasons: string[]; references: PlanReference[];
  counts: { selected: number; add: number; replace: number; unchanged: number; blocked: number; unknown: number; missingReferences: number | null; unknownReferences: number | null };
  candidate: { status: PlanStatus; data: unknown | null; before: RestoreCounts | null; after: RestoreCounts | null; message: string };
  lexical: { status: 'PASS' | 'BLOCKED' | 'UNKNOWN'; currentRoundTripChanges: boolean | null; unselectedRepresentation: 'UNCHANGED' | 'NOT_PROVEN'; message: string };
};
type Input = { backup: PreviewDocument; current: PreviewDocument | null; selectedKeys: readonly string[]; availability?: 'ready' | 'stale' | 'read-error' | 'invalid' | 'unacquired'; blockedReason?: string };
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Existing readers preserve opaque metadata. A version-1 shape alone does not
 * prove that nested future fields contain no references. Never certify them. */
function planReferences(item: PreviewItem, doc: PreviewDocument): PreviewReference[] {
  const refs = [...inspectPreviewReferences(item, doc)];
  const check = (v: unknown, fields: readonly string[], path: string) => {
    if (!object(v)) return;
    for (const key of Object.keys(v)) if (!fields.includes(key)) refs.push({ namespace: doc.namespace, status: 'unsupported', target: `${item.key}/${path}/${key}`, message: '入れ子の未知フィールドの参照意味は未対応です。正常として補完しません。' });
  };
  const value = item.value; if (!object(value)) return refs;
  if (item.category === 'history') check(value.formulaExecution, ['formulaId','title','expression','inputs'], 'formulaExecution');
  if (item.category === 'notes') {
    check(value.calculationPolicy, ['version','mode'], 'calculationPolicy');
    check(value.calculationEvidence, ['version','records'], 'calculationEvidence');
  }
  if (item.category === 'notes' || item.category === 'evidence') if (Array.isArray(value.blocks)) for (const [index, block] of value.blocks.entries()) {
    check(block, item.category === 'evidence' ? ['blockId','position','expression','evaluationMode','references','inputs','result','resultText','status'] : ['id','type','content','latex','expression','displayExpression','result','resultText','error','evaluationMode','references','evaluationState'], `blocks/${index}`);
    if (!object(block)) continue;
    check(block.evaluationState, ['version','status','signature','attemptError'], `blocks/${index}/evaluationState`);
    check(block.references, ['version','entries'], `blocks/${index}/references`);
    if (object(block.references) && Array.isArray(block.references.entries)) for (const [i, entry] of block.references.entries.entries()) check(entry, ['slot','blockId'], `blocks/${index}/references/${i}`);
    if (Array.isArray(block.inputs)) for (const [i, input] of block.inputs.entries()) check(input, ['kind','name','sourceBlockId','value'], `blocks/${index}/inputs/${i}`);
  }
  return refs;
}
const ordinarySettings = (item: PreviewItem) => item.key === 'settings' && object(item.value) && Object.keys(item.value).every(key => ['theme','activePanel','identificationMode'].includes(key));

/** Display-only hypothetical encoding. Never a storage payload. Preserve -0 for
 * structural validation; source whitespace, key/number spellings remain separate. */
function hypotheticalJson(v: unknown): string {
  if (Object.is(v, -0)) return '-0';
  if (Array.isArray(v)) return `[${v.map(hypotheticalJson).join(',')}]`;
  if (object(v)) return `{${Object.entries(v).map(([k, value]) => `${JSON.stringify(k)}:${hypotheticalJson(value)}`).join(',')}}`;
  return JSON.stringify(v);
}
function collection(root: Record<string, unknown>, category: PreviewItem['category']): unknown[] | null {
  if (category === 'history' || category === 'notes') return Array.isArray(root[category]) ? root[category] as unknown[] : null;
  if (category === 'executions') {
    if (root.formulaExecutions === undefined) root.formulaExecutions = [];
    return Array.isArray(root.formulaExecutions) ? root.formulaExecutions : null;
  }
  const field = category === 'formulas' ? 'formulaLibrary' : category === 'reports' ? 'formulaReports' : null;
  if (!field) return null;
  if (root[field] === undefined) root[field] = { version: 1, entries: [], ...(category === 'formulas' ? { selectedId: null } : {}) };
  const v = root[field];
  return object(v) && v.version === 1 && Array.isArray(v.entries) ? v.entries : null;
}

/** Pure, bounded diagnostics. No persistence, preservation, expression evaluation,
 * approval, ID allocation, snapshot regeneration or automatic dependency selection. */
export function generateRestorePlan(input: Input): RestorePlan {
  const { backup, current, selectedKeys } = input;
  const indexes = new Map<PreviewDocument, Map<string, PreviewItem[]>>();
  const group = (doc: PreviewDocument, identity: string | null): PreviewItem[] => {
    if (identity === null) return [];
    let index = indexes.get(doc);
    if (!index) { index = new Map(); for (const item of doc.items) if (item.identity) { const values = index.get(item.identity) ?? []; values.push(item); index.set(item.identity, values); } indexes.set(doc, index); }
    return index.get(identity) ?? [];
  };
  const plan: RestorePlan = {
    ruleVersion: PLAN_RULE_VERSION, status: 'UNKNOWN', executionAllowed: false, items: [], reasons: [], references: [],
    counts: { selected: selectedKeys.length, add: 0, replace: 0, unchanged: 0, blocked: 0, unknown: 0, missingReferences: null, unknownReferences: null },
    candidate: { status: 'UNKNOWN', data: null, before: null, after: null, message: '仮構築は未検証です。' },
    lexical: { status: 'UNKNOWN', currentRoundTripChanges: null, unselectedRepresentation: 'NOT_PROVEN', message: '原文字句保持は未検証です。' },
  };
  const stale = input.availability === 'stale';
  const usable = (input.availability ?? 'ready') === 'ready' && current !== null;
  if (selectedKeys.length > MAX_PLAN_SELECTION) { plan.status = 'BLOCKED'; plan.reasons.push('選択上限200件を超えています。切り捨てて計画しません。'); return plan; }
  const counts = new Map<string, number>(); for (const key of selectedKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const key of selectedKeys) {
    const found = backup.items.filter(v => v.key === key); const item = found.length === 1 ? found[0] : null;
    const targets = item && current ? group(current, item.identity) : [];
    const row: PlanItem = { key, category: item?.category ?? null, id: item?.id ?? null, scope: item?.scope ?? null, backupIdentity: item?.identity ?? null, currentIdentities: targets.map(v => v.identity!), operation: 'UNKNOWN', proposedOperation: null, collision: false, difference: '内容を比較できません。', reasons: [], blockedReasons: [], unknowns: [], references: [], coveredBy: null, before: targets.length === 1 ? targets[0].value : null, after: item?.value ?? null };
    plan.items.push(row);
    if (stale) { row.operation = 'STALE'; row.reasons.push('比較・選択・計画の前提が失効しています。'); continue; }
    if (!item) { row.blockedReasons.push('バックアップ内の選択キーを一意に同定できません。'); }
    else {
      if (counts.get(key)! > 1) row.blockedReasons.push('同一項目が複数回選択されています。');
      if (!item.identity || item.id === null) row.unknowns.push('独立した識別子がない、または設定・未知領域です。');
      if (group(backup, item.identity).length > 1 || targets.length > 1) { row.collision = true; row.blockedReasons.push('同一種別・親スコープ内でIDが重複しています。'); }
      if (usable && item.identity && targets.length <= 1 && group(backup, item.identity).length === 1) {
        row.proposedOperation = !targets.length ? 'ADD' : samePreviewStructure(item.value, targets[0].value) ? 'UNCHANGED' : 'REPLACE';
        row.collision ||= row.proposedOperation === 'REPLACE';
        row.difference = !targets.length ? '現在側に対応IDなし。追加候補。' : row.proposedOperation === 'UNCHANGED' ? '全フィールドの構造・値が一致（原文字句一致とは別）。' : `同一IDの内容差異。上書き候補。差異フィールド: ${object(item.value) && object(targets[0].value) ? [...new Set([...Object.keys(item.value), ...Object.keys(targets[0].value)])].filter(k => !samePreviewStructure((item.value as Record<string, unknown>)[k], (targets[0].value as Record<string, unknown>)[k])).join(', ') : '全体'}`;
      }
      if (item.category === 'other') row.unknowns.push('設定・その他の独立統合規則は未対応です。');
      if (item.validation !== 'valid' || backup.validation !== 'valid' || current?.validation !== 'valid') row.unknowns.push('原文/数値/項目の完全な検証を確認できません。');
      if ((item.category === 'evidence' || item.category === 'confirmations') && row.proposedOperation !== 'UNCHANGED') {
        const parentCategory = item.category === 'evidence' ? 'notes' : 'reports';
        const parents = backup.items.filter(p => p.category === parentCategory && p.id === item.scope);
        if (parents.length === 1 && selectedKeys.includes(parents[0].key)) { row.coveredBy = parents[0].key; row.reasons.push('選択した親全体に含まれます。子への独立変更は行いません。'); }
        else row.blockedReasons.push('子項目だけの変更は親を安全に変更できないため禁止です。親を自動選択しません。');
      }
    }
    if (!usable) row.unknowns.push(`現在原文の取得/比較を確認できません: ${input.availability ?? 'unacquired'}`);
    if (input.blockedReason) row.blockedReasons.push(input.blockedReason);
    row.operation = row.blockedReasons.length ? 'BLOCKED' : row.unknowns.length ? 'UNKNOWN' : row.proposedOperation ?? 'UNKNOWN';
    row.reasons.push('ADD/REPLACEは実行許可ではありません。');
  }
  if (stale) { plan.status = 'STALE'; plan.reasons.push('明示的な再取得・再生成が必要です。'); return plan; }
  if (!selectedKeys.length) plan.reasons.push('選択項目がありません。事前検証PASSにしません。');
  let candidateDoc: PreviewDocument | null = null;
  const changed = plan.items.some(row => row.proposedOperation === 'ADD' || row.proposedOperation === 'REPLACE');
  if (usable && current && current.raw !== null) {
    const before = validateRestoreRaw(current.raw); plan.candidate.before = before.ok ? before.counts : null;
    try {
      const root = parseStrictJson(current.raw);
      if (!object(root) || current.validation !== 'valid' || backup.validation !== 'valid') throw Error('入力原文の構造・数値を完全検証できません。');
      plan.lexical.currentRoundTripChanges = hypotheticalJson(root) !== current.raw;
      // A blocked row is never quietly dropped to claim a successful full candidate.
      if (plan.items.some(row => row.operation === 'BLOCKED' || row.operation === 'UNKNOWN')) throw Error('禁止/不明項目を含むため、全選択どおりの候補は構築できません。');
      for (const row of plan.items) {
        if (row.coveredBy || row.proposedOperation === 'UNCHANGED') continue;
        const source = backup.items.find(item => item.key === row.key)!;
        const values = collection(root, source.category);
        if (!values) throw Error('復元先collectionを安全に仮構築できません。');
        const match = (v: unknown) => object(v) && (source.category === 'executions' ? v.formulaId : v.id) === source.id;
        const index = values.findIndex(match);
        if (source.category === 'reports' && object(source.value) && values.some(v => object(v) && v.formulaId === (source.value as Record<string, unknown>).formulaId && v.id !== source.id)) { row.collision = true; row.blockedReasons.push('別レポートIDが同じ登録式の保存先を変更します。自動結合しません。'); }
        if (row.proposedOperation === 'REPLACE' && index < 0 || row.proposedOperation === 'ADD' && index >= 0) throw Error('復元先の同定が一致しません。');
        // Values only enter a private parsed root; backup object is never mutated.
        const cloned = parseStrictJson(hypotheticalJson(source.value));
        if (index < 0) values.push(cloned); else values[index] = cloned;
      }
      const text = changed ? hypotheticalJson(root) : current.raw;
      const checked = validateRestoreRaw(text); if (!checked.ok) { plan.candidate.status = 'BLOCKED'; throw Error(`仮構築後の保存形式検証失敗: ${checked.message}`); }
      const parsed = parseSelectionCurrent(text); if (!parsed.ok || parsed.preview.validation !== 'valid') throw Error('仮構築後の解析上限/数値/項目を完全検証できません。');
      candidateDoc = parsed.preview;
      plan.candidate = { status: 'PASS', data: root, before: plan.candidate.before, after: checked.counts, message: 'メモリ上の候補は保存形式version 1の構造検証に適合。保存可否とは別です。' };
    } catch (cause) { plan.candidate.message = cause instanceof Error ? cause.message : '仮構築を確認できません。'; }
  } else plan.candidate.message = current?.raw === null ? '現在保存キーがありません。設定・versionを推測生成せず仮構築を停止します。' : '現在原文を取得・検証できません。';
  plan.lexical = { ...plan.lexical, status: changed ? 'BLOCKED' : candidateDoc ? 'PASS' : 'UNKNOWN', unselectedRepresentation: !changed && candidateDoc ? 'UNCHANGED' : 'NOT_PROVEN', message: changed ? '原文を損失なく部分変更する方式が未確立です。未選択領域の空白・キー順・未知フィールド・数値字句保持を認定できず、次段階の実行はBLOCKED。' : candidateDoc ? '変更不要のため取得原文をそのまま保持。再直列化して保存しません。' : '原文保持能力を確認できません。' };

  let referencesComplete = true;
  const append = (item: PreviewItem, doc: PreviewDocument, namespace: PlanReference['namespace'], expected?: PreviewDocument) => {
    if (plan.references.length >= MAX_PLAN_REFERENCES) { referencesComplete = false; return; }
    for (const ref of planReferences(item, doc)) {
      if (plan.references.length >= MAX_PLAN_REFERENCES) { referencesComplete = false; break; }
      const result: PlanReference = { ...ref, namespace, source: item.identity ?? item.key, status: ref.status.toUpperCase() as Uppercase<PreviewReference['status']> };
      if (namespace === 'after' && ref.targetIdentity && ref.status === 'found' && expected) {
        const from = group(expected, ref.targetIdentity), to = group(doc, ref.targetIdentity);
        if (from.length !== 1 || to.length !== 1 || from[0].validation !== 'valid' || !samePreviewStructure(from[0].value, to[0].value)) { result.status = 'UNKNOWN'; result.message = 'IDは存在しますが、出典側と参照先の内容・意味の同一性を確認できません。'; }
      }
      plan.references.push(result);
    }
  };
  for (const item of backup.items) if (!ordinarySettings(item) || selectedKeys.includes(item.key)) append(item, backup, 'backup');
  if (current) for (const item of current.items) if (!ordinarySettings(item) || selectedKeys.includes(item.key)) append(item, current, 'current');
  if (candidateDoc && current) for (const item of candidateDoc.items) {
    // Ordinary known settings have no structured references. Unknown top-level
    // fields are not silently treated as supported.
    if (ordinarySettings(item)) continue;
    const selected = plan.items.some(row => row.backupIdentity === item.identity || item.category === 'evidence' && row.category === 'notes' && row.id === item.scope || item.category === 'confirmations' && row.category === 'reports' && row.id === item.scope);
    append(item, candidateDoc, 'after', selected ? backup : current);
  }
  if (!referencesComplete) plan.reasons.push('参照検査上限20,000件。切り捨てた件数を正常0件としません。');
  for (const row of plan.items) {
    row.references = plan.references.filter(ref => ref.source === (row.backupIdentity ?? row.key));
    const after = row.references.filter(ref => ref.namespace === 'after');
    if (after.some(ref => ['MISSING', 'AMBIGUOUS'].includes(ref.status))) row.blockedReasons.push('復元後候補の参照先が欠落または曖昧です。');
    if (after.some(ref => ['UNKNOWN', 'UNSUPPORTED', 'UNPARSEABLE'].includes(ref.status))) row.unknowns.push('復元後の参照関係を完全検証できません。');
    if (row.coveredBy) { const parent = plan.items.find(p => p.key === row.coveredBy); if (!parent || ['BLOCKED', 'UNKNOWN'].includes(parent.operation)) row.blockedReasons.push('依存する親項目が禁止/不明です。'); }
    if (row.blockedReasons.length) row.operation = 'BLOCKED'; else if (row.unknowns.length) row.operation = 'UNKNOWN';
  }
  const post = plan.references.filter(ref => ref.namespace === 'after');
  const referenceBlocked = post.some(ref => ['MISSING', 'AMBIGUOUS'].includes(ref.status));
  const referenceUnknown = !referencesComplete || !candidateDoc || post.some(ref => ['UNKNOWN', 'UNSUPPORTED', 'UNPARSEABLE'].includes(ref.status));
  if (referenceBlocked) plan.reasons.push('未選択で残る項目を含め、復元後候補に欠落/曖昧な参照があります。');
  if (referenceUnknown) plan.reasons.push('参照解析の完全性または同じIDの意味的同一性は未確認です。');
  if (changed) plan.reasons.push(plan.lexical.message);
  for (const row of plan.items) if (row.proposedOperation === 'ADD' || row.proposedOperation === 'REPLACE') row.blockedReasons.push('原文字句を損失なく変更する方式が未確立です。候補操作を実行できません。');
  plan.status = plan.items.some(row => row.operation === 'BLOCKED') || referenceBlocked || plan.lexical.status === 'BLOCKED' || plan.candidate.status === 'BLOCKED' ? 'BLOCKED' : !selectedKeys.length || plan.items.some(row => row.operation === 'UNKNOWN') || referenceUnknown || plan.candidate.status !== 'PASS' ? 'UNKNOWN' : 'PASS';
  plan.counts = { selected: selectedKeys.length, add: plan.items.filter(v => v.proposedOperation === 'ADD' && !v.coveredBy).length, replace: plan.items.filter(v => v.proposedOperation === 'REPLACE' && !v.coveredBy).length, unchanged: plan.items.filter(v => v.proposedOperation === 'UNCHANGED').length, blocked: plan.items.filter(v => v.blockedReasons.length > 0).length, unknown: plan.items.filter(v => v.operation === 'UNKNOWN').length, missingReferences: candidateDoc && referencesComplete ? post.filter(ref => ref.status === 'MISSING').length : null, unknownReferences: candidateDoc && referencesComplete ? post.filter(ref => ['AMBIGUOUS','UNSUPPORTED','UNPARSEABLE','UNKNOWN'].includes(ref.status)).length : null };
  return plan;
}
