export const MAX_URL_EXPRESSION_LENGTH = 2000;

export function expressionFromSearch(search: string): string | null {
  const expression = new URLSearchParams(search).get("expr");
  if (expression === null) return null;
  return expression.slice(0, MAX_URL_EXPRESSION_LENGTH);
}
