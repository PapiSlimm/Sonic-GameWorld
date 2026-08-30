// @sonic-gameworld/api entry point. Running this file directly starts the HTTP server; importing
// it (e.g. from tests or tooling) just gives you the building blocks with no side effects.
export const SERVICE_NAME = '@sonic-gameworld/api';

export { buildApp, type BuildAppOptions } from './app.js';
export { start } from './server.js';
export { getConfig, loadConfig, type AppConfig } from './config.js';
export { MODULES, type ModuleRegistrar } from './modules/registry.js';

if (import.meta.url === `file://${process.argv[1]}`) {
  const { start } = await import('./server.js');
  await start();
}
