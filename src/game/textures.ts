import * as THREE from 'three';

function seededRand(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function createDirtArenaTexture(maxAnisotropy: number): {
  colorMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = 1024;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;

  const rand = seededRand(4217);

  // Base rich compacted stadium dirt
  ctx.fillStyle = '#4A3423';
  ctx.fillRect(0, 0, size, size);

  rCtx.fillStyle = '#D8D8D8';
  rCtx.fillRect(0, 0, size, size);

  // Broad soil patches and damp mud puddles
  for (let i = 0; i < 420; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const rad = 18 + rand() * 75;
    const dark = rand() > 0.45;
    const grad = ctx.createRadialGradient(x, y, 2, x, y, rad);
    grad.addColorStop(
      0,
      dark ? 'rgba(38, 24, 15, 0.36)' : 'rgba(104, 74, 48, 0.28)',
    );
    grad.addColorStop(1, 'rgba(74, 52, 35, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();

    // Damp darker mud patches have lower roughness (sheen under floodlights)
    if (dark && rand() > 0.55) {
      const rGrad = rCtx.createRadialGradient(x, y, 2, x, y, rad * 0.85);
      rGrad.addColorStop(0, 'rgba(95, 95, 95, 0.55)');
      rGrad.addColorStop(1, 'rgba(216, 216, 216, 0)');
      rCtx.fillStyle = rGrad;
      rCtx.beginPath();
      rCtx.arc(x, y, rad * 0.85, 0, Math.PI * 2);
      rCtx.fill();
    }
  }

  // Sweeping tire ruts across the dirt
  ctx.lineCap = 'round';
  for (let i = 0; i < 64; i++) {
    const startX = rand() * size;
    const startY = rand() * size;
    const angle = rand() * Math.PI * 2;
    const len = 90 + rand() * 220;
    const endX = startX + Math.cos(angle) * len;
    const endY = startY + Math.sin(angle) * len;
    const cx = (startX + endX) * 0.5 + (rand() - 0.5) * 65;
    const cy = (startY + endY) * 0.5 + (rand() - 0.5) * 65;

    ctx.strokeStyle = 'rgba(26, 17, 10, 0.26)';
    ctx.lineWidth = 4 + rand() * 6;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(cx, cy, endX, endY);
    ctx.stroke();
  }

  // Fine gravel & grit speckles
  for (let i = 0; i < 5500; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const w = 1 + rand() * 2.5;
    ctx.fillStyle =
      rand() > 0.5 ? 'rgba(130, 98, 70, 0.35)' : 'rgba(22, 14, 9, 0.35)';
    ctx.fillRect(x, y, w, w);
  }

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.RepeatWrapping;
  colorMap.repeat.set(7, 7);
  colorMap.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(7, 7);
  roughnessMap.anisotropy = maxAnisotropy;

  return { colorMap, roughnessMap };
}

export function createCarLiveryTexture(
  primaryHex: string,
  stripeHex: string,
  numberText: string,
  carNumber: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Painted steel base
  ctx.fillStyle = primaryHex;
  ctx.fillRect(0, 0, size, size);

  // Twin racing / derby stripes
  ctx.fillStyle = stripeHex;
  ctx.fillRect(size * 0.36, 0, size * 0.1, size);
  ctx.fillRect(size * 0.54, 0, size * 0.1, size);

  // Subtle grime & weld marks along lower edge
  const grime = ctx.createLinearGradient(0, size * 0.65, 0, size);
  grime.addColorStop(0, 'rgba(0,0,0,0)');
  grime.addColorStop(1, 'rgba(18,14,10,0.45)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, size * 0.65, size, size * 0.35);

  // Door / roof number roundel
  ctx.fillStyle = stripeHex;
  ctx.beginPath();
  ctx.arc(size * 0.5, size * 0.5, 86, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = primaryHex;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(size * 0.5, size * 0.5, 76, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = numberText;
  ctx.font = 'bold 88px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(carNumber, size * 0.5, size * 0.52);

  // Scratches
  const rand = seededRand(carNumber.charCodeAt(0) * 97);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 24; i++) {
    const sx = rand() * size;
    const sy = rand() * size;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (rand() - 0.5) * 40, sy + (rand() - 0.5) * 14);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

export function createBarrierTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#333842';
  ctx.fillRect(0, 0, 512, 128);

  // Hazard yellow & black chevrons on top rail
  for (let x = -64; x < 576; x += 64) {
    ctx.fillStyle = (Math.floor(x / 64) % 2 === 0) ? '#EAB308' : '#18181B';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 36, 0);
    ctx.lineTo(x + 12, 42);
    ctx.lineTo(x - 24, 42);
    ctx.closePath();
    ctx.fill();
  }

  // Concrete / steel corrugated lower barrier with tire scuff marks
  ctx.fillStyle = '#2B303A';
  ctx.fillRect(0, 42, 512, 86);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  for (let y = 52; y < 120; y += 18) {
    ctx.fillRect(0, y, 512, 6);
  }
  ctx.fillStyle = 'rgba(15, 15, 18, 0.5)';
  ctx.fillRect(40, 56, 90, 32);
  ctx.fillRect(280, 62, 120, 28);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(24, 1);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.14,
    size * 0.5,
    size * 0.5,
    size * 0.5,
  );
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.4)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSoftParticleTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    2,
    size * 0.5,
    size * 0.5,
    size * 0.5,
  );
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.55)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createTireSkidTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(20, 13, 8, 0.75)';
  ctx.fillRect(8, 0, 18, 64);
  ctx.fillRect(38, 0, 18, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
