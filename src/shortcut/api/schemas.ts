import { z } from 'zod';

/**
 * Request shapes live next to the routes that accept them. Zod gives one place
 * to state a rule and one place it can fail, and the inferred types keep the
 * service signatures honest.
 */
export const newShortcutSchema = z.object({
  url: z.string().min(1, 'A destination URL is required'),
  alias: z.string().max(32, 'Alias must be 32 characters or fewer').nullish(),
  owner: z.string().max(60, 'Owner must be 60 characters or fewer').nullish(),
  note: z.string().max(160, 'Note must be 160 characters or fewer').nullish(),
  lifetimeDays: z.coerce
    .number()
    .int('Lifetime must be a whole number of days')
    .min(1, 'Lifetime must be at least 1 day')
    .nullish(),
});

export const shortcutPatchSchema = z
  .object({
    enabled: z.boolean().nullish(),
    extendByDays: z.coerce
      .number()
      .int('Extension must be a whole number of days')
      .min(1, 'Extension must be at least 1 day')
      .nullish(),
  })
  .refine(
    (patch) => patch.enabled !== null && patch.enabled !== undefined
      ? true
      : patch.extendByDays !== null && patch.extendByDays !== undefined,
    { message: 'Send "enabled" or "extendByDays" to change a shortcut' },
  );

export const directoryQuerySchema = z.object({
  q: z.string().max(120, 'Search text must be 120 characters or fewer').optional(),
});

export const codeParamSchema = z.object({
  code: z.string().min(1).max(32),
});

export const forwardQuerySchema = z.object({
  source: z.string().max(240, 'Source URL must be 240 characters or fewer').optional(),
});

export type NewShortcutInput = z.infer<typeof newShortcutSchema>;
export type ShortcutPatchInput = z.infer<typeof shortcutPatchSchema>;
