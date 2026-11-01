import { MAX_RAW_CODE_UNITS } from './backup';
import { MAX_RESTORE_FILE_BYTES, parseStrictJson, validateRestoreRaw } from './restore-validation';
import { STORAGE_KEY } from './storage';
import { parseReportAudit } from './formula-report-audit';
import { scanAuditRecordEnvelopes } from './formula-report-audit-record';
import { scanAuditComparisonRecordEnvelopes } from './formula-report-audit-comparison-record';
import { parseMarkdownBlocks } from './markdown-blocks';

export const MAX_PREVIEW_ITEMS = 5000;
const MAX_PREVIEW_NODES = 100000;
export type PreviewCategory = 'history' | 'notes' | 'formulas' | 'executions' | 'reports' | 'evidence' | 'confirmations' | 'other';
export type PreviewItem = {
  key: string; category: PreviewCategory; id: string | null; title: string;
  createdAt: string | null; updatedAt: string | null; value: unknown;
  validation: 'valid' | 'unknown'; identity: string | null; scope: string | null;
};
export type PreviewDocument = {
  raw: string | null; namespace: 'backup' | 'current'; items: PreviewItem[];
  categories: { category: PreviewCategory; label: string; count: number | null }[];
  validation: 'valid' | 'unknown'; warnings: string[];
};
export type PreviewResult = { ok: true; preview: PreviewDocument } | { ok: false; message: string };
export type PreviewComparison = { status: 'absent' | 'same' | 'different' | 'ambiguous' | 'unknown' | 'stale' | 'read-error' | 'unacquired'; message: string };
export type PreviewReference = { namespace: 'backup' | 'current'; status: 'found' | 'missing' | 'ambiguous' | 'unsupported' | 'unparseable'; target: string; message: string };
const labels: Record<PreviewCategory, string> = { history: '計算履歴', notes: '数学メモ', formulas: '登録式', executions: '登録式の実行入力', reports: '数学レポート', evidence: '計算根拠記録（メモ内）', confirmations: '確認履歴（レポート内）', other: '設定・その他／未対応データ' };
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): string | null => typeof v === 'string' && v.trim().length > 0 ? v : null;
const date = (v: unknown): string | null => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null;
const identity = (category: PreviewCategory, scope: string | null, value: string) => JSON.stringify([category, scope, value]);
const indexes = new WeakMap<PreviewDocument, Map<string, PreviewItem[]>>();
const roots = new WeakMap<PreviewDocument, Record<string, unknown>>();
const references = new WeakMap<PreviewItem, PreviewReference[]>();

/** No evaluator, normalizer or storage operation. Iterative work budget also bounds
 * unknown fields: they are not ignored merely because existing renderers omit them. */
function checkBudget(value: unknown): boolean {
  const pending = [value]; let nodes = 0; let numbersExact = true;
  while (pending.length) {
    if (++nodes > MAX_PREVIEW_NODES) throw Error('解析対象が100,000要素を超えます。切り捨てずプレビューを停止しました。');
    const v = pending.pop();
    if (typeof v === 'number' && (!Number.isFinite(v) || (Number.isInteger(v) && !Number.isSafeInteger(v)))) numbersExact = false;
    if (Array.isArray(v)) for (const child of v) pending.push(child);
    else if (object(v)) for (const child of Object.values(v)) pending.push(child);
    if (nodes + pending.length > MAX_PREVIEW_NODES) throw Error('解析対象が100,000要素を超えます。切り捨てずプレビューを停止しました。');
  }
  return numbersExact;
}
/** Compare decimal spellings without constructing enormous powers or integers.
 * This proves round-trip decimal preservation, not real-number binary exactness.
 * 1e2 and 100 are equivalent; 1.00000000000000001 and parsed 1 are not. */
function decimalKey(token: string): string | null {
  const negative = token.startsWith('-');
  const unsigned = negative ? token.slice(1) : token;
  const parts = unsigned.toLowerCase().split('e');
  const decimal = parts[0].split('.');
  let coefficient = (decimal[0] + (decimal[1] ?? '')).replace(/^0+/, '');
  if (!coefficient) return negative ? '-0' : '0';
  const exponentText = (parts[1] ?? '0').replace(/^[+]/, '');
  const magnitude = exponentText.replace(/^-/, '').replace(/^0+/, '');
  if (magnitude.length > 6) return null;
  let exponent = Number(exponentText) - (decimal[1]?.length ?? 0);
  const trimmed = coefficient.replace(/0+$/, '');
  exponent += coefficient.length - trimmed.length;
  coefficient = trimmed;
  return `${negative ? '-' : ''}${coefficient}e${exponent}`;
}
function exactNumericTokens(raw: string): boolean {
  const numeric = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  for (let i = 0; i < raw.length;) {
    if (raw[i] === '"') {
      i++;
      while (i < raw.length) { const c = raw[i++]; if (c === '\\') i++; else if (c === '"') break; }
      continue;
    }
    if (raw[i] === '-' || /[0-9]/.test(raw[i])) {
      numeric.lastIndex = i; const match = numeric.exec(raw);
      if (!match) return false;
      const token = match[0]; const n = Number(token);
      const roundTrip = Object.is(n, -0) ? '-0' : String(n);
      const key = decimalKey(token);
      if (!Number.isFinite(n) || key === null || key !== decimalKey(roundTrip)) return false;
      i = numeric.lastIndex;
    } else i++;
  }
  return true;
}
function sameStructure(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => sameStructure(v, b[i]));
  if (!object(a) || !object(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameStructure(a[key], b[key]));
}
function document(raw: string | null, namespace: PreviewDocument['namespace']): PreviewDocument {
  if (raw === null) {
    const empty: PreviewDocument = { raw, namespace, items: [], categories: Object.entries(labels).map(([category, label]) => ({ category: category as PreviewCategory, label, count: 0 })), validation: 'valid', warnings: ['取得時点で保存キーは存在しません。初期値を保存・生成していません。'] };
    indexes.set(empty, new Map()); roots.set(empty, {}); return empty;
  }
  if (raw.length > MAX_RAW_CODE_UNITS) throw Error('保存原文が2 Mi UTF-16コード単位の上限を超えています。');
  const value = parseStrictJson(raw);
  if (!object(value) || value.version !== 1) throw Error('対応する内部保存形式version 1ではありません。');
  if (!Array.isArray(value.history) || !Array.isArray(value.notes) || !object(value.settings)) throw Error('必須の履歴・メモ配列または設定を検証できません。');
  const exact = checkBudget(value) && exactNumericTokens(raw);
  const checked = validateRestoreRaw(raw);
  const warnings: string[] = checked.ok ? [] : [`UNKNOWN: 現行保存形式の完全検証に失敗しました。補正せず閲覧のみ行います。${checked.message}`];
  if (!exact) warnings.push('UNKNOWN: JavaScript数値として正確に比較できない値があります。原文を保持し内容一致を認定しません。');
  const valid = checked.ok && exact;
  const items: PreviewItem[] = [];
  const unknownCounts = new Set<PreviewCategory>();
  const add = (category: PreviewCategory, key: string, v: unknown, scope: string | null = null, explicitId?: string | null, supported = true) => {
    if (items.length >= MAX_PREVIEW_ITEMS) throw Error('一覧対象が5,000項目を超えます。切り捨てずプレビューを停止しました。');
    const r = object(v) ? v : {};
    const identifier = explicitId === undefined ? id(r.id) : explicitId;
    const title = typeof r.title === 'string' ? r.title : typeof r.expression === 'string' ? r.expression : key;
    items.push({ key, category, id: identifier, title, createdAt: date(r.createdAt) ?? date(r.calculatedAt) ?? date(r.confirmedAt), updatedAt: date(r.updatedAt) ?? date(r.persistedAt), value: v,
      validation: valid && supported && object(v) ? 'valid' : 'unknown', identity: identifier === null ? null : identity(category, scope, identifier), scope });
  };
  value.history.forEach((v, i) => add('history', `history:${i}`, v));
  value.notes.forEach((v, i) => {
    const n = object(v) ? v : {};
    add('notes', `notes:${i}`, v, null, undefined, ['calculation', 'plain-calculation'].includes(String(n.type)));
    if (n.calculationEvidence !== undefined) {
      const e = n.calculationEvidence;
      if (object(e) && e.version === 1 && Array.isArray(e.records)) e.records.forEach((r, j) => add('evidence', `notes:${i}:evidence:${j}`, r, id(n.id), undefined, id(n.id) !== null));
      else { unknownCounts.add('evidence'); add('other', `notes:${i}:unsupported-evidence`, e, id(n.id), null, false); }
    }
  });
  for (const [field, category] of [['formulaLibrary', 'formulas'], ['formulaReports', 'reports']] as const) {
    if (!Object.hasOwn(value, field)) continue;
    const collection = value[field];
    if (!object(collection) || collection.version !== 1 || !Array.isArray(collection.entries)) { unknownCounts.add(category); if (category === 'reports') unknownCounts.add('confirmations'); add('other', `${field}:unsupported`, collection, null, null, false); continue; }
    collection.entries.forEach((v, i) => {
      add(category, `${category}:${i}`, v);
      if (category === 'reports' && object(v) && v.evidence !== undefined) {
        const evidence = v.evidence;
        if (object(evidence) && evidence.version === 1 && Array.isArray(evidence.confirmations)) evidence.confirmations.forEach((c, j) => add('confirmations', `reports:${i}:confirmations:${j}`, c, id(v.id), undefined, id(v.id) !== null));
        else { unknownCounts.add('confirmations'); add('other', `reports:${i}:unsupported-confirmations`, evidence, id(v.id), null, false); }
      }
    });
    for (const key of Object.keys(collection)) if (!['version', 'entries', ...(field === 'formulaLibrary' ? ['selectedId'] : [])].includes(key)) add('other', `${field}:${key}`, collection[key], null, null, false);
  }
  if (Object.hasOwn(value, 'formulaExecutions')) {
    if (Array.isArray(value.formulaExecutions)) value.formulaExecutions.forEach((v, i) => add('executions', `executions:${i}`, v, null, object(v) ? id(v.formulaId) : null));
    else { unknownCounts.add('executions'); add('other', 'formulaExecutions:unsupported', value.formulaExecutions, null, null, false); }
  }
  add('other', 'settings', value.settings, null, 'settings');
  items[items.length - 1].id = null;
  items[items.length - 1].title = '設定（固定保存フィールド settings・項目IDなし）';
  for (const key of Object.keys(value)) if (!['version', 'history', 'notes', 'settings', 'formulaLibrary', 'formulaReports', 'formulaExecutions'].includes(key)) add('other', `other:${key}`, value[key], null, null, false);
  const index = new Map<string, PreviewItem[]>();
  for (const item of items) if (item.identity) { const group = index.get(item.identity) ?? []; group.push(item); index.set(item.identity, group); }
  for (const item of items) if (!item.identity || (index.get(item.identity)?.length ?? 0) > 1) item.validation = 'unknown';
  if (items.some(item => item.validation === 'unknown')) warnings.push('UNKNOWN項目は対応付け・完全検証ができません。未対応フィールドも詳細原文に保持しています。');
  const result: PreviewDocument = { raw, namespace, items, categories: Object.entries(labels).map(([category, label]) => ({ category: category as PreviewCategory, label, count: unknownCounts.has(category as PreviewCategory) ? null : items.filter(item => item.category === category).length })), validation: valid && items.every(item => item.validation === 'valid') ? 'valid' : 'unknown', warnings };
  indexes.set(result, index); roots.set(result, value); return result;
}
function failure(cause: unknown): PreviewResult { return { ok: false, message: cause instanceof Error ? cause.message : 'UNKNOWN: 安全に解析できません。' }; }
export function parseSelectionCurrent(raw: string | null): PreviewResult {
  try { return { ok: true, preview: document(raw, 'current') }; } catch (cause) { return failure(cause); }
}
export function parseSelectionBackup(text: string, fileBytes?: number): PreviewResult {
  try {
    if (text.length > MAX_RESTORE_FILE_BYTES || (fileBytes !== undefined && (!Number.isSafeInteger(fileBytes) || fileBytes < 0 || fileBytes > MAX_RESTORE_FILE_BYTES))) throw Error('ファイルが16 MiBの読込上限を超えるか容量不明です。');
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > MAX_RESTORE_FILE_BYTES || (fileBytes !== undefined && fileBytes !== bytes)) throw Error('ファイル容量と読込内容が一致しません。');
    const v = parseStrictJson(text);
    if (!object(v) || v.format !== 'calculator-memo-backup' || v.formatVersion !== 1 || v.appStorageVersion !== 1 || v.acquisition !== 'captured') throw Error('対応するバックアップ形式version 1・保存形式version 1ではありません。');
    if (!date(v.createdAt) || !date(v.acquiredAt) || Date.parse(v.createdAt as string) < Date.parse(v.acquiredAt as string)) throw Error('作成・取得日時を確認できません。');
    if (!Array.isArray(v.entries) || v.entries.length !== 1 || !object(v.entries[0])) throw Error('対象は保存キー1件のバックアップです。');
    const e = v.entries[0];
    if (e.key !== STORAGE_KEY || typeof e.raw !== 'string' || e.raw.length > MAX_RAW_CODE_UNITS || e.utf16CodeUnits !== e.raw.length || !['ok', 'invalid-data'].includes(String(e.validation)) || typeof e.validation !== 'string') throw Error('対象キー・保存原文・長さ・検証状態が不正または未対応です。');
    const preview = document(e.raw, 'backup');
    const root = roots.get(preview)!;
    const entries = (v: unknown) => object(v) && Array.isArray(v.entries) ? v.entries.length : null;
    const counts = { history: (root.history as unknown[]).length, notes: (root.notes as unknown[]).length, formulas: root.formulaLibrary === undefined ? 0 : entries(root.formulaLibrary), reports: root.formulaReports === undefined ? 0 : entries(root.formulaReports), executions: root.formulaExecutions === undefined ? 0 : Array.isArray(root.formulaExecutions) ? root.formulaExecutions.length : null };
    if (e.validation === 'ok') {
      if (!object(e.counts) || Object.entries(counts).some(([key, count]) => count !== null && (e.counts as Record<string, unknown>)[key] !== count)) throw Error('外側件数と保存原文の実件数が一致しません。');
    } else {
      if (e.counts !== null) throw Error('検証不能バックアップの件数表記が不整合です。');
      preview.validation = 'unknown'; preview.items.forEach(item => { item.validation = 'unknown'; });
      preview.warnings.push('出力時点でinvalid-dataと記録されています。正常な復元用バックアップとは認定しません。');
    }
    return { ok: true, preview };
  } catch (cause) { return failure(cause); }
}
export function comparePreviewItem(item: PreviewItem, backup: PreviewDocument, current: PreviewDocument | null, availability: 'ready' | 'stale' | 'read-error' | 'unacquired' | 'invalid' = 'ready'): PreviewComparison {
  if (availability === 'invalid') return { status: 'unknown', message: '現在原文は取得しましたが、保存形式を検証できません。UNKNOWNです。' };
  if (availability !== 'ready') return { status: availability, message: ({ stale: '現在データの変更により比較失効。明示的に再取得してください。', 'read-error': '現在原文の読取失敗。UNKNOWNです。', unacquired: '現在原文をまだ取得していません。' })[availability] };
  if (!current) return { status: 'unacquired', message: '現在原文をまだ取得していません。' };
  if (!item.identity) return { status: 'unknown', message: '識別子がない、または未対応の種類のためUNKNOWNです。' };
  const source = indexes.get(backup)?.get(item.identity);
  const targets = indexes.get(current)?.get(item.identity) ?? [];
  if (!source?.includes(item)) return { status: 'unknown', message: 'このバックアップの項目として同定できません。' };
  if (source.length !== 1 || targets.length > 1) return { status: 'ambiguous', message: '同じ種類・親スコープ内のIDが重複しています。対応付けはUNKNOWNです。' };
  if (item.validation !== 'valid' || backup.validation !== 'valid' || current.validation !== 'valid' || targets.some(v => v.validation !== 'valid')) return { status: 'unknown', message: '保存形式または項目を完全検証できないためUNKNOWNです。' };
  if (!targets.length) return { status: 'absent', message: '取得した現在データに対応IDは存在しません。復元可能性は未判定です。' };
  return sameStructure(item.value, targets[0].value) ? { status: 'same', message: '種類・親スコープ・識別キー（設定は固定フィールド）が一意でJSON構造の内容が一致。原文文字列の完全一致ではありません。' } : { status: 'different', message: '種類・親スコープ・識別キー（設定は固定フィールド）が一意ですがJSON構造の内容が異なります。' };
}

/** Structural lookups only. Nothing is evaluated, regenerated, repaired or saved.
 * In particular frozen evidence block IDs refer to that record, not live blocks. */
export function inspectPreviewReferences(item: PreviewItem, doc: PreviewDocument): PreviewReference[] {
  if (!doc.items.includes(item)) return [{ namespace: doc.namespace, status: 'unparseable', target: item.key, message: 'この取得原文の項目として同定できません。' }];
  const cached = references.get(item); if (cached) return cached;
  const result: PreviewReference[] = [];
  const add = (status: PreviewReference['status'], target: string, message: string) => result.push({ namespace: doc.namespace, status, target, message });
  const resolve = (category: PreviewCategory, targetId: unknown, scope: string | null = null) => {
    const identifier = id(targetId); const target = `${category}/${scope === null ? '' : `${scope}/`}${identifier ?? 'UNKNOWN'}`;
    if (identifier === null) { add('unparseable', target, '参照IDの型または値が不明です。'); return; }
    const found = indexes.get(doc)?.get(identity(category, scope, identifier)) ?? [];
    if (found.length > 1) add('ambiguous', target, '参照先候補が複数あります。');
    else if (!found.length) add('missing', target, 'この原文内には参照先がありません。他の原文から補完しません。');
    else if (found[0].validation !== 'valid') add('unparseable', target, '参照先は1件ですが完全検証できません。');
    else add('found', target, 'この原文内で参照先を一意に確認。復元後の整合性保証ではありません。');
  };
  const links = (v: unknown) => {
    if (!Array.isArray(v)) { add('unparseable', 'evidence.links', '参照配列を解析できません。'); return; }
    for (const link of v) if (object(link)) { resolve('notes', link.memoId); if (id(link.memoId)) resolve('evidence', link.recordId, id(link.memoId)); else add('unparseable', 'evidence', 'メモID不明の根拠を他メモに結び付けません。'); } else add('unparseable', 'evidence.links', '参照要素の形式が不明です。');
  };
  const v = item.value;
  if (!object(v)) add('unsupported', item.key, '未対応のデータ種別です。詳細を閲覧できますが参照解析はUNKNOWNです。');
  else {
    const known: Partial<Record<PreviewCategory, string[]>> = {
      history: ['id', 'expression', 'displayExpression', 'result', 'resultText', 'createdAt', 'formulaExecution'],
      notes: ['id', 'schemaVersion', 'type', 'title', 'content', 'blocks', 'createdAt', 'updatedAt', 'calculationPolicy', 'calculationEvidence', 'expression', 'displayExpression', 'latexExpression', 'result', 'resultText', 'unit', 'note', 'tags', 'relatedMemoName', 'displayMode'],
      formulas: ['id', 'title', 'expression', 'createdAt', 'updatedAt'],
      executions: ['formulaId', 'expression', 'inputs'],
      reports: ['id', 'formulaId', 'title', 'body', 'createdAt', 'updatedAt', 'confirmedExpression', 'evidence'],
      evidence: ['id', 'evaluator', 'status', 'calculatedAt', 'persistedAt', 'blocks'],
      confirmations: ['id', 'formulaId', 'confirmedAt', 'evidenceSignature', 'definition', 'title', 'body', 'links', 'remarks'],
    };
    const fields = known[item.category];
    if (fields) for (const key of Object.keys(v)) if (!fields.includes(key)) add('unsupported', `${item.key}/${key}`, '未知の追加フィールドを保持しています。参照を含むか・その意味は解析対象外です。');
    if (item.category === 'executions' || item.category === 'reports' || item.category === 'confirmations') resolve('formulas', v.formulaId);
    if (item.category === 'history' && v.formulaExecution !== undefined) { if (object(v.formulaExecution)) resolve('formulas', v.formulaExecution.formulaId); else add('unparseable', 'formulaExecution', '登録式参照を解析できません。'); }
    if (item.category === 'reports' && v.evidence !== undefined) { if (object(v.evidence) && v.evidence.version === 1) links(v.evidence.links); else add('unsupported', 'report.evidence', '未対応の根拠形式です。'); }
    if (item.category === 'confirmations') links(v.links);
    if (item.category === 'evidence') resolve('notes', item.scope);
    if (item.category === 'notes' || item.category === 'evidence') {
      const blocks = v.blocks;
      if (blocks !== undefined && !Array.isArray(blocks)) add('unparseable', 'blocks', 'ブロック配列を解析できません。');
      if (Array.isArray(blocks)) {
        const blockKey = item.category === 'evidence' ? 'blockId' : 'id';
        const blockIds = new Map<string, number>();
        for (const block of blocks) if (object(block) && id(block[blockKey])) blockIds.set(block[blockKey] as string, (blockIds.get(block[blockKey] as string) ?? 0) + 1);
        const blockReference = (target: unknown) => {
          const identifier = id(target); const count = identifier ? blockIds.get(identifier) ?? 0 : 0;
          add(!identifier ? 'unparseable' : count > 1 ? 'ambiguous' : count === 0 ? 'missing' : 'found', `${item.key}/block/${identifier ?? 'UNKNOWN'}`, item.category === 'evidence' ? '固定根拠記録内だけでブロックIDを照合。現在のメモの計算・再取得は行いません。' : 'このメモのブロック内で参照IDを照合。計算順や数値の正しさは未評価です。');
        };
        for (const block of blocks) if (object(block)) {
          if (block.references !== undefined) {
            if (object(block.references) && block.references.version === 1 && Array.isArray(block.references.entries)) for (const ref of block.references.entries) { if (object(ref)) blockReference(ref.blockId); else add('unparseable', 'block.references', '不正な参照要素です。'); }
            else add('unsupported', 'block.references', '未対応のブロック参照形式です。');
          }
          if (item.category === 'evidence' && Array.isArray(block.inputs)) for (const input of block.inputs) if (object(input)) blockReference(input.sourceBlockId);
          if (block.evaluationMode === 'note-variables') add('unsupported', `${item.key}/variables`, '変数名による依存関係は今回未解析です。式を実行して補完しません。');
        }
      }
    }
    if (item.category === 'reports' && typeof v.body === 'string' && typeof v.formulaId === 'string') {
      if (v.body.length > 100000) add('unparseable', 'report.body', '本文解析上限を超えています。本文を切り捨てて正常扱いしません。');
      else try {
        for (const block of parseMarkdownBlocks(v.body)) if (block.kind === 'code' && block.language.startsWith('calculator-memo-')) {
          if (!['calculator-memo-evidence', 'calculator-memo-difference', 'calculator-memo-audit-record', 'calculator-memo-audit-comparison-record'].some(prefix => block.language.startsWith(prefix))) add('unsupported', block.language, '未対応の本文内構造化形式です。参照先を推定しません。');
          else { parseStrictJson(block.text); if (!exactNumericTokens(block.text)) throw Error('構造化参照の数値精度を確認できません。'); }
        }
        const audit = parseReportAudit(v.body, v.formulaId);
        if (!audit.complete) add('unparseable', 'report.body', audit.reason);
        for (const a of audit.items) {
          const quote = a.quote?.snapshot ?? a.difference?.snapshot?.quote;
          if (!quote) { add('unsupported', a.key, a.reason); continue; }
          resolve('formulas', quote.formulaId); resolve('notes', quote.memoId); resolve('evidence', quote.record.id, quote.memoId);
          if (a.difference?.snapshot) resolve('evidence', a.difference.snapshot.after.id, quote.memoId);
          if (a.bodyStatus !== 'intact') add('unparseable', a.key, '固定本文の形式・内容が変更または不明です。snapshotは変更しません。');
        }
        for (const a of scanAuditRecordEnvelopes(v.body)) {
          if (!a.metadata) add('unsupported', 'audit-record', a.reason);
          else { resolve('formulas', a.metadata.formulaId); resolve('reports', a.metadata.reportId); add('unsupported', `audit-record/${a.metadata.recordId}`, '固定点検記録の識別子を確認。内部の過去比較snapshotの全参照解析は対象外です。'); }
        }
        for (const a of scanAuditComparisonRecordEnvelopes(v.body)) {
          if (!a.metadata) add('unsupported', 'audit-comparison', a.reason);
          else { resolve('formulas', a.metadata.formulaId); resolve('reports', a.metadata.reportId); add('unsupported', `audit-comparison/${a.metadata.beforeRecordId}/${a.metadata.afterRecordId}`, '固定比較資料A/Bの記録IDを表示。過去点検記録への対応付けは今回未対応です。'); }
        }
      } catch { add('unparseable', 'report.body', '本文の構造化参照を安全に解析できません。'); }
    }
    if (item.category === 'other') add('unsupported', item.key, '設定・その他の値は表示のみ。任意の未知フィールドの参照意味は推測しません。');
  }
  references.set(item, result); return result;
}
