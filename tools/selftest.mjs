#!/usr/bin/env node
/* =====================================================================
   Self-test for the well-formedness checker inside tools/validate.mjs.

   The lab only needs `npm run validate`, but a checker that always says
   "OK" is worthless, so these cases prove it rejects broken documents.

   Usage:  node tools/selftest.mjs
   ===================================================================== */

import { parseXml } from './validate.mjs'

const cases = [
  { name: 'minimal document', xml: '<a/>', valid: true },
  { name: 'declaration, comment, nesting', xml: '<?xml version="1.0" encoding="UTF-8"?><!-- hi --><a><b>t</b></a>', valid: true },
  { name: 'entities and attributes', xml: '<a x="1" y=\'two\'><b>AT&amp;T &lt;tag&gt; &#65; &#x41;</b></a>', valid: true },
  { name: 'CDATA', xml: '<a><![CDATA[x < y && z]]></a>', valid: true },
  { name: 'whitespace outside root', xml: '\n<root>\n  <x/>\n</root>\n', valid: true },
  { name: 'unclosed element', xml: '<a><b></a>', valid: false },
  { name: 'stray end tag', xml: '<a></b></a>', valid: false },
  { name: 'two roots', xml: '<a/><b/>', valid: false },
  { name: 'text outside root', xml: '<a/>junk', valid: false },
  { name: 'unquoted attribute', xml: '<a x=1/>', valid: false },
  { name: 'duplicate attribute', xml: '<a x="1" x="2"/>', valid: false },
  { name: 'raw ampersand', xml: '<a>AT&T</a>', valid: false },
  { name: 'raw less-than in text', xml: '<a>1 < 2</a>', valid: false },
  { name: 'unterminated comment', xml: '<a><!-- oops </a>', valid: false },
  { name: 'comment with --', xml: '<a><!-- a -- b --></a>', valid: false },
  { name: 'empty document', xml: '   ', valid: false },
  { name: 'attribute with <', xml: '<a x="a<b"/>', valid: false }
]

let failed = 0

for (const testCase of cases) {
  const { errors } = parseXml(testCase.xml)
  const gotValid = errors.length === 0
  const pass = gotValid === testCase.valid
  if (!pass) failed += 1
  const mark = pass ? '\u2713' : '\u2717'
  const expectation = testCase.valid ? 'valid' : 'invalid'
  console.log(`${mark} ${testCase.name} (expected ${expectation}, got ${gotValid ? 'valid' : 'invalid'})`)
  if (!pass && errors.length) console.log(`    ${errors.join('\n    ')}`)
}

console.log('')
if (failed === 0) {
  console.log(`All ${cases.length} checker cases behaved as expected.`)
  process.exit(0)
} else {
  console.log(`${failed} of ${cases.length} checker cases failed.`)
  process.exit(1)
}
