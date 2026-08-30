import { buildApp } from './server.ts';

/** Process entry point: build the app, listen, and shut down cleanly on a signal. */
const { app, config } = await buildApp();

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info({ url: config.baseUrl, env: config.env }, 'golinks console is listening');
} catch (error) {
  app.log.fatal({ err: error }, 'failed to start');
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    void app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}
