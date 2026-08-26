import { readFileSync } from 'node:fs';

const COMMIT_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
];

const TYPE_PATTERN = COMMIT_TYPES.join('|');
const COMMIT_REGEX = new RegExp(
  `^(?:${TYPE_PATTERN})(?:\\(.+\\))?: .{1,100}`,
);

const msgFile = process.argv[2];
if (!msgFile) {
  console.error('\x1b[31m[commit-msg] No message file provided.\x1b[0m');
  process.exit(1);
}

const message = readFileSync(msgFile, 'utf-8').trim();

if (message.startsWith('Merge') || message.startsWith('Revert')) {
  process.exit(0);
}

const firstLine = message.split('\n')[0];

if (!COMMIT_REGEX.test(firstLine)) {
  console.error('\x1b[31m[commit-msg] Invalid commit message format.\x1b[0m');
  console.error(`\n  Got: "${firstLine}"\n`);
  console.error('  Expected format: type(scope): description');
  console.error(`  Allowed types: ${COMMIT_TYPES.join(', ')}\n`);
  console.error('  Examples:');
  console.error('    feat(auth): add login page');
  console.error('    fix: resolve navigation flicker');
  console.error('    docs: update API documentation\n');
  process.exit(1);
}

console.log('\x1b[32m[commit-msg] Valid conventional commit.\x1b[0m');
