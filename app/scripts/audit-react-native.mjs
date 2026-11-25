import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const APP_ROOT = path.join(ROOT, 'app');
const SOURCE_ROOT = path.join(APP_ROOT, 'src');
const VALID_EXTENSIONS = new Set(['.ts', '.tsx']);
const SPACING_VALUES = new Set([0, 2, 4, 8, 16, 24, 32, 64]);
const SPACING_PROPERTIES = new Set([
  'gap',
  'rowGap',
  'columnGap',
  'margin',
  'marginBottom',
  'marginEnd',
  'marginHorizontal',
  'marginLeft',
  'marginRight',
  'marginStart',
  'marginTop',
  'marginVertical',
  'padding',
  'paddingBottom',
  'paddingEnd',
  'paddingHorizontal',
  'paddingLeft',
  'paddingRight',
  'paddingStart',
  'paddingTop',
  'paddingVertical',
]);
const WEB_ELEMENTS = new Set(
  `a abbr address area article aside audio b base bdi bdo blockquote body br button
  canvas caption cite code col colgroup data datalist dd del details dfn dialog div
  dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head
  header hgroup hr html i iframe img input ins kbd label legend li link main map
  mark menu meta meter nav noscript object ol optgroup option output p picture pre
  progress q rp rt ruby s samp script search section select slot small source span
  strong style sub summary sup table tbody td template textarea tfoot th thead time
  title tr track u ul var video wbr svg animate animateMotion animateTransform circle
  clipPath defs desc ellipse feBlend feColorMatrix feComponentTransfer feComposite
  feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow
  feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode
  feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence
  filter foreignObject g image line linearGradient marker mask metadata mpath path
  pattern polygon polyline radialGradient rect set stop switch symbol text textPath
  tspan use view`.split(/\s+/)
);

function runGit(args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  }
  return result.stdout ?? '';
}

function lineSetFromDiff(diff) {
  const lines = new Set();
  let newLine = 0;
  for (const line of diff.split('\n')) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (!newLine || line.startsWith('+++')) continue;
    if (line.startsWith('+')) {
      lines.add(newLine);
      newLine += 1;
    } else if (!line.startsWith('-') && !line.startsWith('\\')) {
      newLine += 1;
    }
  }
  return lines;
}

function changedFilesAndLines() {
  const files = new Set(
    [
      runGit(['diff', '--name-only']),
      runGit(['diff', '--cached', '--name-only']),
      runGit(['ls-files', '--others', '--exclude-standard']),
    ]
      .join('\n')
      .split('\n')
      .filter(Boolean)
  );
  const untracked = new Set(
    runGit(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)
  );
  const changedLines = new Map();

  for (const file of files) {
    if (!isSourcePath(path.join(ROOT, file))) continue;
    if (untracked.has(file)) {
      changedLines.set(file, null);
      continue;
    }
    const lines = new Set([
      ...lineSetFromDiff(runGit(['diff', '--unified=0', '--', file])),
      ...lineSetFromDiff(runGit(['diff', '--cached', '--unified=0', '--', file])),
    ]);
    changedLines.set(file, lines);
  }

  return changedLines;
}

function allSourceFiles(directory = SOURCE_ROOT) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...allSourceFiles(absolute));
    else if (isSourcePath(absolute)) files.push(absolute);
  }
  return files;
}

function isSourcePath(filePath) {
  const relative = path.relative(SOURCE_ROOT, filePath);
  return (
    relative !== '' && !relative.startsWith('..') && VALID_EXTENSIONS.has(path.extname(filePath))
  );
}

function getAllowedColors() {
  const values = new Set();
  const files = [path.join(ROOT, 'DESIGN.md'), path.join(APP_ROOT, 'src/constants/theme.ts')];
  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');
    for (const match of code.matchAll(/#[0-9a-f]{3,8}\b/gi)) values.add(match[0].toUpperCase());
  }
  return values;
}

function getLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function diagnostic(code, message, line, severity = 'error') {
  return { code, message, line, severity };
}

function isInsideExpoHead(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText() === 'Head') return true;
  }
  return false;
}

export function auditSource({
  code,
  filePath,
  changedLines = null,
  allowedColors = getAllowedColors(),
}) {
  const relative = path.relative(ROOT, filePath).replaceAll(path.sep, '/');
  const platformWebFile = /\.web\.[cm]?[jt]sx?$/.test(filePath);
  const sourceFile = ts.createSourceFile(
    filePath,
    code,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const diagnostics = [];
  const isChanged = (node) => changedLines === null || changedLines.has(getLine(sourceFile, node));

  const visit = (node) => {
    if (!isChanged(node)) {
      ts.forEachChild(node, visit);
      return;
    }

    if (ts.isImportDeclaration(node) && !platformWebFile) {
      const module = node.moduleSpecifier.text?.toLowerCase();
      if (module === 'react-dom' || module === 'styled-components') {
        diagnostics.push(
          diagnostic(
            'dom-import',
            `DOM-only import "${module}" is not valid in native implementation.`,
            getLine(sourceFile, node)
          )
        );
      }
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      if (!platformWebFile && !isInsideExpoHead(node) && WEB_ELEMENTS.has(tagName)) {
        diagnostics.push(
          diagnostic(
            'web-element',
            `Replace web element <${tagName}> with a React Native primitive or existing component.`,
            getLine(sourceFile, node)
          )
        );
      }
      if (
        !platformWebFile &&
        node.attributes.properties.some(
          (attribute) => ts.isJsxAttribute(attribute) && attribute.name.text === 'className'
        )
      ) {
        diagnostics.push(
          diagnostic(
            'class-name',
            'className is not available in Adaptle native components; use StyleSheet or an existing component.',
            getLine(sourceFile, node)
          )
        );
      }
      if (tagName === 'Pressable') {
        const attributes = node.attributes.properties
          .filter(ts.isJsxAttribute)
          .map((attribute) => attribute.name.text);
        if (
          !attributes.includes('accessibilityRole') &&
          !attributes.includes('accessibilityLabel')
        ) {
          diagnostics.push(
            diagnostic(
              'pressable-a11y',
              'New Pressable has no accessibilityRole or accessibilityLabel.',
              getLine(sourceFile, node),
              'warning'
            )
          );
        }
      }
    }

    if (ts.isStringLiteral(node)) {
      for (const match of node.text.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
        if (!allowedColors.has(match[0].toUpperCase())) {
          diagnostics.push(
            diagnostic(
              'unknown-color',
              `Color ${match[0]} is not represented in DESIGN.md or theme.ts.`,
              getLine(sourceFile, node),
              'warning'
            )
          );
        }
      }
    }

    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      SPACING_PROPERTIES.has(node.name.text)
    ) {
      const value = node.initializer;
      if (ts.isNumericLiteral(value) && !SPACING_VALUES.has(Number(value.text))) {
        diagnostics.push(
          diagnostic(
            'spacing-literal',
            `${node.name.text}: ${value.text} is not in the shared spacing scale.`,
            getLine(sourceFile, node),
            'warning'
          )
        );
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const isRoute = relative.startsWith('app/src/app/') && !relative.endsWith('/_layout.tsx');
  const hasSafeAreaOwnership =
    /\bSafeAreaView\b/.test(code) || /\buseSafeAreaInsets\b/.test(code) || /edgeToEdge/.test(code);
  if (isRoute && changedLines === null && !hasSafeAreaOwnership) {
    diagnostics.push(
      diagnostic(
        'safe-area',
        'Changed route has no visible safe-area ownership strategy.',
        1,
        'warning'
      )
    );
  } else if (isRoute && changedLines && [...changedLines].length > 0 && !hasSafeAreaOwnership) {
    diagnostics.push(
      diagnostic(
        'safe-area',
        'Changed route has no visible safe-area ownership strategy.',
        1,
        'warning'
      )
    );
  }

  return diagnostics;
}

function parseArguments(argv) {
  const options = { all: false, paths: [] };
  for (const argument of argv) {
    if (argument === '--all') options.all = true;
    else if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`);
    else options.paths.push(argument);
  }
  return options;
}

function explicitFiles(paths) {
  const files = new Map();
  for (const input of paths) {
    const absolute = path.resolve(APP_ROOT, input);
    if (!fs.existsSync(absolute)) throw new Error(`Audit path does not exist: ${input}`);
    if (fs.statSync(absolute).isDirectory()) {
      for (const file of allSourceFiles(absolute)) files.set(file, null);
    } else if (isSourcePath(absolute)) {
      files.set(absolute, null);
    } else {
      throw new Error(`Audit path is not a TypeScript source under app/src: ${input}`);
    }
  }
  return files;
}

function main() {
  const { all, paths } = parseArguments(process.argv.slice(2));
  const allowedColors = getAllowedColors();
  let files;
  if (all && paths.length) throw new Error('Use either --all or explicit paths, not both.');
  if (all) files = new Map(allSourceFiles().map((file) => [file, null]));
  else if (paths.length) files = explicitFiles(paths);
  else {
    files = new Map(
      [...changedFilesAndLines()].map(([relative, lines]) => [path.join(ROOT, relative), lines])
    );
  }

  let errors = 0;
  let warnings = 0;
  let audited = 0;
  for (const [file, changedLines] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    if (!fs.existsSync(file)) continue;
    audited += 1;
    const diagnostics = auditSource({
      code: fs.readFileSync(file, 'utf8'),
      filePath: file,
      changedLines,
      allowedColors,
    });
    for (const issue of diagnostics) {
      const relative = path.relative(ROOT, file).replaceAll(path.sep, '/');
      const prefix = issue.severity === 'error' ? 'ERROR' : 'WARN';
      console.log(`${prefix} ${relative}:${issue.line} [${issue.code}] ${issue.message}`);
      if (issue.severity === 'error') errors += 1;
      else warnings += 1;
    }
  }

  if (audited === 0) {
    console.log('No changed or untracked app/src TypeScript files to audit.');
    return;
  }

  console.log(`Audited ${audited} file(s): ${errors} error(s), ${warnings} warning(s).`);
  if (errors > 0) process.exitCode = 1;
}

try {
  if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
} catch (error) {
  console.error(`Audit failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
