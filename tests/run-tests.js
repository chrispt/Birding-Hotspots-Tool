// Minimal test runner for browser-style ES modules in Node.
// Discovers *.test.js files under tests/ and runs exported tests.

import fs from 'fs';
import path from 'path';
import url from 'url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testsDir = __dirname;

/**
 * Simple colored logger helpers.
 */
const colors = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

/**
 * Recursively collect all *.test.js files under a directory.
 */
function collectTestFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Very small assertion helper.
 */
export function assert(condition, message = 'Assertion failed') {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Run all tests exported from a module.
 * A test is any exported function whose name starts with 'test'.
 */
async function runTestModule(filePath) {
  const relPath = path.relative(process.cwd(), filePath);
  console.log(colors.yellow(`\nRunning tests in ${relPath}`));

  const moduleUrl = url.pathToFileURL(filePath).href;
  const mod = await import(moduleUrl);

  const testNames = Object.keys(mod).filter((k) => typeof mod[k] === 'function' && k.startsWith('test'));
  if (testNames.length === 0) {
    console.log(colors.yellow('  (no test* exports found)'));
    return { passed: 0, failed: 0 };
  }

  let passed = 0;
  let failed = 0;

  for (const name of testNames) {
    try {
      await mod[name]();
      console.log(`  ${colors.green('✓')} ${name}`);
      passed += 1;
    } catch (err) {
      console.log(`  ${colors.red('✗')} ${name}`);
      console.error(err);
      failed += 1;
    }
  }

  return { passed, failed };
}

async function main() {
  const files = collectTestFiles(testsDir);
  if (files.length === 0) {
    console.log(colors.yellow('No *.test.js files found under tests/.'));
    process.exit(0);
  }

  let totalPassed = 0;
  let totalFailed = 0;

  for (const file of files) {
    const { passed, failed } = await runTestModule(file);
    totalPassed += passed;
    totalFailed += failed;
  }

  console.log('\n======================');
  console.log(colors.green(`Passed: ${totalPassed}`));
  console.log(colors.red(`Failed: ${totalFailed}`));
  console.log('======================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

// Only run when executed directly with Node.
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

