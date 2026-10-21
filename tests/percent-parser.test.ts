import { describe, expect, it } from 'vitest';
import { calculateExpression, calculateVariableExpression, inspectCalculatorExpression, inspectFormulaDefinition } from '../lib/calculator';
import { createHistoryEntry } from '../lib/history';
import { calculateMemoBlock, recalculateMemoBlocks } from '../lib/memo-blocks';
import { expressionFromSearch } from '../lib/url-expression';

const regressions = [['((50+50))%', 1], ['(50+(25+25))%', 1], ['(5%+5%)%', 0.001], ['.5%', 0.005]] as const;
describe('Issue #19 postfix percent', () => {
  it.each(regressions)('evaluates %s through the common evaluator and syntax inspectors', (expression, expected) => {
    expect(calculateExpression(expression).value).toBe(expected);
    expect(calculateVariableExpression(expression, new Map()).value).toBe(expected);
    expect(() => inspectCalculatorExpression(expression)).not.toThrow();
    expect(inspectFormulaDefinition(expression)).toEqual([]);
  });
  it.each([
    ['50%', .5], ['(50+50)%', 1], ['(((50)))%', .5], ['0%', 0],
    ['0.5%', .005], ['-0.5%', -.005], ['-.5%', -.005], ['(-.5)%', -.005],
    ['(1+(2*(3+4)))%', .15], ['((5%+5%)%+1)%', ((5/100+5/100)/100+1)/100],
    ['200+10%', 200.1], ['200-10%', 199.9], ['200*10%', 20], ['200/10%', 2000],
    ['2+50%*4', 4], ['(2+50)%*4', 2.08], ['5%/2', .025], ['5/2%', 250],
    ['(50%)%', .005], ['50%%', .005], ['5%2', .1], ['5%(2)', .1], ['(5)%2', .1],
  ])('preserves postfix precedence and legacy input %s', (expression, value) => {
    expect(calculateExpression(expression as string).value).toBe(value);
  });
  it.each(['%', '%5', '5+%', '(%)', '5*%', '5/%', '5%+', '(5%', '5)%', '()%','(5+) %', '1..5%', '.%', '50.%', '50%%%', '(50)%%', '1.2.3%'])('rejects invalid or still unsupported input %s', expression => {
    expect(() => calculateExpression(expression)).toThrow();
  });
  it.each(['sqrt(100)%', 'abs(-5)%', 'pi%', 'e%', '2^3%', '2e3%', 'sin(5)%', '[5]%', '5;1%', 'a=5%', '5!%', '5<6%', 'constructor(5)%'])('does not expand the syntax allowlist: %s', expression => {
    expect(() => calculateExpression(expression)).toThrow();
  });
  it('keeps variable-percent restrictions and legacy whitespace/implicit-product boundaries', () => {
    for (const expression of ['x%', 'x+5%', '5%2', '50 %', '(50) %']) {
      expect(() => calculateVariableExpression(expression, new Map([['x', 5]]))).toThrow();
    }
    expect(calculateExpression('50 %').value).toBe(.5);
  });
  it('preserves signed zero and unrounded binary floating-point results', () => {
    expect(Object.is(calculateExpression('-0%').value, -0)).toBe(true);
    expect(calculateExpression('(0.1+0.2)%').value).toBe((.1+.2)/100);
  });
  it('keeps source length, bracket depth and expanded AST budgets', () => {
    expect(() => calculateExpression(' '.repeat(1998)+'1%')).not.toThrow();
    expect(() => calculateExpression(' '.repeat(1999)+'1%')).toThrow('2000文字');
    expect(() => calculateExpression('('.repeat(33)+'1'+')'.repeat(33)+'%')).toThrow('入れ子');
    let nested = '1';
    for (let i = 0; i < 10; i++) nested = `(${nested})%`;
    expect(() => calculateExpression(nested)).not.toThrow();
    expect(() => calculateExpression(`(${nested})%`)).toThrow('複雑');
    const balanced = (n: number): string => n === 1 ? '1%' : `(${balanced(Math.floor(n/2))}+${balanced(Math.ceil(n/2))})`;
    expect(() => calculateExpression(balanced(80))).toThrow('複雑');
  });
  it.each(regressions)('keeps original %s across URL, history and legacy memo recalculation', (expression, expected) => {
    expect(expressionFromSearch('?'+new URLSearchParams({expr:expression}))).toBe(expression);
    const entry = createHistoryEntry(expression, 'percent-history', '2026-10-21T00:00:00Z');
    expect(entry).toMatchObject({expression, result:expected});
    const block = {...calculateMemoBlock('block', expression), future:{nested:['keep']}};
    const loaded = JSON.parse(JSON.stringify([block]));
    const before = JSON.stringify(loaded);
    expect(recalculateMemoBlocks(loaded)[0]).toMatchObject({expression, result:expected, future:{nested:['keep']}});
    expect(JSON.stringify(loaded)).toBe(before);
  });
});
