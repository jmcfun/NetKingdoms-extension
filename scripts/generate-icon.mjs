// Generates a 128x128 PNG icon for NetKingdoms notifications
import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'

const SIZE = 128

function crc32(buf) {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = (table[(crc ^ b) & 0xff] ^ (crc >>> 8)) >>> 0
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBytes = Buffer.from(type, 'ascii')
  const payload = Buffer.concat([typeBytes, data])
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(payload))
  return Buffer.concat([len, typeBytes, data, crcBuf])
}

// Build RGBA pixels: rounded rect bg + gradient overlay
const pixels = new Uint8Array(SIZE * SIZE * 4)
const cx = SIZE / 2, cy = SIZE / 2, r = 28, pad = 4

function inRoundedRect(x, y) {
  const dx = Math.max(pad + r - x, x - (SIZE - pad - r), 0)
  const dy = Math.max(pad + r - y, y - (SIZE - pad - r), 0)
  return dx * dx + dy * dy <= r * r
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4
    if (!inRoundedRect(x, y)) {
      pixels[i + 3] = 0 // transparent
      continue
    }
    // Background: dark navy
    const t = (x + y) / (2 * SIZE)
    // Blend from #3c82f6 (blue) to #22c55e (green) diagonally
    const r_ = Math.round(0x3c + t * (0x22 - 0x3c))
    const g_ = Math.round(0x82 + t * (0xc5 - 0x82))
    const b_ = Math.round(0xf6 + t * (0x5e - 0xf6))
    pixels[i]     = r_
    pixels[i + 1] = g_
    pixels[i + 2] = b_
    pixels[i + 3] = 255
  }
}

// Write sword / crown shape in white (simplified ⚔ approximation)
const white = (x, y) => {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE || !inRoundedRect(x, y)) return
  const i = (y * SIZE + x) * 4
  pixels[i] = 255; pixels[i+1] = 255; pixels[i+2] = 255; pixels[i+3] = 230
}
// Vertical bar (sword blade)
for (let y = 24; y < 104; y++) for (let x = 60; x < 68; x++) white(x, y)
// Crossguard
for (let x = 44; x < 84; x++) for (let y = 52; y < 60; y++) white(x, y)
// Pommel
for (let y = 98; y < 108; y++) for (let x = 58; x < 70; x++) white(x, y)

// Build raw PNG scanlines (RGBA, filter byte 0 per row)
const stride = 1 + SIZE * 4
const raw = new Uint8Array(SIZE * stride)
for (let y = 0; y < SIZE; y++) {
  raw[y * stride] = 0
  raw.set(pixels.slice(y * SIZE * 4, (y + 1) * SIZE * 4), y * stride + 1)
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8; ihdr[9] = 6  // bit depth 8, RGBA

const idat = deflateSync(Buffer.from(raw), { level: 9 })
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])

mkdirSync('./public/icons', { recursive: true })
writeFileSync('./public/icons/icon-128.png', png)
console.log(`Generated icon-128.png (${png.length} bytes)`)
