import { z } from "zod";

export const uiPreferencesSchema = z
  .object({
    density: z.enum(["comfortable", "compact"]),
    revealAnimations: z.boolean(),
  })
  .strict();

export type UiPreferences = z.infer<typeof uiPreferencesSchema>;
