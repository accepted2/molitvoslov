#!/usr/bin/env node
/* Fail the build if a React built-in hook is used unqualified without an import.
 * This regression guard catches release-only crashes like:
 * ReferenceError: Property 'useEffect' doesn't exist at PrayerBookReaderScreen
 *
 * Conservative AST-based check: every referenced React hook identifier must
 * be declared in the module (typically through an import from 'react').
 * Run: node tools/verify_react_hook_imports.js
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const hooks = new Set([
  'useState', 'useEffect', 'useLayoutEffect', 'useInsertionEffect', 'useRef',
  'useMemo', 'useCallback', 'useImperativeHandle', 'useReducer',
  'useContext', 'useDeferredValue', 'useTransition', 'useId',
  'useSyncExternalStore', 'useDebugValue', 'useOptimistic', 'useActionState',
]);

function listFiles(folder) {
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder, {withFileTypes: true}).flatMap((entry) => {
    const filename = path.join(folder, entry.name);
    if (entry.isDirectory()) return listFiles(filename);
    if (!entry.isFile() || !/\.[jt]sx?$/.test(entry.name) ||
        /\.backup\.[jt]sx?$/.test(entry.name)) return [];
    return [filename];
  });
}

function missingHooks(source, filename) {
  // Bare names in React.useEffect(...) are deliberately excluded; the member
  // expression uses a React namespace, not an unbound hook identifier.
  const ast = parser.parse(source, {
    sourceType: 'unambiguous',
    sourceFilename: filename,
    plugins: ['jsx', 'typescript', 'decorators-legacy'],
  });
  const errors = [];
  traverse(ast, {
    CallExpression(nodePath) {
      const callee = nodePath.get('callee');
      if (!callee.isIdentifier()) return;
      const name = callee.node.name;
      if (hooks.has(name) && !callee.scope.hasBinding(name)) {
        errors.push(name + ' at line ' + (callee.node.loc?.start.line || '?'));
      }
    },
  });
  return errors;
}

const files = [
  ...listFiles(path.join(root, 'src', 'screens')),
  ...listFiles(path.join(root, 'src', 'components')),
  ...listFiles(path.join(root, 'src', 'hooks')),
  ...listFiles(path.join(root, 'src', 'context')),
];
assert.ok(files.length >= 25, 'Screen/component inventory unexpectedly incomplete');
let failures = 0;
for (const filename of files) {
  try {
    const missing = missingHooks(fs.readFileSync(filename, 'utf8'), filename);
    if (missing.length) {
      failures += missing.length;
      console.error('MISSING REACT HOOK IMPORT:', path.relative(root, filename), missing.join(', '));
    }
  } catch (error) {
    failures += 1;
    console.error('FAILED TO PARSE:', path.relative(root, filename), error.message);
  }
}
if (failures) {
  console.error('FAIL: ' + failures + ' missing React hooks / syntax problems in ' + files.length + ' files');
  process.exit(1);
}
const verified = path.join(root, 'src', 'screens', 'PrayerBookReaderScreen.js');
assert.match(fs.readFileSync(verified, 'utf8'), /import\s+React,\s*\{[^}]*\buseEffect\b[^}]*\}\s+from\s+['"]react['"]/);
console.log('PASS: PrayerBookReaderScreen imports useEffect');
console.log('PASS: ' + files.length + ' screen/component/hook/context modules checked for missing React hooks');
console.log('REACT HOOK IMPORT CHECKS PASSED');
