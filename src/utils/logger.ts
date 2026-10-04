type LogLevel = 'error' | 'warn' | 'info' | 'debug';
//  error: Критические сбои. требующие немедленного вмешательства
//  warn: Потенциальные проблемы, не ломающие функционал
// info: Ключевые точки бизнес- логики для аудита'
//  debug:Технические детали для диагностики
const levels: Record<LogLevel, number> = {
  error: 0, warn: 1, info: 2, debug: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function log(level: LogLevel, message: string, meta?: unknown) {
  if (levels[level] > levels[currentLevel]) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta } : {}),
  };
  console.log(JSON.stringify(entry));
}

export const logger = {
  error: (msg: string, meta?: unknown) => log('error', msg, meta),
  warn: (msg: string, meta?: unknown) => log('warn', msg, meta),
  info: (msg: string, meta?: unknown) => log('info', msg, meta),
  debug: (msg: string, meta?: unknown) => log('debug', msg, meta),
};