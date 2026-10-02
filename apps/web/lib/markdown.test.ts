import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readingMinutes, renderMarkdown } from './markdown.ts';

test('raw HTML and script links never run', () => {
  const { html } = renderMarkdown('Hi <script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1)) and ![x](http://insecure/x.png)');
  assert.ok(!html.includes('<script'), html);
  assert.ok(!html.includes('<img src=x'), html);
  assert.ok(!html.includes('javascript:'), html);
  assert.ok(!html.includes('http://insecure'), html);
  assert.ok(html.includes('&lt;script&gt;'));
});

test('external links get nofollow; internal links stay plain', () => {
  const { html } = renderMarkdown('[ext](https://example.com) and [int](/blog/a/b)');
  assert.match(html, /<a href="https:\/\/example\.com" rel="nofollow noopener" target="_blank">ext<\/a>/);
  assert.match(html, /<a href="\/blog\/a\/b">int<\/a>/);
});

test('headings get unique ids, a stray h1 becomes h2, and tables render', () => {
  const { html, headings } = renderMarkdown('## What to know\n\ntext\n\n## What to know\n\n### Sub *bit*\n\n# Stray\n\n| a | b |\n|---|---|\n| 1 | 2 |');
  assert.deepEqual(headings.map((h) => [h.id, h.level]), [['what-to-know', 2], ['what-to-know-2', 2], ['sub-bit', 3], ['stray', 2]]);
  assert.ok(!html.includes('<h1'));
  assert.ok(html.includes('<table>'));
});

test('reading time', () => {
  assert.equal(readingMinutes('word '.repeat(1150)), 5);
  assert.equal(readingMinutes('short'), 1);
});
