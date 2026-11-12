import * as THREE from 'three';
import {
  ARENA_PILLARS,
  ARENA_RADIUS,
  ARENA_RAMPS,
  groundHeightAt,
  NITRO_PAD_COORDS,
  PillarObstacle,
  RampDef,
} from './arenaMath';
import {
  createBarrierTexture,
  createDirtArenaTexture,
} from './textures';

export { ARENA_PILLARS, ARENA_RADIUS, ARENA_RAMPS, groundHeightAt };
export type { PillarObstacle, RampDef };

export interface NitroPad {
  x: number;
  z: number;
  radius: number;
  cooldown: number;
  ringMesh: THREE.Mesh;
  coreMesh: THREE.Mesh;
  light: THREE.PointLight | null;
}

const _nVec = new THREE.Vector3();
export function groundNormalAt(
  x: number,
  z: number,
  target: THREE.Vector3 = _nVec,
): THREE.Vector3 {
  const eps = 0.45;
  const hL = groundHeightAt(x - eps, z);
  const hR = groundHeightAt(x + eps, z);
  const hD = groundHeightAt(x, z - eps);
  const hU = groundHeightAt(x, z + eps);
  target.set(hL - hR, 2 * eps, hD - hU).normalize();
  return target;
}

export interface ArenaBuildResult {
  group: THREE.Group;
  nitroPads: NitroPad[];
  update: (dt: number, elapsed: number) => void;
  dispose: () => void;
}

export function buildDerbyArena(
  scene: THREE.Scene,
  maxAnisotropy: number,
  isSoftwareGl: boolean,
): ArenaBuildResult {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  // Night stadium sky & matching exponential horizon fog
  const fogColor = 0x0b0e16;
  scene.background = new THREE.Color(fogColor);
  scene.fog = new THREE.FogExp2(fogColor, 0.0076);

  // 3-Point + Floodlight Stadium Rig (<= 3 shadow casters)
  const hemi = new THREE.HemisphereLight(0x3a5280, 0x2c1d12, 0.95);
  group.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xffdfb0, 2.2);
  keyLight.position.set(36, 54, 28);
  keyLight.castShadow = !isSoftwareGl;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 10;
  keyLight.shadow.camera.far = 155;
  const d = 64;
  keyLight.shadow.camera.left = -d;
  keyLight.shadow.camera.right = d;
  keyLight.shadow.camera.top = d;
  keyLight.shadow.camera.bottom = -d;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.03;
  group.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x6094d8, 0.9);
  rimLight.position.set(-48, 26, -42);
  group.add(rimLight);

  // 1. Extended Outer Dirt Terrain (prevents empty void outside stadium)
  const { colorMap: dirtMap, roughnessMap: dirtRoughMap } =
    createDirtArenaTexture(maxAnisotropy);
  disposables.push(dirtMap, dirtRoughMap);

  const outerGeo = new THREE.RingGeometry(ARENA_RADIUS - 1, 240, 64, 4);
  outerGeo.rotateX(-Math.PI / 2);
  const outerMat = new THREE.MeshStandardMaterial({
    color: 0x1a1410,
    roughness: 0.96,
    metalness: 0.02,
  });
  const outerGround = new THREE.Mesh(outerGeo, outerMat);
  outerGround.position.y = -0.05;
  outerGround.receiveShadow = true;
  group.add(outerGround);
  disposables.push(outerGeo, outerMat);

  // 2. High-detail sculpted playable dirt bowl & ramps
  const arenaSpan = (ARENA_RADIUS + 4) * 2;
  const arenaGeo = new THREE.PlaneGeometry(arenaSpan, arenaSpan, 96, 96);
  arenaGeo.rotateX(-Math.PI / 2);
  const posAttr = arenaGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    posAttr.setY(i, groundHeightAt(vx, vz));
  }
  arenaGeo.computeVertexNormals();

  const arenaMat = new THREE.MeshStandardMaterial({
    map: dirtMap,
    roughnessMap: dirtRoughMap,
    roughness: 0.88,
    metalness: 0.04,
  });
  const arenaMesh = new THREE.Mesh(arenaGeo, arenaMat);
  arenaMesh.receiveShadow = true;
  group.add(arenaMesh);
  disposables.push(arenaGeo, arenaMat);

  // Visual hazard planks / metal edges on ramp lips so players spot ramps from far away
  const rampLipGeo = new THREE.BoxGeometry(6.8, 0.28, 0.55);
  const rampLipMat = new THREE.MeshStandardMaterial({
    color: 0xeab308,
    roughness: 0.45,
    metalness: 0.3,
    emissive: 0x422800,
    emissiveIntensity: 0.45,
  });
  disposables.push(rampLipGeo, rampLipMat);

  for (const r of ARENA_RAMPS) {
    const lip = new THREE.Mesh(rampLipGeo, rampLipMat);
    const sin = Math.sin(r.yaw);
    const cos = Math.cos(r.yaw);
    lip.position.set(
      r.cx + sin * r.halfL,
      r.height - 0.04,
      r.cz + cos * r.halfL,
    );
    lip.rotation.y = r.yaw;
    lip.scale.x = (r.halfW * 2) / 6.8;
    lip.castShadow = true;
    lip.receiveShadow = true;
    group.add(lip);
  }

  // 3. Circular Arena Retaining Wall & Hazard Markings
  const barrierTex = createBarrierTexture(maxAnisotropy);
  disposables.push(barrierTex);

  const wallHeight = 2.65;
  const wallGeo = new THREE.CylinderGeometry(
    ARENA_RADIUS + 0.6,
    ARENA_RADIUS + 0.6,
    wallHeight,
    72,
    1,
    true,
  );
  const wallMat = new THREE.MeshStandardMaterial({
    map: barrierTex,
    roughness: 0.72,
    metalness: 0.25,
    side: THREE.DoubleSide,
  });
  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  wallMesh.position.y = wallHeight * 0.5 + 0.6;
  wallMesh.receiveShadow = true;
  group.add(wallMesh);
  disposables.push(wallGeo, wallMat);

  // Top guardrail rim
  const rimGeo = new THREE.TorusGeometry(ARENA_RADIUS + 0.7, 0.35, 8, 72);
  rimGeo.rotateX(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x525866,
    roughness: 0.45,
    metalness: 0.72,
  });
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.position.y = wallHeight + 0.65;
  group.add(rimMesh);
  disposables.push(rimGeo, rimMat);

  // Instanced stacked rubber tires lining the inner perimeter
  const tireCount = 112;
  const tireGeo = new THREE.TorusGeometry(0.75, 0.32, 8, 16);
  tireGeo.rotateX(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x16181d,
    roughness: 0.9,
    metalness: 0.08,
  });
  const tireInstanced = new THREE.InstancedMesh(tireGeo, tireMat, tireCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < tireCount; i++) {
    const stackIdx = i % 2;
    const angle = (Math.floor(i / 2) / (tireCount / 2)) * Math.PI * 2;
    const rad = ARENA_RADIUS - 0.65;
    const tx = Math.cos(angle) * rad;
    const tz = Math.sin(angle) * rad;
    const ty = groundHeightAt(tx, tz) + 0.32 + stackIdx * 0.58;
    dummy.position.set(tx, ty, tz);
    dummy.rotation.set(
      (Math.sin(i * 3.1) - 0.5) * 0.08,
      angle,
      (Math.cos(i * 2.7) - 0.5) * 0.08,
    );
    const sc = 0.92 + (i % 3) * 0.06;
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    tireInstanced.setMatrixAt(i, dummy.matrix);
  }
  tireInstanced.instanceMatrix.needsUpdate = true;
  tireInstanced.computeBoundingSphere();
  tireInstanced.castShadow = !isSoftwareGl;
  tireInstanced.receiveShadow = true;
  group.add(tireInstanced);
  disposables.push(tireGeo, tireMat);

  // 4. Concrete & Hazard Steel Arena Pillars
  const pillarGeo = new THREE.CylinderGeometry(1.75, 1.95, 4.6, 12);
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x3b4048,
    roughness: 0.78,
    metalness: 0.22,
  });
  const bandGeo = new THREE.CylinderGeometry(1.88, 1.88, 0.7, 12);
  const bandMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.45,
    metalness: 0.25,
    emissive: 0x451a03,
    emissiveIntensity: 0.4,
  });
  disposables.push(pillarGeo, pillarMat, bandGeo, bandMat);

  for (const p of ARENA_PILLARS) {
    const py = groundHeightAt(p.x, p.z);
    const pil = new THREE.Mesh(pillarGeo, pillarMat);
    pil.position.set(p.x, py + 2.2, p.z);
    pil.castShadow = !isSoftwareGl;
    pil.receiveShadow = true;
    group.add(pil);

    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.set(p.x, py + 1.25, p.z);
    group.add(band);
  }

  // 5. Outer Stadium Grandstands & 4 Towering Floodlight Pylons
  const standCount = 18;
  const standGeo = new THREE.BoxGeometry(16, 7.5, 9);
  const standMat = new THREE.MeshStandardMaterial({
    color: 0x151923,
    roughness: 0.88,
    metalness: 0.15,
  });
  const standInst = new THREE.InstancedMesh(standGeo, standMat, standCount);
  for (let i = 0; i < standCount; i++) {
    const angle = (i / standCount) * Math.PI * 2;
    const rad = ARENA_RADIUS + 14;
    dummy.position.set(Math.cos(angle) * rad, 3.6, Math.sin(angle) * rad);
    dummy.rotation.set(0, -angle + Math.PI / 2, 0);
    dummy.scale.set(1, 0.85 + (i % 3) * 0.14, 1);
    dummy.updateMatrix();
    standInst.setMatrixAt(i, dummy.matrix);
  }
  standInst.instanceMatrix.needsUpdate = true;
  standInst.computeBoundingSphere();
  group.add(standInst);
  disposables.push(standGeo, standMat);

  const towerAngles = [
    Math.PI * 0.25,
    Math.PI * 0.75,
    Math.PI * 1.25,
    Math.PI * 1.75,
  ];
  const poleGeo = new THREE.CylinderGeometry(0.55, 0.95, 29, 8);
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x2c3340,
    roughness: 0.5,
    metalness: 0.8,
  });
  const headGeo = new THREE.BoxGeometry(7.2, 2.2, 1.4);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff3d1 });
  const coneGeo = new THREE.ConeGeometry(18, 34, 16, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xffe4b5,
    transparent: true,
    opacity: 0.045,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  disposables.push(poleGeo, poleMat, headGeo, bulbMat, coneGeo, coneMat);

  for (let i = 0; i < towerAngles.length; i++) {
    const a = towerAngles[i];
    const tx = Math.cos(a) * (ARENA_RADIUS + 10);
    const tz = Math.sin(a) * (ARENA_RADIUS + 10);

    const towerGroup = new THREE.Group();
    towerGroup.position.set(tx, 0, tz);
    towerGroup.lookAt(0, 0, 0);

    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 14.5;
    towerGroup.add(pole);

    const lampBank = new THREE.Mesh(headGeo, bulbMat);
    lampBank.position.set(0, 28.5, 0.8);
    lampBank.rotation.x = 0.45;
    towerGroup.add(lampBank);

    // Subtle volumetric halogen light cone
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(0, 16, 11.5);
    cone.rotation.x = -0.82;
    towerGroup.add(cone);

    // Warm floodlight pool over each quadrant (PointLight is very fast, no extra shadow casters)
    const flood = new THREE.PointLight(0xffdca8, 120, 95, 1.35);
    flood.position.set(
      Math.cos(a) * (ARENA_RADIUS * 0.56),
      20,
      Math.sin(a) * (ARENA_RADIUS * 0.56),
    );
    group.add(flood);

    group.add(towerGroup);
  }

  // 6. Four Glowing Nitro Recharge Pads in the Dirt
  const nitroPads: NitroPad[] = [];
  const padRingGeo = new THREE.RingGeometry(1.7, 2.35, 24);
  padRingGeo.rotateX(-Math.PI / 2);
  const padCoreGeo = new THREE.CircleGeometry(1.55, 24);
  padCoreGeo.rotateX(-Math.PI / 2);
  disposables.push(padRingGeo, padCoreGeo);

  for (const coord of NITRO_PAD_COORDS) {
    const py = groundHeightAt(coord.x, coord.z);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const ringMesh = new THREE.Mesh(padRingGeo, ringMat);
    ringMesh.position.set(coord.x, py + 0.07, coord.z);

    const coreMesh = new THREE.Mesh(padCoreGeo, coreMat);
    coreMesh.position.set(coord.x, py + 0.06, coord.z);

    const padLight = isSoftwareGl
      ? null
      : new THREE.PointLight(0x06b6d4, 9, 10, 2);
    if (padLight) {
      padLight.position.set(coord.x, py + 1.1, coord.z);
      group.add(padLight);
    }

    group.add(ringMesh, coreMesh);
    disposables.push(ringMat, coreMat);

    nitroPads.push({
      x: coord.x,
      z: coord.z,
      radius: 2.5,
      cooldown: 0,
      ringMesh,
      coreMesh,
      light: padLight,
    });
  }

  scene.add(group);

  return {
    group,
    nitroPads,
    update(dt: number, elapsed: number) {
      for (const pad of nitroPads) {
        if (pad.cooldown > 0) {
          pad.cooldown = Math.max(0, pad.cooldown - dt);
        }
        const ready = pad.cooldown <= 0;
        const ringMat = pad.ringMesh.material as THREE.MeshBasicMaterial;
        const coreMat = pad.coreMesh.material as THREE.MeshBasicMaterial;
        if (ready) {
          const shimmer = 0.72 + Math.sin(elapsed * 4.5) * 0.28;
          ringMat.color.setHex(0x06b6d4);
          coreMat.opacity = 0.28 + shimmer * 0.16;
          pad.ringMesh.scale.setScalar(0.95 + shimmer * 0.08);
          if (pad.light) pad.light.intensity = 7 + shimmer * 4;
        } else {
          ringMat.color.setHex(0x334155);
          coreMat.opacity = 0.06;
          pad.ringMesh.scale.setScalar(0.86);
          if (pad.light) pad.light.intensity = 0.5;
        }
      }
    },
    dispose() {
      scene.remove(group);
      for (const item of disposables) {
        item.dispose();
      }
    },
  };
}
