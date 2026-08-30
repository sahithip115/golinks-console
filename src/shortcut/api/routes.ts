import type { FastifyInstance } from 'fastify';
import { callerAddress, parse } from '../../shared/http.ts';
import type { ShortcutService } from '../service/shortcut-service.ts';
import {
  codeParamSchema,
  directoryQuerySchema,
  newShortcutSchema,
  shortcutPatchSchema,
} from './schemas.ts';

export interface ShortcutRoutesOptions {
  shortcuts: ShortcutService;
  redirectPrefix: string;
}

/**
 * The shortcut API. Codes are served from their own prefix (/go by default) so a
 * code can never shadow an endpoint or a static asset.
 */
export async function registerShortcutRoutes(
  app: FastifyInstance,
  { shortcuts, redirectPrefix }: ShortcutRoutesOptions,
): Promise<void> {
  app.get('/api/v1/shortcuts', (request) => {
    const { q } = parse(directoryQuerySchema, request.query);
    return shortcuts.directory(q);
  });

  app.post('/api/v1/shortcuts', (request, reply) => {
    const created = shortcuts.register(parse(newShortcutSchema, request.body));
    request.log.info({ code: created.code, owner: created.owner }, 'shortcut registered');
    return reply.code(201).send(created);
  });

  app.get('/api/v1/shortcuts/:code', (request) => {
    const { code } = parse(codeParamSchema, request.params);
    return shortcuts.read(code);
  });

  app.get('/api/v1/shortcuts/:code/usage', (request) => {
    const { code } = parse(codeParamSchema, request.params);
    return shortcuts.usage(code);
  });

  app.patch('/api/v1/shortcuts/:code', (request) => {
    const { code } = parse(codeParamSchema, request.params);
    return shortcuts.amend(code, parse(shortcutPatchSchema, request.body ?? {}));
  });

  app.delete('/api/v1/shortcuts/:code', (request) => {
    const { code } = parse(codeParamSchema, request.params);
    const retired = shortcuts.retire(code);
    request.log.info({ code: retired.code }, 'shortcut switched off');
    return retired;
  });

  app.get(`${redirectPrefix}/:code`, (request, reply) => {
    const { code } = parse(codeParamSchema, request.params);
    const destination = shortcuts.forward(code, {
      address: callerAddress(request),
      agent: request.headers['user-agent'],
      referrer: request.headers.referer,
    });
    return reply.header('cache-control', 'no-store').redirect(destination, 302);
  });
}
