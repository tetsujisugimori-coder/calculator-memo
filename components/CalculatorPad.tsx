"use client";

import { resultSize } from "../lib/format";

type Props = {
  expression: string;
  displayExpression: string;
  resultText: string;
  error: string;
  onInput: (value: string) => void;
  onCalculate: () => void;
  onClear: () => void;
  onClearEntry: () => void;
  onBackspace: () => void;
  onToggleSign: () => void;
  onCreateNote: () => void;
  canCreateNote: boolean;
};

const mainKeys = [
  ["C", "clear"], ["CE", "clear-entry"], ["⌫ 戻す", "backspace"], ["÷", "/"],
  ["7", "7"], ["8", "8"], ["9", "9"], ["×", "*"],
  ["4", "4"], ["5", "5"], ["6", "6"], ["−", "-"],
  ["1", "1"], ["2", "2"], ["3", "3"], ["＋", "+"],
  ["±", "sign"], ["0", "0"], [".", "."], ["=", "equals"],
] as const;

export function CalculatorPad(props: Props) {
  const run = (action: string) => {
    if (action === "clear") props.onClear();
    else if (action === "clear-entry") props.onClearEntry();
    else if (action === "backspace") props.onBackspace();
    else if (action === "sign") props.onToggleSign();
    else if (action === "equals") props.onCalculate();
    else props.onInput(action);
  };
  return (
    <section className="calculator-shell" aria-label="電卓">
      <div className="calculator-brand"><span>CALC NOTE</span><small>DESKTOP 01</small></div>
      <div className="solar-strip" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="lcd" aria-live="polite" aria-atomic="true">
        <div className="lcd-expression" title={props.displayExpression || "計算式"}>{props.displayExpression || "0"}</div>
        <div className={`lcd-result ${resultSize(props.resultText)}`}>{props.error ? "Error" : props.resultText}</div>
        <div className="lcd-status">{props.error || (props.expression ? "入力中" : "準備完了")}</div>
      </div>
      <div className="utility-row" aria-label="補助キー">
        {["(", ")", "%"].map((key) => <button key={key} className="calc-key utility-key" onClick={() => props.onInput(key)} aria-label={key === "%" ? "パーセント" : key}>{key}</button>)}
        <button className="guide-shortcut" onClick={props.onCreateNote} disabled={!props.canCreateNote}>計算メモを作成</button>
      </div>
      <div className="key-grid">
        {mainKeys.map(([label, action]) => {
          const kind = ["/", "*", "-", "+"].includes(action) ? "operator" : action === "equals" ? "equals" : action.startsWith("clear") || action === "backspace" ? "clear" : "number";
          const ariaLabels: Record<string, string> = { "÷": "割る", "×": "掛ける", "−": "引く", "＋": "足す", "⌫ 戻す": "1文字削除", "±": "符号反転", "=": "計算する", "C": "すべて消去", "CE": "現在の数値を消去" };
          const aria = ariaLabels[label] || label;
          return <button key={label} className={`calc-key ${kind} ${action === "backspace" ? "backspace-key" : ""}`} onClick={() => run(action)} aria-label={aria}>{label}</button>;
        })}
      </div>
      <div className="calculator-foot"><span>12 DIGIT</span><span>LOCAL MEMORY</span></div>
    </section>
  );
}
