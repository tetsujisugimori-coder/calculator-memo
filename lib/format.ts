const MAX_SAFE_MAGNITUDE = 1e15;

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "計算できません";
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= MAX_SAFE_MAGNITUDE || magnitude < 1e-9) {
    return value.toExponential(10).replace(/\.0+e/, "e").replace(/(\.\d*?)0+e/, "$1e");
  }
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 12,
    useGrouping: true,
  }).format(value);
}

export function formatExpression(expression: string): string {
  const symbols = expression
    .replace(/\*/g, " × ")
    .replace(/\//g, " ÷ ")
    .replace(/\+/g, " ＋ ")
    .replace(/-/g, " − ")
    .replace(/\s+/g, " ")
    .trim();
  return symbols.replace(/(?<![\d.])(\d+(?:\.\d+)?)/g, (number) => {
    const [whole, decimal] = number.split(".");
    const grouped = Number(whole).toLocaleString("ja-JP");
    return decimal === undefined ? grouped : `${grouped}.${decimal}`;
  });
}

export function resultSize(text: string): "normal" | "compact" | "tiny" {
  if (text.length > 20) return "tiny";
  if (text.length > 13) return "compact";
  return "normal";
}

export function groupDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((start.getTime() - target.getTime()) / 86400000);
  if (days === 0) return "今日";
  if (days === 1) return "昨日";
  return new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(date);
}
