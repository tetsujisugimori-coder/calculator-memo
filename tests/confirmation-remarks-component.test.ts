import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ConfirmationRemarks } from '../components/ConfirmationRemarks';
it('distinguishes legacy and new empty records', () => {
  expect(renderToStaticMarkup(createElement(ConfirmationRemarks))).toContain('備考の記録なし');
  expect(renderToStaticMarkup(createElement(ConfirmationRemarks, { remarks: '' }))).toContain('備考は入力されていません');
});
it('renders multiline remarks as escaped plain text, never executable markup or Markdown', () => {
  const text = '<script>alert(1)</script>\n**申告** & 😀';
  const html = renderToStaticMarkup(createElement(ConfirmationRemarks, { remarks: text }));
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;\n**申告** &amp; 😀');
  expect(html).not.toContain('<script>'); expect(html).not.toContain('<strong>'); expect(html).toContain('white-space:pre-wrap');
});
