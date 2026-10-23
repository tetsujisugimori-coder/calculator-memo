/** Validated saved text only. Never interpret remarks as Markdown or approval. */
export function ConfirmationRemarks({ remarks }: { remarks?: string }) {
  return <section aria-label="確認時の備考"><p>確認時の備考（利用者の申告）</p><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{remarks === undefined ? "備考の記録なし" : remarks === "" ? "備考は入力されていません" : remarks}</p><p>変更理由の客観的記録や、現在の承認・数学的正しさの保証ではありません。</p></section>;
}
