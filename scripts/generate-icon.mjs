import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const sourcePath = resolve('build/icon.svg');
const outputPath = resolve('build/icon.png');
const svg = await readFile(sourcePath);

await sharp(svg).resize(512, 512).png().toFile(outputPath);
