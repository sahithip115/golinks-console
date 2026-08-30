import type { FastifyInstance } from 'fastify';
import { parse } from '../../shared/http.ts';
import { PHASES } from '../domain/types.ts';
import type { DeliveryEngine } from '../service/delivery-engine.ts';
import { SCENARIO_PRESETS, presetFor } from '../service/scenario-library.ts';
import {
  artifactParamSchema,
  launchSchema,
  revisionSchema,
  runIdParamSchema,
  scenarioParamSchema,
  signOffSchema,
} from './schemas.ts';
import { toRunSummary, toRunView } from './views.ts';

export interface DeliveryRoutesOptions {
  engine: DeliveryEngine;
  now: () => Date;
}

export async function registerDeliveryRoutes(
  app: FastifyInstance,
  { engine, now }: DeliveryRoutesOptions,
): Promise<void> {
  app.get('/api/v1/deliveries/meta', () => ({
    phases: PHASES,
    presets: SCENARIO_PRESETS,
  }));

  app.get('/api/v1/deliveries', () => ({
    runs: engine.list().map(toRunSummary),
  }));

  app.post('/api/v1/deliveries', (request, reply) => {
    const run = engine.launch(parse(launchSchema, request.body));
    request.log.info({ runId: run.id, scenario: run.scenario, state: run.state }, 'delivery run launched');
    return reply.code(201).send(toRunView(run, now()));
  });

  app.post('/api/v1/deliveries/presets/:scenario', (request, reply) => {
    const { scenario } = parse(scenarioParamSchema, request.params);
    const preset = presetFor(scenario);
    const run = engine.launch({ scenario: preset.scenario, ask: preset.ask, breakPhase: null });
    return reply.code(201).send(toRunView(run, now()));
  });

  app.get('/api/v1/deliveries/:runId', (request) => {
    const { runId } = parse(runIdParamSchema, request.params);
    return toRunView(engine.get(runId), now());
  });

  app.post('/api/v1/deliveries/:runId/sign-off', (request) => {
    const { runId } = parse(runIdParamSchema, request.params);
    const decision = parse(signOffSchema, request.body);
    const run = engine.recordSignOff(runId, decision);
    request.log.info(
      { runId, reviewer: decision.reviewer, approved: decision.approved, state: run.state },
      'sign-off recorded',
    );
    return toRunView(run, now());
  });

  app.put('/api/v1/deliveries/:runId/ask', (request) => {
    const { runId } = parse(runIdParamSchema, request.params);
    return toRunView(engine.revise(runId, parse(revisionSchema, request.body)), now());
  });

  app.get('/api/v1/deliveries/:runId/artifacts/:artifactId', (request) => {
    const { runId, artifactId } = parse(artifactParamSchema, request.params);
    const artifact = engine.artifact(runId, artifactId);
    return {
      id: artifact.id,
      runId,
      phase: artifact.phase,
      path: artifact.path,
      format: artifact.format,
      digest: artifact.digest,
      body: artifact.body,
      writtenAt: artifact.writtenAt.toISOString(),
    };
  });
}
