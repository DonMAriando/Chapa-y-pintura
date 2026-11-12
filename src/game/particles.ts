import * as THREE from 'three';
import { createSoftParticleTexture, createTireSkidTexture } from './textures';
import { groundHeightAt } from './arena';
import { DebrisPartType } from './types';
import { createDetachedDebrisMesh } from './carModel';

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  sizeStart: number;
  sizeEnd: number;
  gravity: number;
  r: number;
  g: number;
  b: number;
  bounce: boolean;
}

interface DebrisBody {
  mesh: THREE.Group;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  age: number;
  settled: boolean;
}

const MAX_PARTICLES = 420;
const MAX_SKIDS = 240;
const MAX_DEBRIS = 42;

const _dummy = new THREE.Object3D();
const _col = new THREE.Color();

export class EffectsPool {
  private scene: THREE.Scene;
  private particles: ParticleSlot[] = [];
  private particleCursor = 0;

  private particleMesh: THREE.InstancedMesh;
  private particleTex: THREE.CanvasTexture;

  private skidMesh: THREE.InstancedMesh;
  private skidTex: THREE.CanvasTexture;
  private skidCursor = 0;

  private debrisList: DebrisBody[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.particleTex = createSoftParticleTexture();
    this.skidTex = createTireSkidTexture();

    // Soft billboard/sphere-like glowing & dusty particle pool using InstancedMesh
    const pGeo = new THREE.IcosahedronGeometry(0.5, 1);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, MAX_PARTICLES);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        life: 1,
        sizeStart: 0.4,
        sizeEnd: 1.2,
        gravity: 0,
        r: 1,
        g: 1,
        b: 1,
        bounce: false,
      });
      _dummy.position.set(0, -50, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, _col.setRGB(1, 1, 1));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
    scene.add(this.particleMesh);

    // Pooled tire skidmarks in the dirt
    const skidGeo = new THREE.PlaneGeometry(1.9, 1.35);
    skidGeo.rotateX(-Math.PI / 2);
    const skidMat = new THREE.MeshBasicMaterial({
      map: this.skidTex,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.skidMesh = new THREE.InstancedMesh(skidGeo, skidMat, MAX_SKIDS);
    this.skidMesh.frustumCulled = false;
    for (let i = 0; i < MAX_SKIDS; i++) {
      _dummy.position.set(0, -50, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.skidMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.skidMesh.instanceMatrix.needsUpdate = true;
    scene.add(this.skidMesh);
  }

  private spawnParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    sizeStart: number,
    sizeEnd: number,
    gravity: number,
    r: number,
    g: number,
    b: number,
    bounce = false,
  ): void {
    const slot = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;

    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = vx;
    slot.vy = vy;
    slot.vz = vz;
    slot.age = 0;
    slot.life = life;
    slot.sizeStart = sizeStart;
    slot.sizeEnd = sizeEnd;
    slot.gravity = gravity;
    slot.r = r;
    slot.g = g;
    slot.b = b;
    slot.bounce = bounce;
  }

  public emitDirtDust(x: number, y: number, z: number, speedFactor: number): void {
    const spread = 1.8 + speedFactor * 2.2;
    this.spawnParticle(
      x + (Math.random() - 0.5) * 0.8,
      y + 0.2,
      z + (Math.random() - 0.5) * 0.8,
      (Math.random() - 0.5) * spread,
      1.1 + Math.random() * 1.9,
      (Math.random() - 0.5) * spread,
      0.55 + Math.random() * 0.45,
      0.38,
      1.45 + speedFactor * 0.7,
      -0.8,
      0.58 + Math.random() * 0.1,
      0.44 + Math.random() * 0.08,
      0.31,
      false,
    );
  }

  public emitSparks(
    x: number,
    y: number,
    z: number,
    nx: number,
    nz: number,
    count: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const speed = 6 + Math.random() * 13;
      this.spawnParticle(
        x + (Math.random() - 0.5) * 0.35,
        y + Math.random() * 0.35,
        z + (Math.random() - 0.5) * 0.35,
        nx * speed * 0.6 + (Math.random() - 0.5) * 9,
        3.5 + Math.random() * 8.5,
        nz * speed * 0.6 + (Math.random() - 0.5) * 9,
        0.28 + Math.random() * 0.34,
        0.18,
        0.04,
        -22,
        1.0,
        0.65 + Math.random() * 0.35,
        0.12,
        true,
      );
    }
  }

  public emitDamageSmoke(x: number, y: number, z: number, darkness: number): void {
    const shade = THREE.MathUtils.lerp(0.55, 0.14, darkness);
    this.spawnParticle(
      x + (Math.random() - 0.5) * 0.5,
      y + 0.3,
      z + (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 1.4,
      2.6 + Math.random() * 2.4,
      (Math.random() - 0.5) * 1.4,
      0.85 + Math.random() * 0.6,
      0.45,
      1.85,
      0.6,
      shade,
      shade * 0.96,
      shade * 0.92,
      false,
    );
  }

  public emitFire(x: number, y: number, z: number, scale = 1): void {
    const hot = Math.random();
    this.spawnParticle(
      x + (Math.random() - 0.5) * 0.55 * scale,
      y + 0.25,
      z + (Math.random() - 0.5) * 0.55 * scale,
      (Math.random() - 0.5) * 1.6,
      3.4 + Math.random() * 3.2,
      (Math.random() - 0.5) * 1.6,
      0.32 + Math.random() * 0.25,
      0.52 * scale,
      0.12 * scale,
      1.2,
      1.0,
      0.24 + hot * 0.52,
      0.04,
      false,
    );
  }

  public emitWreckBurst(x: number, y: number, z: number): void {
    this.emitSparks(x, y + 0.8, z, 0, 0, 26);
    for (let i = 0; i < 18; i++) {
      this.emitFire(x, y + 0.7, z, 1.55);
    }
    for (let i = 0; i < 12; i++) {
      this.emitDamageSmoke(x, y + 0.9, z, 0.95);
    }
  }

  public addSkidMark(x: number, z: number, yaw: number): void {
    const y = groundHeightAt(x, z) + 0.05;
    _dummy.position.set(x, y, z);
    _dummy.rotation.set(0, yaw, 0);
    _dummy.scale.set(1, 1, 1);
    _dummy.updateMatrix();
    this.skidMesh.setMatrixAt(this.skidCursor, _dummy.matrix);
    this.skidMesh.instanceMatrix.needsUpdate = true;
    this.skidCursor = (this.skidCursor + 1) % MAX_SKIDS;
  }

  public spawnDetachedPart(
    type: DebrisPartType,
    primaryHex: string,
    stripeHex: string,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
  ): void {
    if (this.debrisList.length >= MAX_DEBRIS) {
      const oldest = this.debrisList.shift();
      if (oldest) {
        this.disposeDebrisGroup(oldest.mesh);
      }
    }
    const mesh = createDetachedDebrisMesh(type, primaryHex, stripeHex);
    mesh.position.set(x, y, z);
    mesh.rotation.set(Math.random(), Math.random(), Math.random());
    this.scene.add(mesh);

    this.debrisList.push({
      mesh,
      vx: vx + (Math.random() - 0.5) * 9,
      vy: vy + 5 + Math.random() * 6,
      vz: vz + (Math.random() - 0.5) * 9,
      rx: (Math.random() - 0.5) * 10,
      ry: (Math.random() - 0.5) * 10,
      rz: (Math.random() - 0.5) * 10,
      age: 0,
      settled: false,
    });
  }

  public update(dt: number): void {
    let anyChanged = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyChanged = true;

      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        _dummy.position.set(0, -50, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      if (p.bounce) {
        const gh = groundHeightAt(p.x, p.z);
        if (p.y < gh + 0.08) {
          p.y = gh + 0.08;
          p.vy = Math.abs(p.vy) * 0.48;
          p.vx *= 0.72;
          p.vz *= 0.72;
        }
      }

      const t = p.age / p.life;
      const sc = THREE.MathUtils.lerp(p.sizeStart, p.sizeEnd, t);
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.setScalar(Math.max(0.01, sc));
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(
        i,
        _col.setRGB(p.r * (1 - t * 0.35), p.g * (1 - t * 0.4), p.b * (1 - t * 0.4)),
      );
    }

    if (anyChanged) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    }

    // Update flying physical car debris
    for (const d of this.debrisList) {
      if (d.settled) continue;
      d.age += dt;
      d.vy -= 24 * dt;
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += d.vz * dt;

      d.mesh.rotation.x += d.rx * dt;
      d.mesh.rotation.y += d.ry * dt;
      d.mesh.rotation.z += d.rz * dt;

      const gh = groundHeightAt(d.mesh.position.x, d.mesh.position.z) + 0.14;
      if (d.mesh.position.y <= gh) {
        d.mesh.position.y = gh;
        if (Math.abs(d.vy) > 2.2) {
          d.vy = Math.abs(d.vy) * 0.38;
          d.vx *= 0.62;
          d.vz *= 0.62;
          d.rx *= 0.6;
          d.ry *= 0.6;
          d.rz *= 0.6;
        } else {
          d.vy = 0;
          d.vx *= 0.85;
          d.vz *= 0.85;
          if (Math.hypot(d.vx, d.vz) < 0.25) {
            d.settled = true;
          }
        }
      }
    }
  }

  private disposeDebrisGroup(group: THREE.Group): void {
    this.scene.remove(group);
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }

  public clearArenaEffects(): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles[i].active = false;
      _dummy.position.set(0, -50, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < MAX_SKIDS; i++) {
      _dummy.position.set(0, -50, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.skidMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.skidMesh.instanceMatrix.needsUpdate = true;
    this.skidCursor = 0;

    for (const d of this.debrisList) {
      this.disposeDebrisGroup(d.mesh);
    }
    this.debrisList.length = 0;
  }

  public dispose(): void {
    this.clearArenaEffects();
    this.scene.remove(this.particleMesh);
    this.scene.remove(this.skidMesh);
    this.particleMesh.geometry.dispose();
    (this.particleMesh.material as THREE.Material).dispose();
    this.skidMesh.geometry.dispose();
    (this.skidMesh.material as THREE.Material).dispose();
    this.particleTex.dispose();
    this.skidTex.dispose();
  }
}
