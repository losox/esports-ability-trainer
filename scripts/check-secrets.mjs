import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const SECRET_PATTERNS = [
  /(?:api[_-]?key|api[_-]?secret)\s*[:=]\s*['"][^'"]{20,}['"]/gi,
  /(?:secret|token|password|passwd)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
  /(?:sk_|pk_|AKIA|ghp_|gho_|ghu_|ghs_|ghr_|xox[baprs]-)[A-Za-z0-9]{20,}/g,
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |)PRIVATE KEY-----/g,
  /supabase[_-]?url\s*[:=]\s*['"]https?:\/\/[^'"]+['"]/gi,
  /supabase[_-]?key\s*[:=]\s*['"][^'"]{20,}['"]/gi,
];

const ALLOWED_FILES = ['.env.example', 'docs/', '.husky/'];

try {
  const staged = execSync('git diff --cached --name-only --diff-filter=ACM', {
    encoding: 'utf-8',
  })
    .trim()
    .split('\n')
    .filter(Boolean);

  let found = false;

  for (const file of staged) {
    if (ALLOWED_FILES.some((allowed) => file.startsWith(allowed))) continue;
    if (!file.match(/\.(ts|tsx|js|jsx|mjs|astro|json|env)$/)) continue;
    if (!existsSync(file)) continue;

    const content = readFileSync(file, 'utf-8');
    for (const pattern of SECRET_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        console.error(`\x1b[31m[SECRET DETECTED] ${file}: ${matches[0].substring(0, 50)}...\x1b[0m`);
        found = true;
      }
    }
  }

  if (found) {
    console.error('\n\x1b[31mCommit blocked: secrets detected in staged files.\x1b[0m');
    console.error('Move secrets to .env.local and use import.meta.env.* to access them.');
    process.exit(1);
  }

  console.log('\x1b[32m[check-secrets] No secrets detected.\x1b[0m');
} catch (err) {
  if (err.status === 1 && err.stdout === undefined) {
    console.error('\x1b[31m[check-secrets] Error running check:', err.message, '\x1b[0m');
    process.exit(1);
  }
}
