#!/usr/bin/env node
/**
 * Secret leak detector for CI.
 * Scans source code for secret-bearing identifiers passed to logging/DOM sinks.
 * This is not a cryptographic secrets detector; it's a pattern gate against accidental
 * debugger prints and error messages that expose keys/passphrases.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.resolve(projectRoot, 'src');

// Secret-bearing identifiers. These should never be passed to sinks.
const SECRET_IDENTIFIERS = [
  'mnemonic',
  'privateKey',
  'secretKey',
  'passphrase',
  'password',
  'sessionKey',
  'ephemeralKey',
  'derivedKey',
];

// Sinks where secrets leak. Each has a pattern and how to extract arguments.
const SINK_PATTERNS = [
  { name: 'console.log', pattern: /console\.log\s*\(/ },
  { name: 'console.info', pattern: /console\.info\s*\(/ },
  { name: 'console.debug', pattern: /console\.debug\s*\(/ },
  { name: 'throw new Error', pattern: /throw\s+new\s+Error\s*\(/ },
  { name: 'error message', pattern: /throw\s+new\s+\w+Error\s*\(\s*`/ },
  { name: 'element.innerHTML', pattern: /\.innerHTML\s*=/ },
  { name: 'element.textContent', pattern: /\.textContent\s*=/ },
];

function walkDir(dir) {
  const files = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...walkDir(fullPath));
      } else if (
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.endsWith('.d.ts')
      ) {
        files.push(fullPath);
      }
    }
  } catch {
    // Skip unreadable directories
  }
  return files;
}

function findLeaks(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const leaks = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // Skip comments and test fixtures
    if (
      line.trim().startsWith('//') ||
      line.trim().startsWith('*') ||
      filePath.includes('.test.')
    ) {
      continue;
    }

    // Scan for sink patterns
    for (const sink of SINK_PATTERNS) {
      if (!sink.pattern.test(line)) continue;

      // Extract the argument list by paren balancing
      const match = sink.pattern.exec(line);
      if (!match) continue;

      let depth = 0;
      let started = false;
      let argText = '';
      scan: for (let j = i; j < Math.min(lines.length, i + 6); j += 1) {
        const from = j === i ? match.index + match[0].length - 1 : 0;
        const current = lines[j];
        for (let k = from; k < current.length; k += 1) {
          const ch = current[k];
          if (ch === '(') {
            depth += 1;
            started = true;
            if (depth === 1) continue;
          } else if (ch === ')') {
            depth -= 1;
            if (depth === 0) break scan;
          }
          if (started) argText += ch;
        }
        if (started) argText += '\n';
      }

      // Reduce false positives while keeping true positives.
      //
      // 1. Mask the *interior* of string literals so the mere occurrence of a
      //    secret's name in static message text (e.g. '"Private key must be 32
      //    bytes"') is not reported — a literal never carries the value.
      // 2. Template literals keep their `${...}` holes unmasked, because that is
      //    exactly where a secret variable is interpolated into an error string.
      // 3. After masking, an identifier used purely as a size read (`.length`,
      //    `.byteLength`, `.size`) is likewise not a leak — a length is not the
      //    key. So `privateKey.length` is fine, but `privateKey` or a bare
      //    `${keyHex}` interpolation still trips the gate.
      let live = argText.replace(
        /'(?:\\.|(?!['\\\n]).)*'|"(?:\\.|(?!"\\\n).)*"/g,
        (token) => ' '.repeat(token.length),
      );
      for (const id of SECRET_IDENTIFIERS) {
        live = live.replace(
          new RegExp(`\\b${id}\\s*\\.(?:length|byteLength|size)\\b`, 'g'),
          ' '.repeat(id.length + 1),
        );
      }

      // Check the live (non-literal) argument for any remaining secret identifier.
      for (const id of SECRET_IDENTIFIERS) {
        const idPattern = new RegExp(`\\b${id}\\b`);
        if (idPattern.test(live)) {
          leaks.push({
            line: i + 1,
            sink: sink.name,
            secret: id,
            context: argText.slice(0, 100),
          });
        }
      }
    }
  }

  return leaks;
}

// Main
const files = walkDir(srcDir);
const allLeaks = [];

for (const file of files) {
  const leaks = findLeaks(file);
  if (leaks.length > 0) {
    allLeaks.push({ file, leaks });
  }
}

if (allLeaks.length > 0) {
  console.error('FAIL: secret-bearing identifier reaches an exposing sink.\n');
  for (const { file, leaks } of allLeaks) {
    for (const leak of leaks) {
      console.error(
        `  ${path.relative(projectRoot, file)}:${leak.line}  [${leak.sink}]  ${leak.secret}`
      );
    }
  }
  console.error(`\n${allLeaks.length} finding(s). Redact before merging.`);
  process.exit(1);
} else {
  console.log('✓ No secret leaks to logging/DOM sinks.');
  process.exit(0);
}
