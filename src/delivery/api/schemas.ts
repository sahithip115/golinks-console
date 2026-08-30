import { z } from 'zod';
import { PHASES, SCENARIOS } from '../domain/types.ts';

export const launchSchema = z.object({
  scenario: z.enum(SCENARIOS, { message: `Scenario must be one of: ${SCENARIOS.join(', ')}` }),
  ask: z
    .string()
    .trim()
    .min(12, 'Describe the ask in at least 12 characters')
    .max(1000, 'The ask must be 1000 characters or fewer'),
  breakPhase: z.enum(PHASES).nullish(),
});

export const signOffSchema = z.object({
  reviewer: z
    .string()
    .trim()
    .min(2, 'A reviewer name of at least 2 characters is required')
    .max(60, 'Reviewer name must be 60 characters or fewer'),
  approved: z.boolean({ message: 'State whether the rollout is approved' }),
  comment: z.string().trim().max(240, 'Comment must be 240 characters or fewer').nullish(),
});

export const revisionSchema = z.object({
  ask: z
    .string()
    .trim()
    .min(12, 'Describe the revised ask in at least 12 characters')
    .max(1000, 'The ask must be 1000 characters or fewer'),
});

export const runIdParamSchema = z.object({ runId: z.uuid('Run id must be a UUID') });

export const artifactParamSchema = z.object({
  runId: z.uuid('Run id must be a UUID'),
  artifactId: z.uuid('Artifact id must be a UUID'),
});

export const scenarioParamSchema = z.object({ scenario: z.enum(SCENARIOS) });

export type LaunchInput = z.infer<typeof launchSchema>;
export type SignOffInput = z.infer<typeof signOffSchema>;
export type RevisionInput = z.infer<typeof revisionSchema>;
