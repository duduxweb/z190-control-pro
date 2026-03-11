'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');

const LOGS_DIR = path.join(__dirname, 'logs');

function ensureLogsDir() {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function timestamp() {
  return new Date().toISOString();
}

function logFilePath() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOGS_DIR, `${date}.log`);
}

function formatDetails(details) {
  if (details === undefined) return '';
  if (typeof details === 'string') return details;
  return util.inspect(details, { depth: 8, colors: false, compact: true, breakLength: 160 });
}

function writeLog(scope, step, details) {
  ensureLogsDir();
  const line = `[${scope} ${timestamp()}] ${step}${details === undefined ? '' : ` ${formatDetails(details)}`}`;
  console.log(line);
  fs.appendFileSync(logFilePath(), `${line}\n`, 'utf8');
}

module.exports = {
  LOGS_DIR,
  ensureLogsDir,
  formatDetails,
  timestamp,
  writeLog,
};
