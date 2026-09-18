'use strict';

/**
 * utils/logger.js
 * Tiny dependency-free logger with timestamps and (optionally) colours.
 * Keeps output readable inside `concurrently`'s interleaved streams.
 */

const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const useColor = process.stdout.isTTY || process.env.FORCE_COLOR === '1';
const paint = (color, text) => (useColor ? `${COLORS[color]}${text}${COLORS.reset}` : text);

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function write(stream, color, level, args) {
  stream.write(`${paint('gray', stamp())} ${paint(color, level.padEnd(7))} ${args.join(' ')}\n`);
}

const logger = {
  info: (...args) => write(process.stdout, 'cyan', 'info', args),
  success: (...args) => write(process.stdout, 'green', 'ok', args),
  warn: (...args) => write(process.stderr, 'yellow', 'warn', args),
  error: (...args) => write(process.stderr, 'red', 'error', args),
  debug: (...args) => {
    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG === 'true') {
      write(process.stdout, 'gray', 'debug', args);
    }
  },
  banner: (lines = []) => {
    const width = Math.max(...lines.map((line) => line.length), 20) + 4;
    const bar = '─'.repeat(width);
    process.stdout.write(`\n${paint('magenta', `┌${bar}┐`)}\n`);
    lines.forEach((line) =>
      process.stdout.write(
        `${paint('magenta', '│')}  ${line.padEnd(width - 3)}${paint('magenta', '│')}\n`
      )
    );
    process.stdout.write(`${paint('magenta', `└${bar}┘`)}\n\n`);
  },
};

module.exports = logger;
