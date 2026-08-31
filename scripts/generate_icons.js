const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Ensure icons dir
const iconsDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

function createPng(size, primaryColor, accentColor) {
  // Simple solid rounded rectangle PNG with search icon in center
  const width = size;
  const height = size;

  // RGBA buffer
  const rawData = Buffer.alloc(height * (width * 4 + 1));
  let offset = 0;

  const r1 = primaryColor[0], g1 = primaryColor[1], b1 = primaryColor[2];
  const r2 = accentColor[0], g2 = accentColor[1], b2 = accentColor[2];

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      // Background gradient
      const factor = (x + y) / (width + height);
      let r = Math.round(r1 + (40 - r1) * factor * 0.2);
      let g = Math.round(g1 + (116 - g1) * factor * 0.2);
      let b = Math.round(b1 + (240 - b1) * factor * 0.2);
      let a = 255;

      // Rounded corners
      const cornerRadius = size * 0.22;
      let dx = 0, dy = 0;
      if (x < cornerRadius) dx = cornerRadius - x;
      else if (x > width - cornerRadius) dx = x - (width - cornerRadius);
      if (y < cornerRadius) dy = cornerRadius - y;
      else if (y > height - cornerRadius) dy = y - (height - cornerRadius);

      if (dx > 0 && dy > 0) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > cornerRadius) {
          a = 0;
        }
      }

      // Draw magnifying glass / 'F' icon in the middle
      const cx = width / 2;
      const cy = height / 2;
      const radius = size * 0.22;
      const dFromCenter = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      const ringThickness = Math.max(1.5, size * 0.08);

      // Circle rim (yellow)
      if (Math.abs(dFromCenter - radius) <= ringThickness && a > 0) {
        r = r2; g = g2; b = b2;
      }

      // Handle of magnifying glass
      const hx = cx + radius * 0.7;
      const hy = cy + radius * 0.7;
      const handleLen = size * 0.22;
      if (x >= hx && x <= hx + handleLen && Math.abs((y - hy) - (x - hx)) <= ringThickness && a > 0 && x + y < width + height - size * 0.15) {
        r = r2; g = g2; b = b2;
      }

      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  // Compress IDAT
  const compressed = zlib.deflateSync(rawData);

  // Build PNG chunks
  const signature = Buffer.from([137, 80, 78, 79, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type 6 (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // IDAT chunk
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// CRC32 table & function
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Generate 16, 48, 128
[16, 48, 128].forEach(size => {
  const png = createPng(size, [40, 116, 240], [255, 229, 0]);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), png);
  console.log(`Generated icon${size}.png`);
});
