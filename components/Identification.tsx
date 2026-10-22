"use client";
import { useId, useState } from "react";
import { inspectIdentification, type IdentificationMode } from "../lib/identification";
import { identificationHelp } from "../lib/identification-help";
import { Modal } from "./Modal";

export function IdentificationSettings({ mode, onChange }: { mode?: IdentificationMode; onChange: (mode: IdentificationMode) => void }) {
  const [help, setHelp] = useState(false);
  const defaultHelpId = useId();
  return <div className="identification-settings">
    <label>識別表示<select aria-label="識別表示" aria-describedby={mode === undefined ? defaultHelpId : undefined} value={mode ?? ""} onChange={(event) => onChange(event.target.value as IdentificationMode)}>
      {mode === undefined && <option value="" disabled>初期設定</option>}
      <option value="labels">ラベル＋色</option><option value="color">色のみ</option><option value="none">識別表示なし</option>
    </select>{mode === undefined && <small id={defaultHelpId}>初期設定では画面幅に合わせて識別表示を選びます。</small>}</label>
    <button type="button" aria-label="識別表示の説明" aria-haspopup="dialog" onClick={() => setHelp(true)}>i</button>
    {help && <Modal title={identificationHelp.title} onClose={() => setHelp(false)}>{identificationHelp.paragraphs.map((text) => <p key={text}>{text}</p>)}</Modal>}
  </div>;
}

export function VariableIdentification({ expression, assignment = false }: { expression: string; assignment?: boolean }) {
  const info = inspectIdentification(expression, assignment);
  return <div className="variable-identification" aria-label="入力式の識別">
    {info.error ? <small>識別保留：{info.error}</small> : <>
      {info.target && <div className="calculation-variable identity-item identity-variable"><span className="identity-label">変数</span>{" "}<code>{info.target}</code></div>}
      {info.variables.length > 0 && <div className="identity-item identity-variable"><span className="identity-label">参照する変数</span><code>{info.variables.join("、")}</code></div>}
    </>}
  </div>;
}
