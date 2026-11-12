import * as THREE from 'three';
import {
  ARENA_PILLARS,
  ARENA_RADIUS,
  ARENA_RAMPS,
  groundHeightAt,
  NitroPad,
} from './arena';
import {
  applyMeshImpactDeformation,
  CarMeshRig,
  updateCarDamageVisuals,
} from './carModel';
import { EffectsPool } from './particles';
import { CarColorOption, CarDamageZones, DebrisPartType } from './types';

export interface CarInput {
  throttle: number; // -1..1
  steer: number; // -1 (right)..+1 (left)
  handbrake: boolean;
  nitro: boolean;
}

export interface DerbyCar {
  id: string;
  name: string;
  numberLabel: string;
  colorOpt: CarColorOption;
  isPlayer: boolean;
  playerSlot: 0 | 1 | null; // 0 = P1, 1 = P2, null = AI
  rig: CarMeshRig;

  // Spatial state
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  angVel: number;
  pitch: number;
  roll: number;
  suspOffset: number;
  suspVel: number;
  wheelSpin: number;
  visualSteer: number;
  grounded: boolean;
  airTime: number;

  // Gameplay & damage state
  hp: number;
  nitro: number;
  isBoosting: boolean;
  isDrifting: boolean;
  wrecked: boolean;
  wreckTime: number;
  kills: number;
  damageDealt: number;
  lastHitBy: string | null;
  lastHitTimer: number;
  damageCooldown: number;
  zones: CarDamageZones;
  attachedParts: Set<DebrisPartType>;
  squashY: number;

  // AI state
  aiTargetId: string | null;
  aiRetargetTimer: number;
  aiReverseTimer: number;
  aiStuckTimer: number;
  aiNitroBurstTimer: number;
}

export interface CollisionFeedback {
  hitstop: number;
  shakeP1: number;
  shakeP2: number;
  impactStrength: number;
  peakSpeedKmh: number;
  calloutText?: string;
  calloutSubtext?: string;
  calloutTone?: 'impact' | 'wreck' | 'air';
  calloutTarget?: 'all' | 'p1' | 'p2';
  wreckedCountThisStep: number;
  partsDetachedThisStep: number;
  nitroPickedUp: boolean;
}

const CAR_HALF_W = 1.06;
const CAR_HALF_L = 2.24;
const CAR_MASS = 1.0;

const _hitPos = new THREE.Vector3();
const _hitNorm = new THREE.Vector3();

// 2D OBB vs OBB Separating Axis Theorem check
interface ObbOverlap {
  normalX: number;
  normalZ: number;
  depth: number;
  contactX: number;
  contactZ: number;
}

function testObbOverlap(a: DerbyCar, b: DerbyCar): ObbOverlap | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  // Quick bounding circle reject
  if (dx * dx + dz * dz > 26) return null;

  const axX = Math.cos(a.yaw);
  const axZ = -Math.sin(a.yaw);
  const azX = Math.sin(a.yaw);
  const azZ = Math.cos(a.yaw);

  const bxX = Math.cos(b.yaw);
  const bxZ = -Math.sin(b.yaw);
  const bzX = Math.sin(b.yaw);
  const bzZ = Math.cos(b.yaw);

  let minOverlap = Infinity;
  let bestAxisX = 0;
  let bestAxisZ = 0;

  const axes = [
    [axX, axZ],
    [azX, azZ],
    [bxX, bxZ],
    [bzX, bzZ],
  ];

  for (let i = 0; i < 4; i++) {
    const ux = axes[i][0];
    const uz = axes[i][1];

    const projA =
      Math.abs(axX * ux + axZ * uz) * CAR_HALF_W +
      Math.abs(azX * ux + azZ * uz) * CAR_HALF_L;
    const projB =
      Math.abs(bxX * ux + bxZ * uz) * CAR_HALF_W +
      Math.abs(bzX * ux + bzZ * uz) * CAR_HALF_L;
    const dist = Math.abs(dx * ux + dz * uz);

    const overlap = projA + projB - dist;
    if (overlap <= 0) return null;

    if (overlap < minOverlap) {
      minOverlap = overlap;
      const sign = dx * ux + dz * uz >= 0 ? 1 : -1;
      bestAxisX = ux * sign;
      bestAxisZ = uz * sign;
    }
  }

  return {
    normalX: bestAxisX,
    normalZ: bestAxisZ,
    depth: minOverlap,
    contactX: (a.x + b.x) * 0.5,
    contactZ: (a.z + b.z) * 0.5,
  };
}

export function computeAiInput(
  car: DerbyCar,
  allCars: DerbyCar[],
  dt: number,
): CarInput {
  if (car.wrecked) {
    return { throttle: 0, steer: 0, handbrake: false, nitro: false };
  }

  const speed = Math.hypot(car.vx, car.vz);
  const fwdX = Math.sin(car.yaw);
  const fwdZ = Math.cos(car.yaw);
  const forwardSpeed = car.vx * fwdX + car.vz * fwdZ;

  // Detect stuck against wall or wreck
  if (speed < 2.1 && car.aiReverseTimer <= 0) {
    car.aiStuckTimer += dt;
    if (car.aiStuckTimer > 0.85) {
      car.aiReverseTimer = 0.95;
      car.aiStuckTimer = 0;
    }
  } else {
    car.aiStuckTimer = Math.max(0, car.aiStuckTimer - dt * 2);
  }

  if (car.aiReverseTimer > 0) {
    car.aiReverseTimer -= dt;
    return {
      throttle: -1,
      steer: car.id.charCodeAt(0) % 2 === 0 ? 1 : -1,
      handbrake: false,
      nitro: false,
    };
  }

  // Retarget nearest active opponent
  car.aiRetargetTimer -= dt;
  let target: DerbyCar | null = null;
  if (car.aiTargetId) {
    target =
      allCars.find((c) => c.id === car.aiTargetId && !c.wrecked) ?? null;
  }

  if (!target || car.aiRetargetTimer <= 0) {
    car.aiRetargetTimer = 1.6 + Math.random() * 1.4;
    let bestScore = Infinity;
    for (const other of allCars) {
      if (other.id === car.id || other.wrecked) continue;
      const dist = Math.hypot(other.x - car.x, other.z - car.z);
      // Slightly prefer weaker targets or players for exciting chases
      const bias = other.isPlayer ? 0.86 : 1.0;
      const score = dist * bias;
      if (score < bestScore) {
        bestScore = score;
        target = other;
      }
    }
    car.aiTargetId = target ? target.id : null;
  }

  // Default goal: arena center or target lead position
  let goalX = 0;
  let goalZ = 0;
  let distToGoal = 20;

  if (target) {
    const leadT = Math.min(0.75, Math.hypot(target.x - car.x, target.z - car.z) / 36);
    goalX = target.x + target.vx * leadT;
    goalZ = target.z + target.vz * leadT;
    distToGoal = Math.hypot(goalX - car.x, goalZ - car.z);
  }

  // Wall avoidance if too close to outer barrier
  const distFromCenter = Math.hypot(car.x, car.z);
  if (distFromCenter > ARENA_RADIUS - 8.5) {
    goalX = -car.x * 0.4;
    goalZ = -car.z * 0.4;
  } else {
    // Steer around pillars
    for (const p of ARENA_PILLARS) {
      const pdx = car.x - p.x;
      const pdz = car.z - p.z;
      const pDist = Math.hypot(pdx, pdz);
      if (pDist < 7.5 && pDist > 0.01) {
        goalX += (pdx / pDist) * 14;
        goalZ += (pdz / pDist) * 14;
      }
    }
  }

  const toGoalX = goalX - car.x;
  const toGoalZ = goalZ - car.z;
  const desiredYaw = Math.atan2(toGoalX, toGoalZ);
  let angleDiff = desiredYaw - car.yaw;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  const steer = THREE.MathUtils.clamp(angleDiff * 2.1, -1, 1);
  const sharpTurn = Math.abs(angleDiff) > 1.05 && forwardSpeed > 11;

  // Nitro burst when lined up for a high-speed ram!
  if (car.aiNitroBurstTimer > 0) {
    car.aiNitroBurstTimer -= dt;
  } else if (
    target &&
    Math.abs(angleDiff) < 0.28 &&
    distToGoal < 26 &&
    distToGoal > 7 &&
    car.nitro > 32
  ) {
    car.aiNitroBurstTimer = 0.9;
  }

  return {
    throttle: Math.abs(angleDiff) > 2.35 && forwardSpeed < 6 ? -0.6 : 1,
    steer,
    handbrake: sharpTurn,
    nitro: car.aiNitroBurstTimer > 0 && car.nitro > 8,
  };
}

function tryDetachParts(
  car: DerbyCar,
  impactDirX: number,
  impactDirZ: number,
  effects: EffectsPool,
): number {
  let detached = 0;
  const candidates: { type: DebrisPartType; trigger: boolean }[] = [
    { type: 'bumperF', trigger: car.zones.front >= 0.2 || car.hp <= 84 },
    { type: 'bumperR', trigger: car.zones.rear >= 0.2 || car.hp <= 76 },
    { type: 'spoiler', trigger: car.zones.rear >= 0.16 || car.hp <= 68 },
    { type: 'doorL', trigger: car.zones.left >= 0.26 || car.hp <= 56 },
    { type: 'doorR', trigger: car.zones.right >= 0.26 || car.hp <= 46 },
    { type: 'hood', trigger: car.zones.front >= 0.42 || car.hp <= 34 },
    { type: 'trunk', trigger: car.zones.rear >= 0.46 || car.hp <= 22 },
  ];

  // Shed up to 2 parts per impact so the car strips down progressively across multiple hits
  for (const c of candidates) {
    if (detached >= 2) break;
    if (c.trigger && car.attachedParts.has(c.type)) {
      car.attachedParts.delete(c.type);
      car.rig.detachableParts[c.type].visible = false;
      effects.spawnDetachedPart(
        c.type,
        car.colorOpt.primaryHex,
        car.colorOpt.stripeHex,
        car.x,
        car.y + 1.15,
        car.z,
        car.vx * 0.6 + impactDirX * 8,
        4.5,
        car.vz * 0.6 + impactDirZ * 8,
      );
      detached++;
    }
  }
  return detached;
}

function applyDamageToCar(
  victim: DerbyCar,
  attacker: DerbyCar | null,
  damage: number,
  worldHitX: number,
  worldHitZ: number,
  inwardNormX: number,
  inwardNormZ: number,
  effects: EffectsPool,
): { wreckedNow: boolean; partsDetached: number } {
  if (victim.wrecked || damage <= 0.5 || victim.damageCooldown > 0) {
    return { wreckedNow: false, partsDetached: 0 };
  }

  // Cap single-hit damage at 42 so a fresh car never gets one-shotted
  const appliedDmg = Math.min(42, damage);
  const prevHp = victim.hp;
  victim.hp = Math.max(0, victim.hp - appliedDmg);
  victim.damageCooldown = 0.22;

  if (attacker) {
    attacker.damageDealt += Math.round(appliedDmg);
    victim.lastHitBy = attacker.id;
    victim.lastHitTimer = 5.0;
  }

  // Classify hit zone in victim's local coordinates
  const fwdX = Math.sin(victim.yaw);
  const fwdZ = Math.cos(victim.yaw);
  const localXVecX = Math.cos(victim.yaw);
  const localXVecZ = -Math.sin(victim.yaw);

  const relX = worldHitX - victim.x;
  const relZ = worldHitZ - victim.z;
  const localZ = relX * fwdX + relZ * fwdZ;
  const localX = relX * localXVecX + relZ * localXVecZ;

  const zoneAmt = THREE.MathUtils.clamp(appliedDmg / 32, 0.14, 0.45);
  if (Math.abs(localZ) >= Math.abs(localX) * 1.15) {
    if (localZ >= 0) {
      victim.zones.front = Math.min(1, victim.zones.front + zoneAmt);
    } else {
      victim.zones.rear = Math.min(1, victim.zones.rear + zoneAmt);
    }
  } else {
    if (localX >= 0) {
      victim.zones.left = Math.min(1, victim.zones.left + zoneAmt);
    } else {
      victim.zones.right = Math.min(1, victim.zones.right + zoneAmt);
    }
  }

  // Physical vertex crumpling on chassis & cabin
  _hitPos.set(worldHitX, victim.y + 0.72, worldHitZ);
  _hitNorm.set(inwardNormX, 0.08, inwardNormZ).normalize();
  applyMeshImpactDeformation(
    victim.rig,
    _hitPos,
    _hitNorm,
    THREE.MathUtils.clamp(appliedDmg / 15, 0.42, 1.25),
    victim.hp / 100,
  );

  let partsDetached = tryDetachParts(
    victim,
    inwardNormX,
    inwardNormZ,
    effects,
  );

  let wreckedNow = false;
  if (victim.hp <= 0 && prevHp > 0) {
    victim.wrecked = true;
    victim.wreckTime = 0;
    wreckedNow = true;

    // Credit knockout!
    const killerId = attacker ? attacker.id : victim.lastHitBy;
    if (killerId && killerId !== victim.id) {
      // Attacker kill increment handled if attacker passed, or looked up in caller
      if (attacker && attacker.id === killerId) {
        attacker.kills += 1;
      }
    }

    // Pop any remaining detachable parts so it finishes "hecho polvo"!
    const remaining: DebrisPartType[] = Array.from(victim.attachedParts);
    for (const part of remaining) {
      victim.attachedParts.delete(part);
      victim.rig.detachableParts[part].visible = false;
      effects.spawnDetachedPart(
        part,
        victim.colorOpt.primaryHex,
        victim.colorOpt.stripeHex,
        victim.x,
        victim.y + 1.25,
        victim.z,
        (Math.random() - 0.5) * 14,
        7 + Math.random() * 5,
        (Math.random() - 0.5) * 14,
      );
      partsDetached++;
    }

    effects.emitWreckBurst(victim.x, victim.y, victim.z);
  }

  updateCarDamageVisuals(victim.rig, victim.hp / 100, victim.wrecked);
  return { wreckedNow, partsDetached };
}

export function stepDerbySimulation(
  cars: DerbyCar[],
  inputsByCarId: Map<string, CarInput>,
  nitroPads: NitroPad[],
  effects: EffectsPool,
  dt: number,
  allowDriving: boolean,
): CollisionFeedback {
  const feedback: CollisionFeedback = {
    hitstop: 0,
    shakeP1: 0,
    shakeP2: 0,
    impactStrength: 0,
    peakSpeedKmh: 0,
    wreckedCountThisStep: 0,
    partsDetachedThisStep: 0,
    nitroPickedUp: false,
  };

  // 1. Integrate individual vehicle dynamics & ramp physics
  for (const car of cars) {
    if (car.damageCooldown > 0) {
      car.damageCooldown = Math.max(0, car.damageCooldown - dt);
    }
    if (car.lastHitTimer > 0) {
      car.lastHitTimer = Math.max(0, car.lastHitTimer - dt);
      if (car.lastHitTimer <= 0) car.lastHitBy = null;
    }

    const input: CarInput =
      allowDriving && !car.wrecked
        ? inputsByCarId.get(car.id) ?? {
            throttle: 0,
            steer: 0,
            handbrake: false,
            nitro: false,
          }
        : { throttle: 0, steer: 0, handbrake: false, nitro: false };

    const fwdX = Math.sin(car.yaw);
    const fwdZ = Math.cos(car.yaw);
    const sideX = Math.cos(car.yaw);
    const sideZ = -Math.sin(car.yaw);

    // Local velocity decomposition
    let vForward = car.vx * fwdX + car.vz * fwdZ;
    let vSide = car.vx * sideX + car.vz * sideZ;

    // Nitro boost logic
    car.isBoosting = !car.wrecked && input.nitro && car.nitro > 1.5;
    if (car.isBoosting) {
      car.nitro = Math.max(0, car.nitro - 29 * dt);
    } else if (!car.wrecked) {
      car.nitro = Math.min(100, car.nitro + 6.5 * dt);
    }

    const damageSpeedMult = car.wrecked
      ? 0
      : 0.72 + 0.28 * (car.hp / 100);
    const accelForce =
      (car.isBoosting ? 49 : 30) * damageSpeedMult;
    const reverseForce = 20 * damageSpeedMult;

    if (car.grounded && !car.wrecked) {
      if (input.throttle > 0) {
        vForward += input.throttle * accelForce * dt;
      } else if (input.throttle < 0) {
        if (vForward > 2.5) {
          vForward -= 42 * dt; // strong brakes
        } else {
          vForward += input.throttle * reverseForce * dt;
        }
      } else {
        // Engine braking
        vForward *= Math.exp(-1.55 * dt);
      }

      // Cap top forward/reverse speed
      const maxSpeed = car.isBoosting ? 45 : 32.5;
      vForward = THREE.MathUtils.clamp(vForward, -16, maxSpeed);

      // Lateral dirt tire grip (reduced during handbrake drift!)
      const lateralGrip = input.handbrake ? 2.1 : 6.4;
      vSide *= Math.exp(-lateralGrip * dt);

      car.isDrifting =
        Math.abs(vSide) > 4.2 || (input.handbrake && Math.abs(vForward) > 8);

      // Steering authority
      const speedAbs = Math.abs(vForward);
      const steerFactor = THREE.MathUtils.clamp(speedAbs / 5.5, 0.22, 1.0);
      const reverseSign = vForward >= -0.5 ? 1 : -1;
      const turnRate = input.handbrake ? 3.25 : 2.55;
      const targetAngVel =
        input.steer * turnRate * steerFactor * reverseSign;
      car.angVel = THREE.MathUtils.damp(car.angVel, targetAngVel, 10, dt);
    } else if (car.wrecked) {
      // Heavy rolling resistance for charred wreck
      vForward *= Math.exp(-3.4 * dt);
      vSide *= Math.exp(-5.0 * dt);
      car.angVel *= Math.exp(-4.0 * dt);
      car.isDrifting = false;
    } else {
      // Airborne: preserve momentum, slight air yaw control
      car.angVel *= Math.exp(-0.9 * dt);
      car.isDrifting = false;
    }

    // Reconstruct world velocity
    car.vx = fwdX * vForward + sideX * vSide;
    car.vz = fwdZ * vForward + sideZ * vSide;

    const prevGroundY = groundHeightAt(car.x, car.z);
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    car.yaw += car.angVel * dt;

    // Vertical & Ramp Launch Physics
    const newGroundY = groundHeightAt(car.x, car.z);
    if (car.grounded) {
      const slopeVy = (newGroundY - prevGroundY) / Math.max(0.001, dt);
      // Launch into air if cresting a ramp lip or steep drop!
      if (car.y - newGroundY > 0.34 && slopeVy < -2.5) {
        car.grounded = false;
        car.vy = Math.max(2.5, (newGroundY - prevGroundY) * 0.45);
      } else {
        // Check if driving up a ramp and hitting the steep drop lip
        const wasOnRamp = prevGroundY > 0.85 && newGroundY < prevGroundY - 0.12;
        if (wasOnRamp && Math.hypot(car.vx, car.vz) > 10) {
          car.grounded = false;
          // Launch upward proportional to forward speed!
          const launchSpeed = Math.hypot(car.vx, car.vz);
          car.vy = THREE.MathUtils.clamp(launchSpeed * 0.36, 4.5, 11.5);
          car.y = prevGroundY + 0.08;
        } else {
          car.y = newGroundY;
          car.vy = slopeVy;
          car.airTime = 0;
        }
      }
    } else {
      car.airTime += dt;
      car.vy -= 23.5 * dt; // Gravity
      car.y += car.vy * dt;

      if (car.y <= newGroundY) {
        // Landing impact squash + dirt burst!
        const impactVy = Math.abs(car.vy);
        car.y = newGroundY;
        car.vy = 0;
        car.grounded = true;
        car.suspVel -= Math.min(8, impactVy * 0.55);
        car.squashY = Math.min(0.2, impactVy * 0.015);
        if (impactVy > 5) {
          for (let k = 0; k < 6; k++) {
            effects.emitDirtDust(car.x, car.y, car.z, 1.4);
          }
          if (car.isPlayer && car.airTime > 0.55) {
            feedback.calloutText = '¡SALTO BRUTAL!';
            feedback.calloutTone = 'air';
            feedback.calloutTarget = car.playerSlot === 0 ? 'p1' : 'p2';
          }
        }
        car.airTime = 0;
      }
    }

    // Check Nitro Recharge Pads
    if (!car.wrecked && car.grounded) {
      for (const pad of nitroPads) {
        if (pad.cooldown <= 0) {
          const pd = Math.hypot(car.x - pad.x, car.z - pad.z);
          if (pd < pad.radius + 1.1) {
            pad.cooldown = 7.0;
            car.nitro = Math.min(100, car.nitro + 50);
            if (car.isPlayer) {
              feedback.nitroPickedUp = true;
              feedback.calloutText = 'NITRO RECARGADO';
              feedback.calloutSubtext = '+50% TURBO';
              feedback.calloutTarget = car.playerSlot === 0 ? 'p1' : 'p2';
            }
          }
        }
      }
    }

    // Suspension spring-damper + terrain pitch/roll alignment
    const fProbeH = groundHeightAt(car.x + fwdX * 1.5, car.z + fwdZ * 1.5);
    const rProbeH = groundHeightAt(car.x - fwdX * 1.5, car.z - fwdZ * 1.5);
    const lProbeH = groundHeightAt(car.x + sideX * 1.0, car.z + sideZ * 1.0);
    const rightProbeH = groundHeightAt(car.x - sideX * 1.0, car.z - sideZ * 1.0);

    let targetPitch = 0;
    let targetRoll = 0;
    if (car.grounded) {
      const slopePitch = -Math.atan2(fProbeH - rProbeH, 3.0);
      const slopeRoll = Math.atan2(lProbeH - rightProbeH, 2.0);
      const accelSquat = -input.throttle * (car.isBoosting ? 0.08 : 0.042);
      const turnLean = input.steer * THREE.MathUtils.clamp(vForward / 28, -1, 1) * 0.095;
      targetPitch = slopePitch + accelSquat;
      targetRoll = slopeRoll + turnLean;
    } else {
      targetPitch = THREE.MathUtils.clamp(-car.vy * 0.032, -0.42, 0.38);
      targetRoll = THREE.MathUtils.damp(car.roll, 0, 3, dt);
    }

    car.pitch = THREE.MathUtils.damp(car.pitch, targetPitch, 11, dt);
    car.roll = THREE.MathUtils.damp(car.roll, targetRoll, 11, dt);

    const springForce = -car.suspOffset * 95 - car.suspVel * 12;
    car.suspVel += springForce * dt;
    car.suspOffset = THREE.MathUtils.clamp(car.suspOffset + car.suspVel * dt, -0.25, 0.25);
    car.squashY = THREE.MathUtils.damp(car.squashY, 0, 12, dt);

    // Visual wheel spin & steering
    car.wheelSpin += (vForward / 0.42) * dt;
    car.visualSteer = THREE.MathUtils.damp(car.visualSteer, input.steer * 0.44, 14, dt);

    // Update Three.js transforms
    car.rig.root.position.set(car.x, car.y, car.z);
    car.rig.root.rotation.set(0, car.yaw, 0);

    car.rig.bodyPivot.position.y = car.suspOffset;
    car.rig.bodyPivot.rotation.set(car.pitch, 0, car.roll);
    car.rig.bodyPivot.scale.set(
      1 + car.squashY * 0.35,
      1 - car.squashY,
      1 + car.squashY * 0.2,
    );

    car.rig.contactShadow.visible = car.y - newGroundY < 3.5;
    const shadowFade = THREE.MathUtils.clamp(1 - (car.y - newGroundY) / 3.5, 0.1, 1);
    (car.rig.contactShadow.material as THREE.MeshBasicMaterial).opacity =
      0.58 * shadowFade;

    for (let wi = 0; wi < car.rig.wheels.length; wi++) {
      const w = car.rig.wheels[wi];
      w.pivot.rotation.y = w.isFront ? car.visualSteer : 0;
      w.pivot.rotation.z = car.wrecked
        ? (wi % 2 === 0 ? 0.36 : -0.36)
        : car.hp < 45
          ? (wi % 2 === 0 ? 1 : -1) * (1 - car.hp / 45) * 0.22
          : 0;
      w.spinMesh.rotation.x = car.wheelSpin;
      w.pivot.position.y = w.baseY - car.suspOffset * 0.45;
    }

    // Nitro flames & brake lights
    for (const flame of car.rig.flames) {
      flame.visible = car.isBoosting;
      if (car.isBoosting) {
        const flicker = 0.85 + Math.random() * 0.45;
        flame.scale.set(1, 1, flicker);
      }
    }
    const braking = !car.wrecked && (input.throttle < 0 || input.handbrake);
    for (const bl of car.rig.brakeLights) {
      (bl.material as THREE.MeshBasicMaterial).color.setHex(
        car.wrecked ? 0x1a0808 : braking ? 0xff2b2b : 0x7f1d1d,
      );
    }

    // Dirt dust plumes, skidmarks, and progressive damage smoke/fire!
    const totalSpeed = Math.hypot(car.vx, car.vz);
    if (car.grounded && !car.wrecked && totalSpeed > 7) {
      if (Math.random() < (car.isDrifting ? 0.72 : 0.25)) {
        effects.emitDirtDust(
          car.x - fwdX * 1.9,
          car.y,
          car.z - fwdZ * 1.9,
          totalSpeed / 30,
        );
      }
      if (car.isDrifting && Math.random() < 0.65) {
        effects.addSkidMark(car.x - fwdX * 0.8, car.z - fwdZ * 0.8, car.yaw);
      }
    }

    if (car.wrecked) {
      car.wreckTime += dt;
      if (Math.random() < 0.55) {
        effects.emitDamageSmoke(
          car.x + fwdX * 0.8,
          car.y + 0.95,
          car.z + fwdZ * 0.8,
          0.95,
        );
      }
      if (car.wreckTime < 14 && Math.random() < 0.45) {
        effects.emitFire(
          car.x + fwdX * 1.1,
          car.y + 0.85,
          car.z + fwdZ * 1.1,
          1.1,
        );
      }
    } else if (car.hp < 58) {
      const severity = 1 - car.hp / 58;
      if (Math.random() < 0.18 + severity * 0.45) {
        effects.emitDamageSmoke(
          car.x + fwdX * 1.25,
          car.y + 0.9,
          car.z + fwdZ * 1.25,
          severity,
        );
      }
      if (car.hp < 24 && Math.random() < 0.35) {
        effects.emitFire(
          car.x + fwdX * 1.35,
          car.y + 0.88,
          car.z + fwdZ * 1.35,
          0.75,
        );
      }
    }
  }

  // 2. Arena Perimeter Wall & Concrete Pillar Collisions
  const wallLimit = ARENA_RADIUS - 1.9;
  for (const car of cars) {
    const dist = Math.hypot(car.x, car.z);
    if (dist > wallLimit) {
      const nx = car.x / dist;
      const nz = car.z / dist;
      car.x = nx * wallLimit;
      car.z = nz * wallLimit;

      const vn = car.vx * nx + car.vz * nz;
      if (vn > 0) {
        const impactSpeed = vn;
        car.vx -= 1.48 * vn * nx;
        car.vz -= 1.48 * vn * nz;
        car.angVel += (Math.random() - 0.5) * impactSpeed * 0.18;

        if (impactSpeed > 17 && !car.wrecked) {
          const wallDmg = Math.min(10, (impactSpeed - 17) * 0.5);
          const res = applyDamageToCar(
            car,
            null,
            wallDmg,
            car.x + nx * 1.2,
            car.z + nz * 1.2,
            -nx,
            -nz,
            effects,
          );
          feedback.partsDetachedThisStep += res.partsDetached;
          if (res.wreckedNow) {
            feedback.wreckedCountThisStep++;
            if (car.lastHitBy) {
              const killer = cars.find((c) => c.id === car.lastHitBy);
              if (killer) killer.kills += 1;
            }
          }
          effects.emitSparks(
            car.x + nx * 1.1,
            car.y + 0.7,
            car.z + nz * 1.1,
            -nx,
            -nz,
            Math.min(14, Math.floor(impactSpeed * 0.7)),
          );
          const normStrength = THREE.MathUtils.clamp(impactSpeed / 28, 0.15, 0.85);
          feedback.impactStrength = Math.max(feedback.impactStrength, normStrength);
          if (car.playerSlot === 0) feedback.shakeP1 = Math.max(feedback.shakeP1, normStrength * 0.8);
          if (car.playerSlot === 1) feedback.shakeP2 = Math.max(feedback.shakeP2, normStrength * 0.8);
        }
      }
    }

    // Concrete Arena Pillars
    for (const pil of ARENA_PILLARS) {
      const dx = car.x - pil.x;
      const dz = car.z - pil.z;
      const minDist = pil.radius + 1.55;
      const d = Math.hypot(dx, dz);
      if (d < minDist && d > 0.001) {
        const nx = dx / d;
        const nz = dz / d;
        car.x = pil.x + nx * minDist;
        car.z = pil.z + nz * minDist;

        const vn = car.vx * nx + car.vz * nz;
        if (vn < 0) {
          const impactSpeed = -vn;
          car.vx -= 1.55 * vn * nx;
          car.vz -= 1.55 * vn * nz;
          car.angVel += (Math.random() - 0.5) * impactSpeed * 0.25;

          if (impactSpeed > 14 && !car.wrecked) {
            const pDmg = Math.min(12, (impactSpeed - 14) * 0.6);
            const res = applyDamageToCar(
              car,
              null,
              pDmg,
              car.x - nx * 1.1,
              car.z - nz * 1.1,
              nx,
              nz,
              effects,
            );
            feedback.partsDetachedThisStep += res.partsDetached;
            if (res.wreckedNow) {
              feedback.wreckedCountThisStep++;
              if (car.lastHitBy) {
                const killer = cars.find((c) => c.id === car.lastHitBy);
                if (killer) killer.kills += 1;
              }
            }
            effects.emitSparks(
              car.x - nx * 1.0,
              car.y + 0.75,
              car.z - nz * 1.0,
              nx,
              nz,
              12,
            );
            const s = THREE.MathUtils.clamp(impactSpeed / 26, 0.2, 0.9);
            feedback.impactStrength = Math.max(feedback.impactStrength, s);
            if (car.playerSlot === 0) feedback.shakeP1 = Math.max(feedback.shakeP1, s);
            if (car.playerSlot === 1) feedback.shakeP2 = Math.max(feedback.shakeP2, s);
          }
        }
      }
    }
  }

  // 3. Car-vs-Car OBB Collisions, Momentum Transfer & Ramming Damage
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      // Vertical separation check for mid-air jumps over another car!
      if (Math.abs(a.y - b.y) > 1.85) continue;

      const hit = testObbOverlap(a, b);
      if (!hit) continue;

      // Separate overlap cleanly
      const aWeight = b.wrecked ? 0.75 : a.wrecked ? 0.25 : 0.5;
      const bWeight = 1 - aWeight;
      a.x -= hit.normalX * hit.depth * aWeight;
      a.z -= hit.normalZ * hit.depth * aWeight;
      b.x += hit.normalX * hit.depth * bWeight;
      b.z += hit.normalZ * hit.depth * bWeight;

      const aVxBefore = a.vx;
      const aVzBefore = a.vz;
      const bVxBefore = b.vx;
      const bVzBefore = b.vz;

      const rvx = bVxBefore - aVxBefore;
      const rvz = bVzBefore - aVzBefore;
      const relNormalVel = rvx * hit.normalX + rvz * hit.normalZ;

      if (relNormalVel < 0) {
        const closingSpeed = -relNormalVel;
        const restitution = 0.44;
        const massA = a.wrecked ? CAR_MASS * 1.7 : CAR_MASS;
        const massB = b.wrecked ? CAR_MASS * 1.7 : CAR_MASS;
        const jImpulse =
          (-(1 + restitution) * relNormalVel) / (1 / massA + 1 / massB);

        a.vx -= (jImpulse / massA) * hit.normalX;
        a.vz -= (jImpulse / massA) * hit.normalZ;
        b.vx += (jImpulse / massB) * hit.normalX;
        b.vz += (jImpulse / massB) * hit.normalZ;

        // Spin torque on off-center T-bones!
        const aFwdX = Math.sin(a.yaw);
        const aFwdZ = Math.cos(a.yaw);
        const bFwdX = Math.sin(b.yaw);
        const bFwdZ = Math.cos(b.yaw);

        const aFrontAlign = aFwdX * hit.normalX + aFwdZ * hit.normalZ; // +1 if A rammed nose-first into B
        const bFrontAlign = -(bFwdX * hit.normalX + bFwdZ * hit.normalZ); // +1 if B rammed nose-first into A

        a.angVel += (hit.normalX * aFwdZ - hit.normalZ * aFwdX) * closingSpeed * 0.08;
        b.angVel -= (hit.normalX * bFwdZ - hit.normalZ * bFwdX) * closingSpeed * 0.08;

        if (closingSpeed > 4.2) {
          const closingKmh = Math.round(closingSpeed * 3.8);
          feedback.peakSpeedKmh = Math.max(feedback.peakSpeedKmh, closingKmh);

          // Pre-impulse approach speed of each car toward the other along the collision normal
          const aApproach = aVxBefore * hit.normalX + aVzBefore * hit.normalZ;
          const bApproach = -(bVxBefore * hit.normalX + bVzBefore * hit.normalZ);

          const aIsRamming = aFrontAlign > 0.35 && aApproach > 1.5;
          const bIsRamming = bFrontAlign > 0.35 && bApproach > 1.5;

          const baseDmg = THREE.MathUtils.clamp(
            (closingSpeed - 3.5) * 0.52,
            2.5,
            22,
          );
          let dmgToA = 0;
          let dmgToB = 0;

          if (!a.wrecked && !b.wrecked) {
            if (aIsRamming && !bIsRamming) {
              // A slammed its front into B: B takes progressive damage, A takes 0!
              const tBoneMult = bFrontAlign < 0.25 ? 1.24 : 1.0;
              const nitroMult = a.isBoosting ? 1.6 : 1.0;
              dmgToB = baseDmg * tBoneMult * nitroMult;
            } else if (bIsRamming && !aIsRamming) {
              // B slammed its front into A: A takes progressive damage, B takes 0!
              const tBoneMult = aFrontAlign < 0.25 ? 1.24 : 1.0;
              const nitroMult = b.isBoosting ? 1.6 : 1.0;
              dmgToA = baseDmg * tBoneMult * nitroMult;
            } else if (aIsRamming && bIsRamming) {
              // Head-on joust: stronger/faster/boosting attacker inflicts damage and escapes unscathed
              const aPower =
                aApproach * Math.max(0.45, aFrontAlign) * (a.isBoosting ? 1.6 : 1.0);
              const bPower =
                bApproach * Math.max(0.45, bFrontAlign) * (b.isBoosting ? 1.6 : 1.0);

              if (aPower > bPower * 1.12) {
                dmgToB = baseDmg * (a.isBoosting ? 1.5 : 1.0);
              } else if (bPower > aPower * 1.12) {
                dmgToA = baseDmg * (b.isBoosting ? 1.5 : 1.0);
              } else if (a.isPlayer !== b.isPlayer) {
                // Against AI in an even head-on clash, player's frontal charge wins
                if (a.isPlayer) dmgToB = baseDmg;
                else dmgToA = baseDmg;
              } else {
                // 2P dead-even head-on tie: light shared clash
                dmgToA = baseDmg * 0.45;
                dmgToB = baseDmg * 0.45;
              }
            } else {
              // Side-swipe or rear bump: car moving faster into the other deals light damage, takes 0
              if (aApproach > bApproach + 2.0) {
                dmgToB = baseDmg * 0.55;
              } else if (bApproach > aApproach + 2.0) {
                dmgToA = baseDmg * 0.55;
              }
            }
          }

          const resB = applyDamageToCar(
            b,
            a,
            dmgToB,
            hit.contactX,
            hit.contactZ,
            hit.normalX,
            hit.normalZ,
            effects,
          );
          const resA = applyDamageToCar(
            a,
            b,
            dmgToA,
            hit.contactX,
            hit.contactZ,
            -hit.normalX,
            -hit.normalZ,
            effects,
          );

          feedback.partsDetachedThisStep +=
            resA.partsDetached + resB.partsDetached;
          if (resA.wreckedNow) feedback.wreckedCountThisStep++;
          if (resB.wreckedNow) feedback.wreckedCountThisStep++;

          // Sparks burst at contact point
          const sparkCount = Math.min(24, Math.floor(closingSpeed * 0.9));
          effects.emitSparks(
            hit.contactX,
            Math.max(a.y, b.y) + 0.72,
            hit.contactZ,
            0,
            0,
            sparkCount,
          );

          const strength = THREE.MathUtils.clamp(closingSpeed / 34, 0.2, 1.0);
          feedback.impactStrength = Math.max(feedback.impactStrength, strength);

          // Weight-scaled hitstop & directional camera shake!
          if (closingSpeed > 18 && (a.isPlayer || b.isPlayer)) {
            feedback.hitstop = Math.max(
              feedback.hitstop,
              THREE.MathUtils.clamp((closingSpeed - 14) * 0.0022, 0.025, 0.065),
            );
          }

          if (a.playerSlot === 0 || b.playerSlot === 0) {
            feedback.shakeP1 = Math.max(feedback.shakeP1, strength * 1.15);
          }
          if (a.playerSlot === 1 || b.playerSlot === 1) {
            feedback.shakeP2 = Math.max(feedback.shakeP2, strength * 1.15);
          }

          // Excitement callout on wrecks or massive slams
          if (resA.wreckedNow || resB.wreckedNow) {
            feedback.calloutText = '¡DESTRUIDO!';
            feedback.calloutSubtext = resB.wreckedNow
              ? `${a.name} pulverizó a ${b.name}`
              : `${b.name} pulverizó a ${a.name}`;
            feedback.calloutTone = 'wreck';
            feedback.calloutTarget = 'all';
          } else if (closingSpeed > 22 && (a.isPlayer || b.isPlayer)) {
            feedback.calloutText = '¡IMPACTO BRUTAL!';
            feedback.calloutSubtext = `${closingKmh} KM/H DE CHOQUE`;
            feedback.calloutTone = 'impact';
            feedback.calloutTarget =
              a.playerSlot === 0 || b.playerSlot === 0 ? 'p1' : 'p2';
          }
        }
      }
    }
  }

  return feedback;
}

export function getRampHintText(): number {
  return ARENA_RAMPS.length;
}
