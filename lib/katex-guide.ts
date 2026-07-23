export type GuideCategory =
  | "ブロック" | "基本" | "分数・根号" | "指数・添字" | "ギリシャ文字" | "演算記号"
  | "比較記号" | "括弧" | "総和・積分" | "極限" | "行列" | "場合分け" | "よく使う公式";

export type GuideItem = {
  category: GuideCategory;
  name: string;
  latex: string;
  description: string;
  previewType?: "katex" | "calculation";
  limitations?: string;
};

export const guideCategories: GuideCategory[] = [
  "ブロック", "基本", "分数・根号", "指数・添字", "ギリシャ文字", "演算記号", "比較記号",
  "括弧", "総和・積分", "極限", "行列", "場合分け", "よく使う公式",
];

export const guideItems: GuideItem[] = [
  {
    category: "ブロック",
    name: "数式ブロック",
    latex: "\\frac{a}{b} + \\sqrt{x}",
    description: "KaTeXで整形して表示する専用ブロックです。数式を見せるための機能であり、値の計算や結果生成は行いません。",
    previewType: "katex",
  },
  {
    category: "ブロック",
    name: "計算ブロック",
    latex: "200*(5%+5%)",
    description: "電卓と同じ計算エンジンで式を評価し、入力欄と結果をセットで保存・表示します。不正な式はそのブロック内だけにエラー表示されます。",
    previewType: "calculation",
    limitations: "使用可能: 数値、+ - * /、小数、括弧、負数、%。使用不可: 変数、LaTeX（\\fracなど）、^による累乗、関数。",
  },
  { category: "基本", name: "二乗", latex: "x^2", description: "文字や数の右上に指数を付けます。" },
  { category: "指数・添字", name: "添字", latex: "x_{1}", description: "複数文字の添字は波括弧で囲みます。" },
  { category: "分数・根号", name: "分数", latex: "\\frac{a}{b}", description: "分子と分母を波括弧に入力します。" },
  { category: "分数・根号", name: "平方根", latex: "\\sqrt{x}", description: "根号の中身を波括弧に入力します。" },
  { category: "分数・根号", name: "n乗根", latex: "\\sqrt[n]{x}", description: "角括弧で根の次数を指定します。" },
  { category: "演算記号", name: "プラスマイナス", latex: "\\pm", description: "正負の両方を表します。" },
  { category: "演算記号", name: "掛け算", latex: "\\times", description: "乗算記号を表示します。" },
  { category: "演算記号", name: "割り算", latex: "\\div", description: "除算記号を表示します。" },
  { category: "比較記号", name: "以下", latex: "\\le", description: "左辺が右辺以下であることを表します。" },
  { category: "比較記号", name: "以上", latex: "\\ge", description: "左辺が右辺以上であることを表します。" },
  { category: "比較記号", name: "等しくない", latex: "\\neq", description: "2つの値が等しくないことを表します。" },
  { category: "ギリシャ文字", name: "アルファ", latex: "\\alpha", description: "ギリシャ文字のαです。" },
  { category: "ギリシャ文字", name: "ベータ", latex: "\\beta", description: "ギリシャ文字のβです。" },
  { category: "ギリシャ文字", name: "シータ", latex: "\\theta", description: "角度でよく使うθです。" },
  { category: "ギリシャ文字", name: "円周率", latex: "\\pi", description: "円周率を表すπです。" },
  { category: "総和・積分", name: "総和", latex: "\\sum_{i=1}^{n}", description: "範囲を指定した総和です。" },
  { category: "総和・積分", name: "定積分", latex: "\\int_a^b", description: "下限aから上限bまでの積分です。" },
  { category: "極限", name: "極限", latex: "\\lim_{x \\to 0} f(x)", description: "xが0へ近づくときの極限です。" },
  { category: "括弧", name: "伸縮する括弧", latex: "\\left( \\frac{a}{b} \\right)", description: "中身に合わせて括弧の高さを調整します。" },
  { category: "行列", name: "2×2行列", latex: "\\begin{bmatrix}\na & b \\\\\nc & d\n\\end{bmatrix}", description: "角括弧付きの2行2列行列です。" },
  { category: "場合分け", name: "場合分け", latex: "\\begin{cases} x^2 & x \\ge 0 \\\\ -x & x < 0 \\end{cases}", description: "条件ごとに式を分けて表示します。" },
  { category: "よく使う公式", name: "二次方程式の解", latex: "\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}", description: "二次方程式 ax²+bx+c=0 の解の公式です。" },
];
