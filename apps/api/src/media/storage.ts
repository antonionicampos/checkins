import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Tipos aceitos, reconhecidos pelos primeiros bytes do arquivo (não pelo que o celular diz). */
const SIGNATURES: { ext: string; kind: 'image' | 'pdf'; mime: string; test: (b: Buffer) => boolean }[] = [
  { ext: 'jpg', kind: 'image', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', kind: 'image', mime: 'image/png', test: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  {
    ext: 'webp',
    kind: 'image',
    mime: 'image/webp',
    test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  { ext: 'pdf', kind: 'pdf', mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
];

export function detectFileType(data: Buffer) {
  return SIGNATURES.find((s) => s.test(data));
}

export const MIME_BY_EXT = Object.fromEntries(SIGNATURES.map((s) => [s.ext, s.mime])) as Record<string, string>;

/** Nome gerado pela API: 32 caracteres hexadecimais e a extensão. Qualquer outro nome é recusado. */
export const MEDIA_FILE_PATTERN = /^[a-f0-9]{32}\.(jpg|png|webp|pdf)$/;

/** Grava o arquivo em `<mediaDir>/<folder>/` com um nome aleatório e devolve esse nome. */
export async function saveMedia(mediaDir: string, folder: string, data: Buffer, ext: string): Promise<string> {
  const dir = join(mediaDir, folder);
  await mkdir(dir, { recursive: true });
  const name = `${randomBytes(16).toString('hex')}.${ext}`;
  await writeFile(join(dir, name), data, { flag: 'wx' });
  return name;
}

export async function deleteMedia(mediaDir: string, folder: string, name: string) {
  if (!MEDIA_FILE_PATTERN.test(name)) return;
  await unlink(join(mediaDir, folder, name)).catch(() => {});
}
