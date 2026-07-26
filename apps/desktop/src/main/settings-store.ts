import { z } from 'zod';

import { readPrivateFile, writePrivateFile } from './private-files';

const SettingsSchema = z
  .object({
    autoStart: z.boolean().default(false),
    privacyMode: z.boolean().default(true),
  })
  .strict();

export type DesktopSettings = z.infer<typeof SettingsSchema>;

export class SettingsStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<DesktopSettings> {
    const content = await readPrivateFile(this.filePath);
    if (content === undefined) {
      return SettingsSchema.parse({});
    }
    return SettingsSchema.parse(JSON.parse(content) as unknown);
  }

  async save(settings: DesktopSettings): Promise<DesktopSettings> {
    const validated = SettingsSchema.parse(settings);
    await writePrivateFile(this.filePath, JSON.stringify(validated));
    return validated;
  }
}
