import pino from 'pino';

const transport =
  process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined;

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport,
  base: { service: process.env.SERVICE_NAME || 'astro-webui' },
});

export default logger;

/**
 * Override the log level from SSM Parameter Store.
 * Uses dynamic import to avoid a circular dependency with config.ts.
 */
export async function initLogLevel(): Promise<void> {
  try {
    const { getLogLevel } = await import('./config');
    const level = await getLogLevel();
    logger.level = level;
    logger.info({ level }, 'Log level set from SSM');
  } catch (err) {
    logger.warn({ err }, 'Failed to set log level from SSM, keeping default');
  }
}

// Fire-and-forget: update level from SSM once available.
// The logger is usable immediately at default level.
initLogLevel();
