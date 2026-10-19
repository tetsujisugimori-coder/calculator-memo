/** Export the captured source, never a parsed/reconstructed snapshot.
 * Refuse UTF-16 strings that UTF-8 would silently replace (lone surrogates).
 */
export function originalJsonBlob(raw: string | null): Blob {
  if (raw === null) throw new Error("原本JSONを取得できていないため、エクスポートできません。");
  const bytes = new TextEncoder().encode(raw);
  if (new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) !== raw)
    throw new Error("原本の文字情報を欠落なくJSONファイルへ出力できません。元データは変更していません。");
  return new Blob([bytes], { type: "application/json;charset=utf-8" });
}

/** A browser download request is not proof that the OS finished saving a file. */
export function downloadOriginalJson(raw: string | null): void {
  const blob = originalJsonBlob(raw);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "calculator-memo-original.json";
  try {
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // Do not revoke before WebKit has started consuming the download URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
