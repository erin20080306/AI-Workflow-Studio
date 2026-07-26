import 'server-only';

import { parseEnvironment, type AppEnvironment } from './env-schema';

let cachedEnvironment: AppEnvironment | undefined;

export function getEnvironment(): AppEnvironment {
  cachedEnvironment ??= parseEnvironment(process.env);
  return cachedEnvironment;
}
