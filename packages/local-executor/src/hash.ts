import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

import { LocalExecutorError } from './errors';

export async function hashFile(filePath: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', (error) => {
      reject(
        new LocalExecutorError('FILE_NOT_FOUND', 'The local input file could not be read.', {
          cause: error,
          retryable: true,
        }),
      );
    });
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
