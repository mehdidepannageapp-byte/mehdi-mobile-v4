import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 75;

export class InvalidImageError extends Error {}

/**
 * Décode réellement le contenu du fichier (indépendamment de l'extension ou du mimetype déclaré
 * par le client), le redimensionne et le recompresse en JPEG. Rejette tout fichier qui n'est pas
 * une image décodable, et neutralise au passage tout contenu actif (ex. SVG) en le rastérisant.
 */
export async function processUploadedImage(filePath: string): Promise<string> {
  let buffer: Buffer;
  try {
    buffer = await sharp(filePath)
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new InvalidImageError('Le fichier envoyé n’est pas une image valide');
  } finally {
    await fs.unlink(filePath).catch(() => {});
  }
  const filename = `${path.parse(filePath).name}.jpg`;
  await fs.writeFile(path.join(path.dirname(filePath), filename), buffer);
  return filename;
}
