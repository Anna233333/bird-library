const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const source = process.argv[2];
const outputDir = process.argv[3];

if (!source || !outputDir) {
  throw new Error('Usage: node extract-birds.js <source.png> <output-dir>');
}

const birds = [
  { name: 'bird-pigeon-messenger.png', left: 10, top: 5, width: 325, height: 295, seeds: [[130, 145], [275, 50]] },
  { name: 'bird-pigeon-librarian.png', left: 260, top: 5, width: 344, height: 315, seeds: [[190, 145]] },
  // Keep the birds that touch in the original drawing together as group sprites.
  // A gentler paper threshold preserves the blue bird's pale neck feathers.
  { name: 'bird-blue.png', left: 245, top: 292, width: 359, height: 470, seeds: [[90, 160], [250, 145]], paperThreshold: 42 },
  { name: 'bird-green.png', left: 5, top: 315, width: 285, height: 295, seeds: [[70, 145], [195, 155]] },
  { name: 'bird-owl.png', left: 20, top: 616, width: 268, height: 398, seeds: [[126, 155]] },
];

function colorDistance(r, g, b, bg) {
  return Math.sqrt((r - bg.r) ** 2 + (g - bg.g) ** 2 + (b - bg.b) ** 2);
}

function insidePolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

async function removeEdgeBackground(crop, seeds, mask, paperThreshold = 73) {
  const { data, info } = await crop.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  // The source sheet has a flat paper color. Using its measured value avoids
  // nearby birds at a crop edge contaminating a corner-color estimate.
  const bg = { r: 207, g: 195, b: 173 };

  const seen = new Uint8Array(width * height);
  const queue = [];
  for (let x = 0; x < width; x += 1) queue.push([x, 0], [x, height - 1]);
  for (let y = 0; y < height; y += 1) queue.push([0, y], [width - 1, y]);

  let head = 0;
  while (head < queue.length) {
    const [x, y] = queue[head++];
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const p = y * width + x;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * channels;
    if (colorDistance(data[i], data[i + 1], data[i + 2], bg) > paperThreshold) continue;
    data[i + 3] = 0;
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  if (mask) for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (!insidePolygon(x, y, mask)) data[(y * width + x) * channels + 3] = 0;
  }

  // Retain only the connected foreground containing the chosen bird. This
  // deterministically removes neighboring drawings that overlap a crop box.
  const kept = new Uint8Array(width * height);
  const foreground = (x, y) => data[(y * width + x) * channels + 3] > 0;
  const foregroundQueue = [];
  for (const seed of seeds) {
    let [sx, sy] = seed;
    if (!foreground(sx, sy)) {
      let found = false;
      for (let radius = 1; radius < 60 && !found; radius += 1) {
        for (let y = Math.max(0, sy - radius); y <= Math.min(height - 1, sy + radius) && !found; y += 1) {
          for (let x = Math.max(0, sx - radius); x <= Math.min(width - 1, sx + radius); x += 1) {
            if (foreground(x, y)) { sx = x; sy = y; found = true; break; }
          }
        }
      }
    }
    foregroundQueue.push([sx, sy]);
  }
  head = 0;
  while (head < foregroundQueue.length) {
    const [x, y] = foregroundQueue[head++];
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const p = y * width + x;
    if (kept[p] || !foreground(x, y)) continue;
    kept[p] = 1;
    for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
      if (ox || oy) foregroundQueue.push([x + ox, y + oy]);
    }
  }
  for (let p = 0; p < kept.length; p += 1) if (!kept[p]) data[p * channels + 3] = 0;

  return sharp(data, { raw: info }).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } });
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const metadata = await sharp(source).metadata();
  for (const bird of birds) {
    const safe = {
      left: Math.max(0, bird.left), top: Math.max(0, bird.top),
      width: Math.min(bird.width, metadata.width - bird.left),
      height: Math.min(bird.height, metadata.height - bird.top),
    };
    const transparent = await removeEdgeBackground(sharp(source).extract(safe), bird.seeds, bird.mask, bird.paperThreshold);
    await transparent.png({ compressionLevel: 9 }).toFile(path.join(outputDir, bird.name));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
