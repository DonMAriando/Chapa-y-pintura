import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ARENA_RADIUS,
  ArenaBuildResult,
  buildDerbyArena,
  groundHeightAt,
} from './arena';
import { DerbyAudioEngine } from './audio';
import { buildDerbyCarMesh, resetCarMeshRig } from './carModel';
import { EffectsPool } from './particles';
import {
  CarInput,
  computeAiInput,
  DerbyCar,
  stepDerbySimulation,
} from './physics';
import { createContactShadowTexture } from './textures';
import {
  CalloutEvent,
  CAR_COLORS,
  CarColorId,
  DebrisPartType,
  GameHudSnapshot,
  GameMode,
  GamePhase,
  MatchSummary,
  PlayerHudState,
  StartMatchConfig,
} from './types';

const AI_NAMES = [
  'Toro Negro',
  'Chispazo',
  'Demoledor',
  'Barro Loco',
  'Chatarra 77',
  'Furia V8',
];
const AI_NUMBERS = ['77', '42', '88', '13', '99', '05'];

const _camDesired = new THREE.Vector3();
const _camLook = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export interface EngineCallbacks {
  onHudUpdate: (snapshot: GameHudSnapshot) => void;
  onMatchEnd: (summary: MatchSummary) => void;
  onContextLost: (lost: boolean) => void;
}

export class DerbyEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;

  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera1: THREE.PerspectiveCamera;
  private camera2: THREE.PerspectiveCamera;
  private envRenderTarget: THREE.WebGLRenderTarget;

  private arena: ArenaBuildResult;
  private effects: EffectsPool;
  private audio: DerbyAudioEngine;
  private contactShadowTex: THREE.CanvasTexture;
  private maxAnisotropy: number;

  private cars: DerbyCar[] = [];
  private phase: GamePhase = 'title';
  private mode: GameMode = '1p';
  private lastConfig: StartMatchConfig = {
    mode: '1p',
    p1Color: 'amber',
    p2Color: 'cobalt',
    aiCount: 5,
  };

  private countdownTimer = 0;
  private lastCountdownStep = -1;
  private elapsedMatchSeconds = 0;
  private hitstopTimer = 0;
  private shakeP1 = 0;
  private shakeP2 = 0;
  private peakImpactKmh = 0;
  private totalPartsDetached = 0;
  private gameOverDelay = 0;
  private pendingGameOver = false;

  private callout: CalloutEvent | null = null;
  private calloutTimer = 0;
  private nextCalloutId = 1;

  private heldKeys = new Set<string>();
  private frameId = 0;
  private clock = new THREE.Clock();
  private hudEmitAccum = 0;
  private titleOrbitAngle = 0;
  private disposed = false;

  private cam1LookCurrent = new THREE.Vector3(0, 1, 0);
  private cam2LookCurrent = new THREE.Vector3(0, 1, 0);

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.isSoftwareGl = detectSoftwareWebGL();
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRenderTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRenderTarget.texture;
    pmrem.dispose();

    this.camera1 = new THREE.PerspectiveCamera(64, w / h, 0.3, 360);
    this.camera2 = new THREE.PerspectiveCamera(64, w / h, 0.3, 360);
    this.camera1.position.set(0, 18, 42);
    this.camera2.position.set(0, 18, -42);

    this.contactShadowTex = createContactShadowTexture();
    this.arena = buildDerbyArena(
      this.scene,
      this.maxAnisotropy,
      this.isSoftwareGl,
    );
    this.effects = new EffectsPool(this.scene);
    this.audio = new DerbyAudioEngine();

    // Spawn live attract-mode derby cars on title screen
    this.setupAttractDemo();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera1);
    }

    this.bindEvents();
    this.clock.start();
    this.scheduleNextFrame();
  }

  private handleFirstGesture = (): void => {
    this.audio.unlock();
    if (this.phase === 'title') {
      this.audio.setMusicMode('ambient');
    }
    window.removeEventListener('pointerdown', this.handleFirstGesture);
  };

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('pointerdown', this.handleFirstGesture);
    this.renderer.domElement.addEventListener(
      'webglcontextlost',
      this.handleContextLost,
    );
    this.renderer.domElement.addEventListener(
      'webglcontextrestored',
      this.handleContextRestored,
    );
  }

  private unbindEvents(): void {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('pointerdown', this.handleFirstGesture);
    this.renderer.domElement.removeEventListener(
      'webglcontextlost',
      this.handleContextLost,
    );
    this.renderer.domElement.removeEventListener(
      'webglcontextrestored',
      this.handleContextRestored,
    );
  }

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.callbacks.onContextLost(true);
  };

  private handleContextRestored = (): void => {
    this.callbacks.onContextLost(false);
  };

  private handleResize = (): void => {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
    this.updateCameraAspects();
  };

  private updateCameraAspects(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    if (this.mode === '2p' && this.phase !== 'title') {
      const halfW = Math.max(1, Math.floor(w / 2));
      this.camera1.aspect = halfW / h;
      this.camera2.aspect = Math.max(1, w - halfW) / h;
    } else {
      this.camera1.aspect = w / h;
    }
    this.camera1.updateProjectionMatrix();
    this.camera2.updateProjectionMatrix();
  }

  private handleWindowBlur = (): void => {
    this.heldKeys.clear();
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (
      [
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Space',
      ].includes(e.code)
    ) {
      e.preventDefault();
    }

    if (e.repeat) return;
    this.audio.unlock();
    this.heldKeys.add(e.code);

    if (e.code === 'Escape') {
      if (this.phase === 'playing' || this.phase === 'countdown') {
        this.setPaused(true);
      } else if (this.phase === 'paused') {
        this.setPaused(false);
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code);
  };

  private clearCars(): void {
    for (const c of this.cars) {
      this.scene.remove(c.rig.root);
      c.rig.dispose();
    }
    this.cars = [];
  }

  private createCarEntity(params: {
    id: string;
    name: string;
    numberLabel: string;
    colorId: CarColorId;
    isPlayer: boolean;
    playerSlot: 0 | 1 | null;
    spawnX: number;
    spawnZ: number;
    spawnYaw: number;
  }): DerbyCar {
    const colorOpt =
      CAR_COLORS.find((c) => c.id === params.colorId) ?? CAR_COLORS[0];
    const rig = buildDerbyCarMesh(
      colorOpt,
      params.numberLabel,
      this.contactShadowTex,
      this.maxAnisotropy,
      params.isPlayer,
      this.isSoftwareGl,
    );
    const y = groundHeightAt(params.spawnX, params.spawnZ);
    rig.root.position.set(params.spawnX, y, params.spawnZ);
    rig.root.rotation.set(0, params.spawnYaw, 0);
    this.scene.add(rig.root);

    const allParts: DebrisPartType[] = [
      'hood',
      'trunk',
      'bumperF',
      'bumperR',
      'doorL',
      'doorR',
      'spoiler',
    ];

    return {
      id: params.id,
      name: params.name,
      numberLabel: params.numberLabel,
      colorOpt,
      isPlayer: params.isPlayer,
      playerSlot: params.playerSlot,
      rig,
      x: params.spawnX,
      y,
      z: params.spawnZ,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: params.spawnYaw,
      angVel: 0,
      pitch: 0,
      roll: 0,
      suspOffset: 0,
      suspVel: 0,
      wheelSpin: 0,
      visualSteer: 0,
      grounded: true,
      airTime: 0,
      hp: 100,
      nitro: 100,
      isBoosting: false,
      isDrifting: false,
      wrecked: false,
      wreckTime: 0,
      kills: 0,
      damageDealt: 0,
      lastHitBy: null,
      lastHitTimer: 0,
      damageCooldown: 0,
      zones: { front: 0, rear: 0, left: 0, right: 0 },
      attachedParts: new Set(allParts),
      squashY: 0,
      aiTargetId: null,
      aiRetargetTimer: 0,
      aiReverseTimer: 0,
      aiStuckTimer: 0,
      aiNitroBurstTimer: 0,
    };
  }

  private setupAttractDemo(): void {
    this.clearCars();
    this.effects.clearArenaEffects();
    this.phase = 'title';
    this.mode = '1p';

    const ringCount = 6;
    const spawnRad = 36;
    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2;
      const sx = Math.cos(angle) * spawnRad;
      const sz = Math.sin(angle) * spawnRad;
      const yaw = Math.atan2(-sx, -sz);
      const colorOpt = CAR_COLORS[i % CAR_COLORS.length];
      this.cars.push(
        this.createCarEntity({
          id: `demo_${i}`,
          name: AI_NAMES[i % AI_NAMES.length],
          numberLabel: AI_NUMBERS[i % AI_NUMBERS.length],
          colorId: colorOpt.id,
          isPlayer: false,
          playerSlot: null,
          spawnX: sx,
          spawnZ: sz,
          spawnYaw: yaw,
        }),
      );
    }
    this.updateCameraAspects();
    this.emitHud();
  }

  public startMatch(config: StartMatchConfig): void {
    this.audio.unlock();
    this.lastConfig = { ...config };
    this.mode = config.mode;
    this.clearCars();
    this.effects.clearArenaEffects();

    this.elapsedMatchSeconds = 0;
    this.hitstopTimer = 0;
    this.shakeP1 = 0;
    this.shakeP2 = 0;
    this.peakImpactKmh = 0;
    this.totalPartsDetached = 0;
    this.pendingGameOver = false;
    this.gameOverDelay = 0;
    this.callout = null;
    this.calloutTimer = 0;

    // Build participant roster
    const specs: {
      id: string;
      name: string;
      numberLabel: string;
      colorId: CarColorId;
      isPlayer: boolean;
      playerSlot: 0 | 1 | null;
    }[] = [
      {
        id: 'p1',
        name: 'Jugador 1',
        numberLabel: '01',
        colorId: config.p1Color,
        isPlayer: true,
        playerSlot: 0,
      },
    ];

    if (config.mode === '2p') {
      specs.push({
        id: 'p2',
        name: 'Jugador 2',
        numberLabel: '02',
        colorId: config.p2Color,
        isPlayer: true,
        playerSlot: 1,
      });
    }

    const availableColors = CAR_COLORS.filter(
      (c) =>
        c.id !== config.p1Color &&
        (config.mode !== '2p' || c.id !== config.p2Color),
    );

    for (let i = 0; i < config.aiCount; i++) {
      const col =
        availableColors.length > 0
          ? availableColors[i % availableColors.length]
          : CAR_COLORS[i % CAR_COLORS.length];
      specs.push({
        id: `ai_${i}`,
        name: AI_NAMES[i % AI_NAMES.length],
        numberLabel: AI_NUMBERS[i % AI_NUMBERS.length],
        colorId: col.id,
        isPlayer: false,
        playerSlot: null,
      });
    }

    // Place cars in a grand perimeter circle facing the center!
    const spawnRad = ARENA_RADIUS - 12;
    for (let i = 0; i < specs.length; i++) {
      // Spread P1 and P2 opposite each other in 2P mode for head-on start!
      let idx = i;
      if (config.mode === '2p' && i === 1) {
        idx = Math.floor(specs.length / 2);
      } else if (config.mode === '2p' && i > 1 && i <= Math.floor(specs.length / 2)) {
        idx = i - 1;
      }

      const angle = (idx / specs.length) * Math.PI * 2;
      const sx = Math.cos(angle) * spawnRad;
      const sz = Math.sin(angle) * spawnRad;
      const yaw = Math.atan2(-sx, -sz);

      const s = specs[i];
      const car = this.createCarEntity({
        ...s,
        spawnX: sx,
        spawnZ: sz,
        spawnYaw: yaw,
      });
      resetCarMeshRig(car.rig);
      this.cars.push(car);
    }

    // Snap cameras behind player 1 & player 2 cleanly
    const p1 = this.cars.find((c) => c.playerSlot === 0);
    if (p1) {
      this.snapCameraBehind(this.camera1, this.cam1LookCurrent, p1);
    }
    const p2 = this.cars.find((c) => c.playerSlot === 1);
    if (p2) {
      this.snapCameraBehind(this.camera2, this.cam2LookCurrent, p2);
    }

    this.phase = 'countdown';
    this.countdownTimer = 3.2;
    this.lastCountdownStep = 4;
    this.audio.setMusicMode('battle');
    this.updateCameraAspects();
    this.emitHud();
  }

  public restartMatch(): void {
    this.startMatch(this.lastConfig);
  }

  public returnToTitle(): void {
    this.audio.setMusicMode('ambient');
    this.audio.updateContinuous({
      active: false,
      p1SpeedRatio: 0,
      p1Alive: false,
      p1Boosting: false,
      p2SpeedRatio: null,
      p2Alive: false,
      p2Boosting: false,
      skidIntensity: 0,
    });
    this.setupAttractDemo();
  }

  public setPaused(paused: boolean): void {
    if (paused && (this.phase === 'playing' || this.phase === 'countdown')) {
      this.phase = 'paused';
      this.heldKeys.clear();
      this.audio.setMusicMode('ambient');
      this.audio.updateContinuous({
        active: false,
        p1SpeedRatio: 0,
        p1Alive: false,
        p1Boosting: false,
        p2SpeedRatio: null,
        p2Alive: false,
        p2Boosting: false,
        skidIntensity: 0,
      });
      this.emitHud();
    } else if (!paused && this.phase === 'paused') {
      this.phase = this.countdownTimer > 0 ? 'countdown' : 'playing';
      this.audio.setMusicMode('battle');
      this.clock.getDelta();
      this.emitHud();
    }
  }

  public setMuted(muted: boolean): void {
    this.audio.unlock();
    this.audio.setMuted(muted);
  }

  public setMusicMuted(muted: boolean): void {
    this.audio.unlock();
    this.audio.setMusicMuted(muted);
  }

  public isMuted(): boolean {
    return this.audio.isMuted();
  }

  private snapCameraBehind(
    cam: THREE.PerspectiveCamera,
    lookTarget: THREE.Vector3,
    car: DerbyCar,
  ): void {
    const fwdX = Math.sin(car.yaw);
    const fwdZ = Math.cos(car.yaw);
    cam.position.set(car.x - fwdX * 10.5, car.y + 4.8, car.z - fwdZ * 10.5);
    lookTarget.set(car.x + fwdX * 4, car.y + 1.4, car.z + fwdZ * 4);
    cam.lookAt(lookTarget);
  }

  private readPlayerInput(slot: 0 | 1): CarInput {
    const k = this.heldKeys;

    if (slot === 0) {
      // In 1P mode allow either WASD or Arrows for P1!
      const allowArrows = this.mode === '1p';
      const up = k.has('KeyW') || (allowArrows && k.has('ArrowUp'));
      const down = k.has('KeyS') || (allowArrows && k.has('ArrowDown'));
      const left = k.has('KeyA') || (allowArrows && k.has('ArrowLeft'));
      const right = k.has('KeyD') || (allowArrows && k.has('ArrowRight'));
      const nitro =
        k.has('ShiftLeft') ||
        k.has('KeyE') ||
        (allowArrows && (k.has('ShiftRight') || k.has('Enter')));
      const handbrake = k.has('Space');

      return {
        throttle: (up ? 1 : 0) - (down ? 1 : 0),
        steer: (left ? 1 : 0) - (right ? 1 : 0),
        handbrake,
        nitro,
      };
    }

    // Player 2 in 2P split-screen
    const up = k.has('ArrowUp');
    const down = k.has('ArrowDown');
    const left = k.has('ArrowLeft');
    const right = k.has('ArrowRight');
    const nitro =
      k.has('Enter') ||
      k.has('Numpad0') ||
      k.has('Slash') ||
      k.has('Period');
    const handbrake = k.has('ControlRight') || k.has('ShiftRight');

    return {
      throttle: (up ? 1 : 0) - (down ? 1 : 0),
      steer: (left ? 1 : 0) - (right ? 1 : 0),
      handbrake,
      nitro,
    };
  }

  private updateChaseCamera(
    cam: THREE.PerspectiveCamera,
    lookCurrent: THREE.Vector3,
    targetCar: DerbyCar,
    shakeAmt: number,
    dt: number,
  ): void {
    const fwdX = Math.sin(targetCar.yaw);
    const fwdZ = Math.cos(targetCar.yaw);
    const speed = Math.hypot(targetCar.vx, targetCar.vz);

    const distBack = targetCar.wrecked ? 12.5 : 9.4 + (speed / 45) * 2.1;
    const heightUp = targetCar.wrecked ? 5.8 : 4.15 + (speed / 45) * 0.75;

    _camDesired.set(
      targetCar.x - fwdX * distBack,
      targetCar.y + heightUp,
      targetCar.z - fwdZ * distBack,
    );

    // Clamp camera inside arena sightline
    const minY = groundHeightAt(_camDesired.x, _camDesired.z) + 1.5;
    if (_camDesired.y < minY) _camDesired.y = minY;

    const dampLambda = targetCar.wrecked ? 4.5 : 8.5;
    cam.position.x = THREE.MathUtils.damp(
      cam.position.x,
      _camDesired.x,
      dampLambda,
      dt,
    );
    cam.position.y = THREE.MathUtils.damp(
      cam.position.y,
      _camDesired.y,
      dampLambda,
      dt,
    );
    cam.position.z = THREE.MathUtils.damp(
      cam.position.z,
      _camDesired.z,
      dampLambda,
      dt,
    );

    if (shakeAmt > 0.01) {
      cam.position.x += (Math.random() - 0.5) * shakeAmt * 0.85;
      cam.position.y += (Math.random() - 0.5) * shakeAmt * 0.65;
      cam.position.z += (Math.random() - 0.5) * shakeAmt * 0.85;
    }

    _camLook.set(
      targetCar.x + fwdX * 4.5,
      targetCar.y + 1.45,
      targetCar.z + fwdZ * 4.5,
    );
    lookCurrent.x = THREE.MathUtils.damp(lookCurrent.x, _camLook.x, 12, dt);
    lookCurrent.y = THREE.MathUtils.damp(lookCurrent.y, _camLook.y, 12, dt);
    lookCurrent.z = THREE.MathUtils.damp(lookCurrent.z, _camLook.z, 12, dt);
    cam.lookAt(lookCurrent);

    // Dynamic speed & nitro FOV
    const targetFov = targetCar.isBoosting
      ? 78
      : 63 + THREE.MathUtils.clamp(speed / 36, 0, 1) * 7;
    if (Math.abs(cam.fov - targetFov) > 0.05) {
      cam.fov = THREE.MathUtils.damp(cam.fov, targetFov, 7.5, dt);
      cam.updateProjectionMatrix();
    }
  }

  private stepFrame(rawDt: number): void {
    const dt = Math.min(rawDt, 0.05);
    const elapsed = this.clock.elapsedTime;

    this.arena.update(dt, elapsed);

    if (this.phase === 'paused') {
      return;
    }

    // Callout decay
    if (this.calloutTimer > 0) {
      this.calloutTimer -= dt;
      if (this.calloutTimer <= 0) {
        this.callout = null;
      }
    }

    // Hitstop freeze on massive collisions
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.effects.update(dt * 0.15);
      return;
    }

    // Countdown sequence
    if (this.phase === 'countdown') {
      this.countdownTimer -= dt;
      const step = Math.ceil(this.countdownTimer);
      if (step !== this.lastCountdownStep && step >= 1 && step <= 3) {
        this.lastCountdownStep = step;
        this.audio.playCountdownTone(false);
      }
      if (this.countdownTimer <= 0) {
        this.phase = 'playing';
        this.audio.playCountdownTone(true);
        this.callout = {
          id: this.nextCalloutId++,
          text: '¡A CHOCAR!',
          subtext: 'ÚLTIMO AUTO EN PIE GANA',
          tone: 'nitro',
          targetViewport: 'all',
        };
        this.calloutTimer = 1.6;
        this.emitHud();
      }
    }

    // Prepare inputs for all cars
    const inputs = new Map<string, CarInput>();
    for (const car of this.cars) {
      if (car.isPlayer && car.playerSlot !== null) {
        inputs.set(car.id, this.readPlayerInput(car.playerSlot));
      } else {
        inputs.set(car.id, computeAiInput(car, this.cars, dt));
      }
    }

    const allowDriving =
      this.phase === 'playing' ||
      this.phase === 'title' ||
      this.phase === 'gameover';

    const simDt = this.pendingGameOver ? dt * 0.42 : dt;
    if (this.phase === 'playing') {
      this.elapsedMatchSeconds += dt;
    }

    const feedback = stepDerbySimulation(
      this.cars,
      inputs,
      this.arena.nitroPads,
      this.effects,
      simDt,
      allowDriving,
    );

    this.effects.update(simDt);

    // Process title demo auto-reset if everyone gets wrecked
    if (this.phase === 'title') {
      const aliveDemo = this.cars.filter((c) => !c.wrecked).length;
      if (aliveDemo <= 1) {
        this.setupAttractDemo();
      }
      this.titleOrbitAngle += dt * 0.16;
      const orbitR = 46;
      this.camera1.position.set(
        Math.cos(this.titleOrbitAngle) * orbitR,
        19 + Math.sin(this.titleOrbitAngle * 0.7) * 3,
        Math.sin(this.titleOrbitAngle) * orbitR,
      );
      this.camera1.lookAt(0, 2.5, 0);
      return;
    }

    // Apply collision feedback (hitstop, shake, audio, callouts)
    if (feedback.hitstop > 0) {
      this.hitstopTimer = feedback.hitstop;
    }
    this.shakeP1 = Math.max(
      this.shakeP1 * Math.exp(-7.5 * dt),
      feedback.shakeP1,
    );
    this.shakeP2 = Math.max(
      this.shakeP2 * Math.exp(-7.5 * dt),
      feedback.shakeP2,
    );
    this.peakImpactKmh = Math.max(this.peakImpactKmh, feedback.peakSpeedKmh);
    this.totalPartsDetached += feedback.partsDetachedThisStep;

    if (feedback.impactStrength > 0.12) {
      this.audio.playImpact(feedback.impactStrength);
    }
    if (feedback.wreckedCountThisStep > 0) {
      this.audio.playWreckExplosion();
    } else if (feedback.partsDetachedThisStep > 0) {
      this.audio.playPartDetach();
    }
    if (feedback.nitroPickedUp) {
      this.audio.playPickup();
    }
    if (feedback.calloutText) {
      this.callout = {
        id: this.nextCalloutId++,
        text: feedback.calloutText,
        subtext: feedback.calloutSubtext,
        tone: feedback.calloutTone ?? 'impact',
        targetViewport: feedback.calloutTarget ?? 'all',
      };
      this.calloutTimer = 1.9;
    }

    // Continuous procedural engine & skid audio
    const p1 = this.cars.find((c) => c.playerSlot === 0);
    const p2 = this.cars.find((c) => c.playerSlot === 1);
    const p1Speed = p1 ? Math.hypot(p1.vx, p1.vz) : 0;
    const p2Speed = p2 ? Math.hypot(p2.vx, p2.vz) : 0;
    const skidAmt =
      (p1 && !p1.wrecked && p1.isDrifting ? 0.7 : 0) +
      (p2 && !p2.wrecked && p2.isDrifting ? 0.55 : 0);

    this.audio.updateContinuous({
      active: this.phase === 'playing' || this.phase === 'countdown',
      p1SpeedRatio: Math.min(1, p1Speed / 36),
      p1Alive: Boolean(p1 && !p1.wrecked),
      p1Boosting: Boolean(p1?.isBoosting),
      p2SpeedRatio: p2 ? Math.min(1, p2Speed / 36) : null,
      p2Alive: Boolean(p2 && !p2.wrecked),
      p2Boosting: Boolean(p2?.isBoosting),
      skidIntensity: skidAmt,
    });

    // Update Chase Cameras (fallback to alive survivor if a player is wrecked)
    const aliveList = this.cars.filter((c) => !c.wrecked);
    const p1CamTarget =
      p1 && (!p1.wrecked || p1.wreckTime < 2.2)
        ? p1
        : aliveList[0] ?? p1 ?? this.cars[0];
    if (p1CamTarget) {
      this.updateChaseCamera(
        this.camera1,
        this.cam1LookCurrent,
        p1CamTarget,
        this.shakeP1,
        dt,
      );
    }

    if (this.mode === '2p') {
      const p2CamTarget =
        p2 && (!p2.wrecked || p2.wreckTime < 2.2)
          ? p2
          : aliveList[0] ?? p2 ?? this.cars[0];
      if (p2CamTarget) {
        this.updateChaseCamera(
          this.camera2,
          this.cam2LookCurrent,
          p2CamTarget,
          this.shakeP2,
          dt,
        );
      }
    }

    // Check Last Car Standing / Match Over condition
    if (this.phase === 'playing' && !this.pendingGameOver) {
      const playersAlive = this.cars.filter(
        (c) => c.isPlayer && !c.wrecked,
      ).length;
      const totalAlive = aliveList.length;

      // End when <= 1 car remains, OR in 1P when player is wrecked, OR in 2P when both players are wrecked (if AI remain, let 1P/2P end gracefully)
      const shouldEnd =
        totalAlive <= 1 ||
        (this.mode === '1p' && playersAlive === 0) ||
        (this.mode === '2p' && playersAlive === 0);

      if (shouldEnd) {
        this.pendingGameOver = true;
        this.gameOverDelay = 1.65;
      }
    }

    if (this.pendingGameOver && this.phase === 'playing') {
      this.gameOverDelay -= dt;
      if (this.gameOverDelay <= 0) {
        this.finishMatch();
      }
    }

    // Throttled HUD snapshot emission (~24Hz)
    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.042) {
      this.hudEmitAccum = 0;
      this.emitHud();
    }
  }

  private finishMatch(): void {
    this.phase = 'gameover';
    this.pendingGameOver = false;
    this.audio.setMusicMode('ambient');
    this.audio.updateContinuous({
      active: false,
      p1SpeedRatio: 0,
      p1Alive: false,
      p1Boosting: false,
      p2SpeedRatio: null,
      p2Alive: false,
      p2Boosting: false,
      skidIntensity: 0,
    });

    const alive = this.cars.filter((c) => !c.wrecked);
    const sorted = [...this.cars].sort((a, b) => {
      if (a.wrecked !== b.wrecked) return a.wrecked ? 1 : -1;
      if (b.hp !== a.hp) return b.hp - a.hp;
      return b.kills - a.kills || b.damageDealt - a.damageDealt;
    });

    const winner = alive.length === 1 ? alive[0] : sorted[0];

    const summary: MatchSummary = {
      winnerName: winner ? winner.name : 'Empate',
      winnerId: winner ? winner.id : null,
      winnerColorHex: winner ? winner.colorOpt.primaryHex : '#F59E0B',
      isPlayerWin: Boolean(winner?.isPlayer),
      durationSeconds: Math.round(this.elapsedMatchSeconds),
      peakImpactKmh: this.peakImpactKmh,
      totalPartsDetached: this.totalPartsDetached,
      standings: sorted.map((c) => ({
        id: c.id,
        name: c.name,
        numberLabel: c.numberLabel,
        colorHex: c.colorOpt.primaryHex,
        isPlayer: c.isPlayer,
        kills: c.kills,
        damageDealt: c.damageDealt,
        hp: Math.round(c.hp),
        wrecked: c.wrecked,
      })),
    };

    this.emitHud();
    this.callbacks.onMatchEnd(summary);
  }

  private buildPlayerHudState(
    car: DerbyCar,
    aliveList: DerbyCar[],
  ): PlayerHudState {
    let spectatingName: string | undefined;
    if (car.wrecked && car.wreckTime >= 2.2 && aliveList.length > 0) {
      spectatingName = aliveList[0].name;
    }
    return {
      id: car.id,
      name: car.name,
      numberLabel: car.numberLabel,
      colorHex: car.colorOpt.primaryHex,
      hp: Math.ceil(car.hp),
      nitro: Math.round(car.nitro),
      speedKmh: Math.round(Math.hypot(car.vx, car.vz) * 3.6),
      isBoosting: car.isBoosting,
      isDrifting: car.isDrifting,
      isAirborne: !car.grounded,
      wrecked: car.wrecked,
      kills: car.kills,
      damageDealt: car.damageDealt,
      zones: { ...car.zones },
      detachedCount: 7 - car.attachedParts.size,
      spectatingName,
    };
  }

  private emitHud(): void {
    const aliveList = this.cars.filter((c) => !c.wrecked);
    const p1 = this.cars.find((c) => c.playerSlot === 0);
    const p2 = this.cars.find((c) => c.playerSlot === 1);
    const players: PlayerHudState[] = [];
    if (p1) players.push(this.buildPlayerHudState(p1, aliveList));
    if (p2) players.push(this.buildPlayerHudState(p2, aliveList));

    this.callbacks.onHudUpdate({
      phase: this.phase,
      mode: this.mode,
      countdownValue: Math.max(0, Math.ceil(this.countdownTimer)),
      aliveCount: aliveList.length,
      totalCars: this.cars.length,
      elapsedSeconds: Math.floor(this.elapsedMatchSeconds),
      players,
      callout: this.callout,
    });
  }

  private renderScene(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);

    if (this.mode === '2p' && this.phase !== 'title') {
      const halfW = Math.floor(w / 2);
      const rightW = w - halfW;

      this.renderer.setScissorTest(true);

      // Left Viewport: Player 1
      this.renderer.setViewport(0, 0, halfW, h);
      this.renderer.setScissor(0, 0, halfW, h);
      this.renderer.render(this.scene, this.camera1);

      // Right Viewport: Player 2
      this.renderer.setViewport(halfW, 0, rightW, h);
      this.renderer.setScissor(halfW, 0, rightW, h);
      this.renderer.render(this.scene, this.camera2);

      this.renderer.setScissorTest(false);
    } else {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, w, h);
      this.renderer.render(this.scene, this.camera1);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;
    const rawDt = this.clock.getDelta();
    this.stepFrame(rawDt);
    this.renderScene();
    this.scheduleNextFrame();
  };

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.unbindEvents();
    this.clearCars();
    this.effects.dispose();
    this.arena.dispose();
    this.audio.dispose();
    this.contactShadowTex.dispose();
    this.envRenderTarget.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
