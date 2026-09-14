import imageSizeModule from 'image-size';

function probeImageSize(buffer) {
  const fn = typeof imageSizeModule === 'function' ? imageSizeModule : imageSizeModule.imageSize;
  return fn(buffer);
}
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { generateRandomFileName } from '../utils/crypto.js';
import { HttpError } from '../utils/httpError.js';

export const ALLOWED_PHOTO_MIME = ['image/jpeg', 'image/png'];
export const ALLOWED_PHOTO_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png' };
export const MAX_PHOTO_BYTES = env.upload.maxSizeMb * 1024 * 1024;

const storage = multer.memoryStorage();

export const uploadPhoto = multer({
  storage,
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_PHOTO_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new HttpError(400, 'INVALID_PHOTO_TYPE', 'Photo must be a JPEG or PNG image.'));
    }
  }
}).single('photo');

function sniffMimeType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 8 && buffer.readUInt32BE(0) === 0x89504e47) {
    return 'image/png';
  }
  return null;
}

/**
 * Persist an uploaded photo buffer to disk with a randomized filename.
 * Validates: MIME allow-list (magic-byte sniff, not just the client header),
 * size cap, and decodable image dimensions.
 *
 * @returns {Promise<{ photoUrl: string, dimensions: { width, height } }>}
 */
export async function storeUploadedPhoto(file, uploadDir = env.upload.dir) {
  if (!file) {
    throw new HttpError(400, 'PHOTO_REQUIRED', 'A photo file is required for registration.');
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new HttpError(
      400,
      'PHOTO_TOO_LARGE',
      `Photo exceeds the maximum allowed size of ${env.upload.maxSizeMb}MB.`
    );
  }

  const sniffed = sniffMimeType(file.buffer);
  if (!sniffed && !ALLOWED_PHOTO_MIME.includes(file.mimetype)) {
    throw new HttpError(400, 'INVALID_PHOTO_TYPE', 'Photo must be a JPEG or PNG image.');
  }

  let dimensions;
  try {
    dimensions = probeImageSize(file.buffer);
  } catch {
    throw new HttpError(400, 'INVALID_PHOTO_DATA', 'Photo could not be read as an image.');
  }
  if (!dimensions?.width || !dimensions?.height) {
    throw new HttpError(400, 'INVALID_PHOTO_DATA', 'Photo has invalid dimensions.');
  }
  // Sanity bounds — rejects absurd aspect ratios rather than trusting a
  // client-side crop.
  if (dimensions.width < 100 || dimensions.height < 100 || dimensions.width > 8000 || dimensions.height > 8000) {
    throw new HttpError(
      400,
      'INVALID_PHOTO_DIMENSIONS',
      'Photo dimensions must be between 100 and 8000 pixels on each side.'
    );
  }

  if (dimensions.type !== 'jpg' && dimensions.type !== 'png') {
    throw new HttpError(400, 'INVALID_PHOTO_TYPE', 'Photo must be a JPEG or PNG image.');
  }

  const ext = dimensions.type === 'png' ? '.png' : '.jpg';
  const fileName = generateRandomFileName(ext);
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(path.join(uploadDir, fileName), file.buffer);

  return { photoUrl: `/uploads/${fileName}`, dimensions };
}

export async function readStoredPhoto(photoUrl, uploadDir = env.upload.dir) {
  if (!photoUrl) return null;
  const fileName = path.basename(photoUrl);
  const fullPath = path.join(uploadDir, fileName);
  const data = await fs.readFile(fullPath);
  const ext = path.extname(fileName).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  return { data, mime, fileName };
}