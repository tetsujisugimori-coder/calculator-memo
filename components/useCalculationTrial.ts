"use client";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { applyCalculationTrial, createCalculationTrial, trialMatches, trialSnapshot, type CalculationTrial } from '../lib/calculation-trial';
import type { MemoBlock } from '../lib/types';
export function useCalculationTrial({ blocks, memoKey, sourceRevision, baseline, baselineKnown, onApply }: {
  blocks: MemoBlock[]; memoKey: string; sourceRevision: string; baseline: MemoBlock[]; baselineKnown: boolean;
  onApply: (result: CalculationTrial['evaluation']) => void | boolean;
}) {
  const applied = useRef<CalculationTrial>(undefined);
  const [trial, setTrial] = useState<CalculationTrial>();
  const [trialInput, setTrialInput] = useState<MemoBlock[]>();
  const [pendingInput, setPendingInput] = useState<{ blocks: MemoBlock[]; scopeKey: string; revision: number }>();
  const [trialMessage, setTrialMessage] = useState("");
  const [trialPending, setTrialPending] = useState(false);
  const scopeKey = JSON.stringify([memoKey, sourceRevision]);
  const [generation, setGeneration] = useState({ blocks, scopeKey, sequence: 0 });
  // React's guarded previous-props pattern: invalidate even A → B → A and
  // reflected new arrays before committing any controls for the new input.
  if (generation.blocks !== blocks || generation.scopeKey !== scopeKey) {
    setGeneration({ blocks, scopeKey, sequence: generation.sequence + 1 });
  }
  const live = useRef({ blocks, scopeKey, revision: 0, request: 0, mounted: true });
  useLayoutEffect(() => {
    if (live.current.blocks !== blocks || live.current.scopeKey !== scopeKey || live.current.revision !== generation.sequence) {
      live.current.revision = generation.sequence; live.current.request++;
      live.current.blocks = blocks; live.current.scopeKey = scopeKey;
    }
  }, [blocks, scopeKey, generation.sequence]);
  useEffect(() => { const state = live.current; state.mounted = true; return () => { state.mounted = false; state.request++; }; }, []);
  const invalidateTrial = () => { setGeneration(value => ({ ...value, sequence: value.sequence + 1 })); live.current.revision++; live.current.request++; setTrialPending(false); setTrialMessage(""); };
  const validTrial = !!trial && trial.context.memoKey === scopeKey && trial.context.snapshot === trialSnapshot(blocks) && trialInput === blocks && trial.context.revision === generation.sequence;
  const pendingTrial = trialPending && pendingInput?.blocks === blocks && pendingInput.scopeKey === scopeKey && pendingInput.revision === generation.sequence;
  const preview = async () => {
    const request = ++live.current.request;
    const context = { memoKey: scopeKey, revision: live.current.revision, snapshot: trialSnapshot(blocks) };
    setPendingInput({ blocks, scopeKey, revision: context.revision }); setTrialPending(true); setTrialMessage("");
    try {
      const result = await Promise.resolve().then(() => createCalculationTrial(blocks, context, { baseline, baselineKnown }));
      if (!live.current.mounted || request !== live.current.request || !trialMatches(result, live.current.blocks, live.current.scopeKey, live.current.revision)) return;
      setTrial(result); setTrialInput(blocks);
    } catch {
      if (live.current.mounted && request === live.current.request) setTrialMessage("試算を完了できませんでした。元の結果は変更していません。入力を確認して再試算してください。");
    } finally {
      if (live.current.mounted && request === live.current.request) setTrialPending(false);
    }
  };
  const applyTrial = () => {
    if (!trial || applied.current === trial) return;
    const result = applyCalculationTrial(trial, live.current.blocks, live.current.scopeKey, live.current.revision);
    if (!result.success) { setTrialMessage(result.message); return; }
    if (onApply(result.evaluation) === false) { setTrialMessage("根拠候補の上限などにより反映を停止しました。編集結果は変更していません。"); return; }
    applied.current = trial;
    invalidateTrial();
    setTrial(undefined); setTrialMessage("試算結果を編集内容へ一括反映しました。永続保存は「保存する」で行います。");
  };
  const clearTrial = () => { invalidateTrial(); setTrial(undefined); };
  return { trial, trialMessage, validTrial, pendingTrial, preview, applyTrial, invalidateTrial, clearTrial };
}
