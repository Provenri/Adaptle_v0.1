import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { auditSource } from './audit-react-native.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const allowedColors = new Set(['#173E32', '#FFFFFF']);

function audit(code, relativePath = 'app/src/components/example.tsx', changedLines = null) {
  return auditSource({
    code,
    filePath: path.join(root, relativePath),
    changedLines,
    allowedColors,
  });
}

test('rejects web elements and className in native TSX', () => {
  const diagnostics = audit(
    'export function Example() { return <div className="card"><span>Hi</span></div>; }'
  );
  assert.deepEqual(
    diagnostics.map(({ code }) => code),
    ['web-element', 'class-name', 'web-element']
  );
});

test('allows native primitives and expo-router Head metadata', () => {
  const diagnostics = audit(
    "export function Example() { return <><Head><title>Adaptle</title><meta name='x' /></Head><View><Text>Hi</Text></View></>; }"
  );
  assert.equal(diagnostics.length, 0);
});

test('allows documented web-platform files to use DOM markup', () => {
  const diagnostics = audit(
    "export function Example() { return <div className='card'>Hi</div>; }",
    'app/src/components/example.web.tsx'
  );
  assert.equal(diagnostics.length, 0);
});

test('allows RN gap and local geometry while warning on unknown spacing', () => {
  const diagnostics = audit(
    'const styles = StyleSheet.create({ card: { gap: Spacing.three, width: 92, padding: 12 } });'
  );
  assert.deepEqual(
    diagnostics.map(({ code }) => code),
    ['spacing-literal']
  );
});

test('warns only for colors outside the Adaptle design sources', () => {
  const known = audit("const styles = { color: '#173E32', backgroundColor: '#FFFFFF' };");
  const unknown = audit("const styles = { color: '#123456' };");
  assert.equal(known.length, 0);
  assert.deepEqual(
    unknown.map(({ code }) => code),
    ['unknown-color']
  );
});

test('warns about new pressable accessibility without forbidding it outright', () => {
  const missing = audit('export function Example() { return <Pressable onPress={() => {}} />; }');
  const labelled = audit(
    'export function Example() { return <Pressable accessibilityRole="button" onPress={() => {}} />; }'
  );
  assert.deepEqual(
    missing.map(({ code }) => code),
    ['pressable-a11y']
  );
  assert.equal(labelled.length, 0);
});

test('warns when a new route has no visible safe-area owner', () => {
  const diagnostics = audit(
    'export default function Example() { return <View />; }',
    'app/src/app/example.tsx'
  );
  assert.deepEqual(
    diagnostics.map(({ code }) => code),
    ['safe-area']
  );
});

test('restricts diagnostics to selected changed lines', () => {
  const diagnostics = audit(
    [
      'export function Existing() { return <View />; }',
      'export function AddedLater() { return <div />; }',
    ].join('\n'),
    'app/src/components/example.tsx',
    new Set([1])
  );
  assert.equal(diagnostics.length, 0);
});
