// In-memory ZIP packaging via archiver — the export package (manifest + loader stub) never
// touches disk, matching how every other worker in this repo treats intermediate artifacts as
// buffers.
import archiver from 'archiver';
import { PassThrough } from 'node:stream';

export interface ZipEntry {
  name: string;
  content: string | Buffer;
}

export async function zipFiles(entries: ZipEntry[]): Promise<Buffer> {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const passthrough = new PassThrough();
  const chunks: Buffer[] = [];

  const finished = new Promise<Buffer>((resolve, reject) => {
    passthrough.on('data', (chunk: Buffer) => chunks.push(chunk));
    passthrough.on('end', () => resolve(Buffer.concat(chunks)));
    passthrough.on('error', reject);
    archive.on('error', reject);
  });

  archive.pipe(passthrough);
  for (const entry of entries) {
    archive.append(typeof entry.content === 'string' ? Buffer.from(entry.content, 'utf8') : entry.content, { name: entry.name });
  }
  await archive.finalize();

  return finished;
}
