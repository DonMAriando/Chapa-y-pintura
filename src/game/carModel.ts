import * as THREE from 'three';
import { CarColorOption, DebrisPartType } from './types';
import { createCarLiveryTexture } from './textures';

export interface CarMeshRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  chassisMesh: THREE.Mesh;
  chassisBasePos: Float32Array;
  cabinMesh: THREE.Mesh;
  cabinBasePos: Float32Array;
  bodyMat: THREE.MeshStandardMaterial;
  trimMat: THREE.MeshStandardMaterial;
  glassMat: THREE.MeshStandardMaterial;
  detachableParts: Record<DebrisPartType, THREE.Object3D>;
  partMaterials: THREE.MeshStandardMaterial[];
  wheels: {
    pivot: THREE.Group;
    spinMesh: THREE.Group;
    baseY: number;
    isFront: boolean;
  }[];
  flames: THREE.Mesh[];
  brakeLights: THREE.Mesh[];
  headlightBeam: THREE.SpotLight | null;
  contactShadow: THREE.Mesh;
  basePrimaryColor: THREE.Color;
  dispose: () => void;
}

const _localHit = new THREE.Vector3();
const _localDir = new THREE.Vector3();
const _invQuat = new THREE.Quaternion();

export function buildDerbyCarMesh(
  colorOpt: CarColorOption,
  carNumber: string,
  contactShadowTex: THREE.CanvasTexture,
  maxAnisotropy: number,
  isPlayer: boolean,
  isSoftwareGl: boolean,
): CarMeshRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const disposables: { dispose: () => void }[] = [];

  const liveryTex = createCarLiveryTexture(
    colorOpt.primaryHex,
    colorOpt.stripeHex,
    colorOpt.numberText,
    carNumber,
    maxAnisotropy,
  );
  disposables.push(liveryTex);

  const basePrimaryColor = new THREE.Color(colorOpt.primaryHex);

  const bodyMat = new THREE.MeshStandardMaterial({
    map: liveryTex,
    roughness: 0.34,
    metalness: 0.62,
  });
  const solidPaintMat = new THREE.MeshStandardMaterial({
    color: colorOpt.primaryHex,
    roughness: 0.36,
    metalness: 0.6,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: colorOpt.stripeHex,
    roughness: 0.42,
    metalness: 0.35,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x262930,
    roughness: 0.58,
    metalness: 0.82,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xd4d8e0,
    roughness: 0.22,
    metalness: 0.92,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0e1726,
    roughness: 0.14,
    metalness: 0.85,
  });
  const rollcageMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.4,
    metalness: 0.65,
  });
  disposables.push(
    bodyMat,
    solidPaintMat,
    stripeMat,
    trimMat,
    chromeMat,
    glassMat,
    rollcageMat,
  );

  // 1. Subdivided Deformable Main Chassis (lower muscle hull)
  const chassisGeo = new THREE.BoxGeometry(2.06, 0.74, 4.46, 8, 4, 14);
  // Sculpt slightly tapered nose & fender flare
  const cPos = chassisGeo.attributes.position;
  for (let i = 0; i < cPos.count; i++) {
    let x = cPos.getX(i);
    let y = cPos.getY(i);
    const z = cPos.getZ(i);
    if (y > 0.2 && Math.abs(z) > 1.7) {
      y -= 0.07; // slight hood/trunk slope
    }
    if (z > 1.8) {
      x *= 0.94; // tapered front nose
    }
    cPos.setXYZ(i, x, y, z);
  }
  chassisGeo.computeVertexNormals();
  const chassisBasePos = new Float32Array(cPos.array);

  const chassisMesh = new THREE.Mesh(chassisGeo, solidPaintMat);
  chassisMesh.position.set(0, 0.66, 0);
  chassisMesh.castShadow = !isSoftwareGl;
  chassisMesh.receiveShadow = true;
  bodyPivot.add(chassisMesh);
  disposables.push(chassisGeo);

  // 2. Subdivided Deformable Cabin / Roof
  const cabinGeo = new THREE.BoxGeometry(1.74, 0.62, 1.98, 6, 3, 6);
  const cabPos = cabinGeo.attributes.position;
  for (let i = 0; i < cabPos.count; i++) {
    let x = cabPos.getX(i);
    const y = cabPos.getY(i);
    let z = cabPos.getZ(i);
    if (y > 0) {
      x *= 0.87;
      z *= 0.84; // sloped A/C pillars
    }
    cabPos.setXYZ(i, x, y, z);
  }
  cabinGeo.computeVertexNormals();
  const cabinBasePos = new Float32Array(cabPos.array);

  const cabinMesh = new THREE.Mesh(cabinGeo, bodyMat);
  cabinMesh.position.set(0, 1.29, -0.18);
  cabinMesh.castShadow = !isSoftwareGl;
  cabinMesh.receiveShadow = true;
  bodyPivot.add(cabinMesh);
  disposables.push(cabinGeo);

  // 3. Internal Steel Rollcage Bars (visible along cabin sides & roof)
  const cageGeo = new THREE.CylinderGeometry(0.055, 0.055, 1.75, 8);
  const cageGroup = new THREE.Group();
  const barPositions = [
    [-0.72, 1.24, -0.18],
    [0.72, 1.24, -0.18],
  ];
  for (const [bx, by, bz] of barPositions) {
    const b = new THREE.Mesh(cageGeo, rollcageMat);
    b.position.set(bx, by, bz);
    b.rotation.x = Math.PI / 2;
    cageGroup.add(b);
  }
  bodyPivot.add(cageGroup);
  disposables.push(cageGeo);

  // 4. Front & Rear Windshields
  const windGeo = new THREE.PlaneGeometry(1.48, 0.56);
  const frontGlass = new THREE.Mesh(windGeo, glassMat);
  frontGlass.position.set(0, 1.28, 0.75);
  frontGlass.rotation.x = -0.34;
  bodyPivot.add(frontGlass);

  const rearGlass = new THREE.Mesh(windGeo, glassMat);
  rearGlass.position.set(0, 1.28, -1.11);
  rearGlass.rotation.x = 0.36;
  rearGlass.rotation.y = Math.PI;
  bodyPivot.add(rearGlass);
  disposables.push(windGeo);

  // 5. Detachable Parts
  // Hood with muscle supercharger intake
  const hoodGroup = new THREE.Group();
  hoodGroup.position.set(0, 1.04, 1.38);
  const hoodPlateGeo = new THREE.BoxGeometry(1.72, 0.1, 1.48);
  const hoodPlate = new THREE.Mesh(hoodPlateGeo, bodyMat);
  const scoopGeo = new THREE.BoxGeometry(0.62, 0.2, 0.65);
  const scoop = new THREE.Mesh(scoopGeo, chromeMat);
  scoop.position.set(0, 0.12, -0.08);
  hoodGroup.add(hoodPlate, scoop);
  bodyPivot.add(hoodGroup);
  disposables.push(hoodPlateGeo, scoopGeo);

  // Trunk lid
  const trunkGeo = new THREE.BoxGeometry(1.74, 0.1, 1.05);
  const trunkMesh = new THREE.Mesh(trunkGeo, solidPaintMat);
  trunkMesh.position.set(0, 1.04, -1.68);
  bodyPivot.add(trunkMesh);
  disposables.push(trunkGeo);

  // Reinforced Front Derby Push-Bumper
  const bumperFGroup = new THREE.Group();
  bumperFGroup.position.set(0, 0.52, 2.34);
  const bfBarGeo = new THREE.BoxGeometry(2.14, 0.34, 0.32);
  const bfBar = new THREE.Mesh(bfBarGeo, chromeMat);
  const bullbarGeo = new THREE.BoxGeometry(1.5, 0.42, 0.14);
  const bullbar = new THREE.Mesh(bullbarGeo, trimMat);
  bullbar.position.set(0, 0.18, 0.12);
  bumperFGroup.add(bfBar, bullbar);
  bodyPivot.add(bumperFGroup);
  disposables.push(bfBarGeo, bullbarGeo);

  // Rear Bumper
  const bumperRGeo = new THREE.BoxGeometry(2.1, 0.32, 0.28);
  const bumperRMesh = new THREE.Mesh(bumperRGeo, trimMat);
  bumperRMesh.position.set(0, 0.52, -2.32);
  bodyPivot.add(bumperRMesh);
  disposables.push(bumperRGeo);

  // Left & Right Doors (with racing number livery)
  const doorGeo = new THREE.BoxGeometry(0.14, 0.62, 1.75);
  const doorLMesh = new THREE.Mesh(doorGeo, bodyMat);
  doorLMesh.position.set(-1.03, 0.68, -0.05);
  const doorRMesh = new THREE.Mesh(doorGeo, bodyMat);
  doorRMesh.position.set(1.03, 0.68, -0.05);
  bodyPivot.add(doorLMesh, doorRMesh);
  disposables.push(doorGeo);

  // Rear Spoiler Wing
  const spoilerGroup = new THREE.Group();
  spoilerGroup.position.set(0, 1.24, -2.14);
  const wingGeo = new THREE.BoxGeometry(1.88, 0.08, 0.38);
  const wingMesh = new THREE.Mesh(wingGeo, stripeMat);
  wingMesh.rotation.x = 0.16;
  const strutGeo = new THREE.BoxGeometry(0.08, 0.24, 0.2);
  const strutL = new THREE.Mesh(strutGeo, trimMat);
  strutL.position.set(-0.62, -0.14, 0);
  const strutR = new THREE.Mesh(strutGeo, trimMat);
  strutR.position.set(0.62, -0.14, 0);
  spoilerGroup.add(wingMesh, strutL, strutR);
  bodyPivot.add(spoilerGroup);
  disposables.push(wingGeo, strutGeo);

  const detachableParts: Record<DebrisPartType, THREE.Object3D> = {
    hood: hoodGroup,
    trunk: trunkMesh,
    bumperF: bumperFGroup,
    bumperR: bumperRMesh,
    doorL: doorLMesh,
    doorR: doorRMesh,
    spoiler: spoilerGroup,
  };

  // 6. Headlights, Taillights & Twin Exhaust Pipes + Nitro Flames
  const headGeo = new THREE.BoxGeometry(0.32, 0.16, 0.08);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff5d6 });
  const hlL = new THREE.Mesh(headGeo, headMat);
  hlL.position.set(-0.68, 0.76, 2.24);
  const hlR = new THREE.Mesh(headGeo, headMat);
  hlR.position.set(0.68, 0.76, 2.24);
  bodyPivot.add(hlL, hlR);
  disposables.push(headGeo, headMat);

  const tailGeo = new THREE.BoxGeometry(0.36, 0.15, 0.08);
  const tailMatL = new THREE.MeshBasicMaterial({ color: 0x991b1b });
  const tailMatR = new THREE.MeshBasicMaterial({ color: 0x991b1b });
  const tlL = new THREE.Mesh(tailGeo, tailMatL);
  tlL.position.set(-0.68, 0.76, -2.24);
  const tlR = new THREE.Mesh(tailGeo, tailMatR);
  tlR.position.set(0.68, 0.76, -2.24);
  bodyPivot.add(tlL, tlR);
  disposables.push(tailGeo, tailMatL, tailMatR);

  let headlightBeam: THREE.SpotLight | null = null;
  if (isPlayer && !isSoftwareGl) {
    headlightBeam = new THREE.SpotLight(
      0xfff0c8,
      28,
      36,
      Math.PI / 4.2,
      0.55,
      1.4,
    );
    headlightBeam.position.set(0, 1.0, 2.1);
    headlightBeam.target.position.set(0, 0.2, 16);
    bodyPivot.add(headlightBeam);
    bodyPivot.add(headlightBeam.target);
  }

  const pipeGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.35, 8);
  pipeGeo.rotateX(Math.PI / 2);
  const flameGeo = new THREE.ConeGeometry(0.16, 0.95, 8);
  flameGeo.rotateX(-Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  disposables.push(pipeGeo, flameGeo, flameMat);

  const flames: THREE.Mesh[] = [];
  for (const px of [-0.52, 0.52]) {
    const pipe = new THREE.Mesh(pipeGeo, chromeMat);
    pipe.position.set(px, 0.34, -2.26);
    bodyPivot.add(pipe);

    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(px, 0.34, -2.8);
    flame.visible = false;
    bodyPivot.add(flame);
    flames.push(flame);
  }

  // 7. Four Articulated Wheels (pivoted at tire bottom y = 0)
  const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 16);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x15171c,
    roughness: 0.9,
    metalness: 0.08,
  });
  const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.36, 10);
  rimGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.BoxGeometry(0.38, 0.08, 0.36);
  disposables.push(tireGeo, tireMat, rimGeo, hubGeo);

  const wheelDefs = [
    { x: -1.04, y: 0.42, z: 1.42, isFront: true },
    { x: 1.04, y: 0.42, z: 1.42, isFront: true },
    { x: -1.06, y: 0.42, z: -1.36, isFront: false },
    { x: 1.06, y: 0.42, z: -1.36, isFront: false },
  ];

  const wheels: CarMeshRig['wheels'] = [];
  for (const wd of wheelDefs) {
    const pivot = new THREE.Group();
    pivot.position.set(wd.x, wd.y, wd.z);

    const spinMesh = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = !isSoftwareGl;
    const rim = new THREE.Mesh(rimGeo, chromeMat);
    const spoke = new THREE.Mesh(hubGeo, trimMat);
    spinMesh.add(tire, rim, spoke);
    pivot.add(spinMesh);
    root.add(pivot);

    wheels.push({
      pivot,
      spinMesh,
      baseY: wd.y,
      isFront: wd.isFront,
    });
  }

  // 8. Soft Contact Shadow Grounding Plane
  const shadowGeo = new THREE.PlaneGeometry(3.2, 5.4);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTex,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.04;
  root.add(contactShadow);
  disposables.push(shadowGeo, shadowMat);

  return {
    root,
    bodyPivot,
    chassisMesh,
    chassisBasePos,
    cabinMesh,
    cabinBasePos,
    bodyMat,
    trimMat,
    glassMat,
    detachableParts,
    partMaterials: [bodyMat, solidPaintMat, stripeMat],
    wheels,
    flames,
    brakeLights: [tlL, tlR],
    headlightBeam,
    contactShadow,
    basePrimaryColor,
    dispose() {
      for (const d of disposables) {
        d.dispose();
      }
    },
  };
}

function deformGeometryAroundPoint(
  geometry: THREE.BufferGeometry,
  basePositions: Float32Array,
  localPoint: THREE.Vector3,
  localInwardDir: THREE.Vector3,
  radius: number,
  maxDepth: number,
  jitterSeed: number,
): void {
  const posAttr = geometry.attributes.position as THREE.BufferAttribute;
  const arr = posAttr.array as Float32Array;
  const rSq = radius * radius;

  for (let i = 0; i < posAttr.count; i++) {
    const ix = i * 3;
    const x = arr[ix];
    const y = arr[ix + 1];
    const z = arr[ix + 2];

    const dx = x - localPoint.x;
    const dy = y - localPoint.y;
    const dz = z - localPoint.z;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq < rSq) {
      const falloff = 1 - Math.sqrt(distSq) / radius;
      const crumple = falloff * falloff * maxDepth;
      const noise = Math.sin(i * 12.9898 + jitterSeed) * 0.045 * falloff;

      const nx = x + localInwardDir.x * crumple + noise;
      const ny = y + localInwardDir.y * crumple + Math.abs(noise) * 0.8;
      const nz = z + localInwardDir.z * crumple + noise;

      // Clamp maximum inward displacement relative to original base geometry so car never turns inside out
      const bx = basePositions[ix];
      const by = basePositions[ix + 1];
      const bz = basePositions[ix + 2];

      arr[ix] = THREE.MathUtils.clamp(nx, bx - 0.58, bx + 0.58);
      arr[ix + 1] = THREE.MathUtils.clamp(ny, by - 0.35, by + 0.38);
      arr[ix + 2] = THREE.MathUtils.clamp(nz, bz - 0.72, bz + 0.72);
    }
  }

  posAttr.needsUpdate = true;
  geometry.computeVertexNormals();
}

export function applyMeshImpactDeformation(
  rig: CarMeshRig,
  worldHitPoint: THREE.Vector3,
  worldInwardNormal: THREE.Vector3,
  intensity: number,
  hpRatio: number,
): void {
  // Convert hit point & inward normal into car body local space
  _localHit.copy(worldHitPoint);
  rig.bodyPivot.worldToLocal(_localHit);

  _invQuat.copy(rig.root.quaternion).invert();
  _localDir
    .copy(worldInwardNormal)
    .applyQuaternion(_invQuat)
    .normalize();

  const depth = THREE.MathUtils.clamp(intensity * 0.38, 0.08, 0.44);

  // Deform chassis (offset by chassis local y = 0.66)
  const chassisHit = _localHit.clone();
  chassisHit.y -= 0.66;
  deformGeometryAroundPoint(
    rig.chassisMesh.geometry,
    rig.chassisBasePos,
    chassisHit,
    _localDir,
    1.55,
    depth,
    performance.now() * 0.01,
  );

  // Deform cabin if impact is high or severe
  if (_localHit.y > 0.75 || intensity > 0.55) {
    const cabinHit = _localHit.clone();
    cabinHit.y -= 1.29;
    cabinHit.z += 0.18;
    deformGeometryAroundPoint(
      rig.cabinMesh.geometry,
      rig.cabinBasePos,
      cabinHit,
      _localDir,
      1.3,
      depth * 0.72,
      performance.now() * 0.02,
    );
  }

  // Twist remaining attached parts slightly crooked as damage accumulates
  const crookedness = (1 - hpRatio) * 0.14;
  rig.detachableParts.hood.rotation.z =
    Math.sin(hpRatio * 37) * crookedness * 1.4;
  rig.detachableParts.hood.rotation.x = -(1 - hpRatio) * 0.09;
  rig.detachableParts.bumperF.rotation.z =
    Math.cos(hpRatio * 23) * crookedness * 1.8;
  rig.detachableParts.bumperR.rotation.z =
    Math.sin(hpRatio * 19) * crookedness * 1.6;
}

export function updateCarDamageVisuals(rig: CarMeshRig, hpRatio: number, wrecked: boolean): void {
  const wear = 1 - THREE.MathUtils.clamp(hpRatio, 0, 1);
  for (const mat of rig.partMaterials) {
    // Scuff paint toward charred/dirty steel as HP drops
    mat.roughness = THREE.MathUtils.lerp(0.35, 0.94, wear);
    mat.metalness = THREE.MathUtils.lerp(0.62, 0.25, wear);
    if (wrecked) {
      mat.color.setHex(0x26211e);
    } else if (mat !== rig.bodyMat) {
      mat.color.copy(rig.basePrimaryColor).lerp(new THREE.Color(0x2e2723), wear * 0.65);
    } else {
      // bodyMat uses livery texture; darken tint progressively
      mat.color.setHex(0xffffff).lerp(new THREE.Color(0x4a3f39), wear * 0.78);
    }
  }

  if (wrecked) {
    rig.glassMat.color.setHex(0x050507);
    rig.glassMat.roughness = 0.85;
    if (rig.headlightBeam) {
      rig.headlightBeam.intensity = 0;
    }
  }
}

export function resetCarMeshRig(rig: CarMeshRig): void {
  const cPos = rig.chassisMesh.geometry.attributes.position as THREE.BufferAttribute;
  (cPos.array as Float32Array).set(rig.chassisBasePos);
  cPos.needsUpdate = true;
  rig.chassisMesh.geometry.computeVertexNormals();

  const cabPos = rig.cabinMesh.geometry.attributes.position as THREE.BufferAttribute;
  (cabPos.array as Float32Array).set(rig.cabinBasePos);
  cabPos.needsUpdate = true;
  rig.cabinMesh.geometry.computeVertexNormals();

  for (const part of Object.values(rig.detachableParts)) {
    part.visible = true;
    part.rotation.set(0, 0, 0);
  }

  for (const mat of rig.partMaterials) {
    mat.roughness = 0.35;
    mat.metalness = 0.62;
    if (mat === rig.bodyMat) {
      mat.color.setHex(0xffffff);
    } else {
      mat.color.copy(rig.basePrimaryColor);
    }
  }

  rig.glassMat.color.setHex(0x0e1726);
  rig.glassMat.roughness = 0.14;
  if (rig.headlightBeam) {
    rig.headlightBeam.intensity = 28;
  }
}

export function createDetachedDebrisMesh(
  type: DebrisPartType,
  primaryHex: string,
  stripeHex: string,
): THREE.Group {
  const g = new THREE.Group();
  const paintMat = new THREE.MeshStandardMaterial({
    color: primaryHex,
    roughness: 0.55,
    metalness: 0.5,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x262930,
    roughness: 0.6,
    metalness: 0.78,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: stripeHex,
    roughness: 0.5,
    metalness: 0.4,
  });

  if (type === 'hood') {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(1.65, 0.1, 1.4),
      paintMat,
    );
    const scoop = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.18, 0.6),
      trimMat,
    );
    scoop.position.y = 0.12;
    g.add(plate, scoop);
  } else if (type === 'trunk') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.1, 1.0), paintMat));
  } else if (type === 'bumperF' || type === 'bumperR') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.3, 0.28), trimMat));
  } else if (type === 'doorL' || type === 'doorR') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.58, 1.65), paintMat));
  } else {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.08, 0.36), stripeMat));
  }

  return g;
}
