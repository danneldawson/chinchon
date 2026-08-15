'use strict';

// Input layer that works both interactively (TTY) and with piped/scripted
// input. Node's readline.question does not reliably fire its callback when
// stdin is a file or pipe, so non-TTY input is buffered and served line by line.

const readline = require('node:readline');

function createInput() {
  const isTTY = process.stdin.isTTY;

  if (isTTY) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return {
      ask: (q) => new Promise((res) => rl.question(q, (a) => res(a.trim()))),
      close: () => rl.close(),
      scripted: false,
    };
  }

  // Piped input: read everything up front, then serve it.
  const data = require('node:fs').readFileSync(0, 'utf8');
  const lines = data.split('\n');
  let i = 0;

  return {
    ask: async (q) => {
      process.stdout.write(q);
      if (i >= lines.length) {
        process.stdout.write('\n');
        throw new Error('INPUT_EXHAUSTED');
      }
      const answer = (lines[i++] || '').trim();
      process.stdout.write(answer + '\n');
      return answer;
    },
    close: () => {},
    scripted: true,
  };
}

module.exports = { createInput };
