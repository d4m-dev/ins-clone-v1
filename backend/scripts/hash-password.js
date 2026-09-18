#!/usr/bin/env node
'use strict';

/**
 * scripts/hash-password.js
 * Generates a bcrypt hash for the AdminJS / seed password without ever writing
 * the plain password into the repository.
 *
 *   npm run admin:passwd                 # prompts (input hidden)
 *   npm run admin:passwd -- "MyPass123"  # inline (avoid: lands in shell history)
 *
 * Then paste the output into .env →  ADMIN_PASSWORD_HASH=$2a$10$…
 */

const readline = require('readline');
const bcrypt = require('bcryptjs');
const { env } = require('../config/env');

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (char) => {
      const text = char.toString();
      if (text === '\n' || text === '\r' || text === '\u0004') return;
      // Redraw the prompt so the secret never appears on screen.
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(question);
    };
    process.stdin.on('data', onData);
    rl.question(question, (answer) => {
      process.stdin.removeListener('data', onData);
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

(async () => {
  const inline = process.argv[2];
  const password = inline || (await askHidden('New admin password: '));

  if (!password || password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const rounds = env.auth.saltRounds;
  const hash = await bcrypt.hash(password, rounds);

  console.log('\nAdd this line to backend/.env (replace the existing one):\n');
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log('\n(and set ADMIN_PASSWORD= empty so the fallback is never used)\n');
})();
