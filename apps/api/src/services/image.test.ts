import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { InvalidImageError, processUploadedImage } from './image.js';

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), 'mehdi-photo-'));
  dirs.push(dir);
  return dir;
}

describe('processUploadedImage', () => {
  it('redimensionne et recompresse une image valide en JPEG', async () => {
    const dir = await tempDir();
    const filePath = path.join(dir, 'upload-abc123');
    const original = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toBuffer();
    await writeFile(filePath, original);

    const filename = await processUploadedImage(filePath);

    expect(filename).toBe('upload-abc123.jpg');
    const metadata = await sharp(path.join(dir, filename)).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBeLessThanOrEqual(1600);
    expect(metadata.height).toBeLessThanOrEqual(1600);
  });

  it('rejette un fichier qui n’est pas une image, même avec une extension trompeuse', async () => {
    const dir = await tempDir();
    const filePath = path.join(dir, 'upload-fake.jpg');
    await writeFile(filePath, Buffer.from('ceci nest pas une image'));

    await expect(processUploadedImage(filePath)).rejects.toBeInstanceOf(InvalidImageError);
  });
});
