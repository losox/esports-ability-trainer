import * as THREE from 'three';
import { SceneBase } from '../shared/scene-base';
import {
  MAX_FAILS,
  getDifficultyLevel,
  getMovementSpeed,
  getMovementPattern,
  getTargetSize,
  getKillTimeLimit,
  getTargetHealth,
  calculateTrackingSmoothness,
  type KillResult,
} from './logic';

type TargetState = 'none' | 'active' | 'dying';

interface TrackingSceneCallbacks {
  onHealthUpdate?: (health: number, maxHealth: number) => void;
  onKill?: (kill: KillResult) => void;
  onFail?: (failCount: number) => void;
  onTimeUpdate?: (remainingMs: number, limitMs: number) => void;
  onAccuracyUpdate?: (accuracy: number) => void;
  onPointerLockChange?: (locked: boolean) => void;
  onGameOver?: (kills: KillResult[], fails: number) => void;
  onDifficultyChange?: (level: number) => void;
}

const COLORS = {
  ground: 0x1a1a1e,
  wall: 0x2a2a2e,
  ceiling: 0x1a1a1e,
  marker: 0x3a3a3e,
  lightStrip: 0xff8844,
  head: 0xffd700,
  body: 0xff4500,
  base: 0x3a3a3e,
  boothRailing: 0x4a4a4e,
  healthFull: 0xffd700,
  healthLow: 0xff4500,
};

const HEAD_RADIUS = 0.15;
const BODY_RADIUS = 0.25;
const BODY_HEIGHT = 0.7;
const BASE_RADIUS = 0.35;
const BASE_HEIGHT = 0.08;
const DISSOLVE_DURATION_MS = 300;
const SPAWN_DELAY_MS = 300;
const MUZZLE_FLASH_MAX = 4;
const REGEN_PER_SECOND = 10;

export class TrackingScene extends SceneBase {
  private callbacks: TrackingSceneCallbacks;
  private currentTarget: THREE.Group | null = null;
  private targetState: TargetState = 'none';
  private targetHealth = 100;
  private maxTargetHealth = 100;
  private killCount = 0;
  private killResults: KillResult[] = [];
  private fails = 0;
  private gameActive = false;
  private isPointerLocked = false;
  private pauseStartTime = 0;
  private targetSpawnTime = 0;
  private dissolveStartTime = 0;
  private nextSpawnTime = 0;
  private currentLevel = 0;
  private currentKillTimeLimit = 8000;
  private yaw = 0;
  private pitch = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private isFiring = false;
  private timeOnTarget = 0;
  private totalTime = 0;
  private velocityChanges: number[] = [];
  private lastFrameTime = 0;
  private moveDirection = new THREE.Vector3(1, 0, 0);
  private moveTimer = 0;
  private jumpVelocity = 0;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(0, 0);
  private muzzleFlash: THREE.PointLight | null = null;
  private healthBar: THREE.Mesh | null = null;
  private audioCtx: AudioContext | null = null;

  constructor(container: HTMLElement, callbacks: TrackingSceneCallbacks = {}) {
    super({
      container,
      cameraType: 'first-person',
      onPointerLockChange: (locked) => this.handlePointerLockChange(locked),
    });
    this.callbacks = callbacks;
  }

  protected onInit(): void {
    this.createEnvironment();
    this.createMuzzleFlash();
    this.initAudio();
    this.setupInputHandlers();
  }

  private createEnvironment(): void {
    this.createGround();
    this.createWalls();
    this.createCeilingLights();
    this.createDistanceMarkers();
    this.createShootingBooth();
  }

  private createGround(): void {
    const geo = new THREE.PlaneGeometry(40, 40);
    const mat = new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 0.95 });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
  }

  private createWalls(): void {
    const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.85 });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(24, 6, 0.3), wallMat);
    backWall.position.set(0, 3, -25);
    this.scene.add(backWall);

    const sideGeo = new THREE.BoxGeometry(0.3, 6, 30);
    const leftWall = new THREE.Mesh(sideGeo, wallMat);
    leftWall.position.set(-12, 3, -10);
    this.scene.add(leftWall);

    const rightWall = new THREE.Mesh(sideGeo, wallMat);
    rightWall.position.set(12, 3, -10);
    this.scene.add(rightWall);

    const ceilMat = new THREE.MeshStandardMaterial({ color: COLORS.ceiling, roughness: 0.9 });
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(24, 0.3, 30), ceilMat);
    ceiling.position.set(0, 6, -10);
    this.scene.add(ceiling);
  }

  private createCeilingLights(): void {
    const stripMat = new THREE.MeshStandardMaterial({
      color: COLORS.lightStrip,
      emissive: COLORS.lightStrip,
      emissiveIntensity: 0.8,
    });
    for (let i = 0; i < 4; i++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(20, 0.1, 0.4), stripMat);
      strip.position.set(0, 5.8, -5 - i * 5);
      this.scene.add(strip);

      const light = new THREE.PointLight(COLORS.lightStrip, 0.5, 15);
      light.position.set(0, 5.5, -5 - i * 5);
      this.scene.add(light);
    }
  }

  private createDistanceMarkers(): void {
    const markerMat = new THREE.MeshStandardMaterial({ color: COLORS.marker, roughness: 0.7 });
    for (const d of [5, 10, 15, 20]) {
      const marker = new THREE.Mesh(new THREE.BoxGeometry(24, 0.05, 0.3), markerMat);
      marker.position.set(0, 0.03, -d);
      this.scene.add(marker);
    }
  }

  private createShootingBooth(): void {
    const railingMat = new THREE.MeshStandardMaterial({
      color: COLORS.boothRailing,
      roughness: 0.5,
      metalness: 0.6,
    });
    const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8);
    for (const [px, pz] of [
      [-1.5, -0.5],
      [1.5, -0.5],
    ] as const) {
      const post = new THREE.Mesh(postGeo, railingMat);
      post.position.set(px, 0.6, pz);
      this.scene.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 8), railingMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 1.1, -0.5);
    this.scene.add(bar);
  }

  private createMuzzleFlash(): void {
    this.muzzleFlash = new THREE.PointLight(0xff8844, 0, 8);
    this.muzzleFlash.position.set(0, 1.6, -0.5);
    this.camera.add(this.muzzleFlash);
    this.scene.add(this.camera);
  }

  private initAudio(): void {
    try {
      this.audioCtx = new AudioContext();
    } catch {
      this.audioCtx = null;
    }
  }

  private setupInputHandlers(): void {
    document.addEventListener('mousemove', this.handleMouseMove);
    this.renderer.domElement.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mouseup', this.handleMouseUp);
  }

  private handleMouseMove = (event: MouseEvent): void => {
    if (!this.isPointerLocked || !this.gameActive) return;
    const sens = this.sensitivity.value * 0.002;
    this.yaw -= event.movementX * sens;
    this.pitch -= event.movementY * sens;
    const limit = Math.PI / 2 - 0.1;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  };

  private handleMouseDown = (): void => {
    if (!this.isPointerLocked || !this.gameActive) return;
    if (this.targetState !== 'active') return;
    this.isFiring = true;
  };

  private handleMouseUp = (): void => {
    this.isFiring = false;
  };

  private handlePointerLockChange(locked: boolean): void {
    this.isPointerLocked = locked;
    this.isFiring = false;
    this.callbacks.onPointerLockChange?.(locked);
    if (locked) {
      if (this.pauseStartTime > 0) {
        this.targetSpawnTime += performance.now() - this.pauseStartTime;
        this.pauseStartTime = 0;
      }
      if (!this.gameActive) {
        this.startGame();
      }
    } else if (this.gameActive && this.targetState === 'active') {
      this.pauseStartTime = performance.now();
    }
  }

  private startGame(): void {
    this.gameActive = true;
    this.killCount = 0;
    this.killResults = [];
    this.fails = 0;
    this.targetState = 'none';
    this.nextSpawnTime = performance.now();
    this.lastFrameTime = 0;
  }

  protected onUpdate(): void {
    if (!this.gameActive) return;
    const now = performance.now();
    const delta = this.lastFrameTime > 0 ? Math.min((now - this.lastFrameTime) / 1000, 0.1) : 0.016;
    this.lastFrameTime = now;
    this.updateMuzzleFlash();
    if (!this.isPointerLocked) return;
    if (this.targetState === 'active' && this.currentTarget) {
      this.updateActiveTarget(delta);
    }
    if (this.targetState === 'dying') {
      this.updateDissolve();
    }
    if (this.targetState === 'none' && now >= this.nextSpawnTime) {
      this.spawnTarget();
    }
  }

  private updateActiveTarget(delta: number): void {
    this.updateTargetMovement(delta);
    this.trackVelocity();
    const onTarget = this.checkCrosshairOnTarget();
    this.applyDamageAndRegen(delta, onTarget);
    this.updateHealthBar();
    this.totalTime += delta * 1000;
    if (onTarget) {
      this.timeOnTarget += delta * 1000;
    }
    this.updateAccuracyAndTime();
    this.checkKillOrTimeout();
  }

  private updateTargetMovement(delta: number): void {
    if (!this.currentTarget) return;
    const speed = getMovementSpeed(this.currentLevel);
    const pattern = getMovementPattern(this.currentLevel);
    const pos = this.currentTarget.position;
    switch (pattern) {
      case 'straight':
        this.moveStraight(pos, speed, delta);
        break;
      case 'zigzag':
        this.moveZigzag(pos, speed, delta);
        break;
      case 'random':
        this.moveRandom(pos, speed, delta);
        break;
    }
    pos.y = 0 + Math.abs(Math.sin(performance.now() * 0.005)) * 0.08 + this.jumpVelocity;
    this.updateJump(delta);
  }

  private moveStraight(pos: THREE.Vector3, speed: number, delta: number): void {
    pos.x += this.moveDirection.x * speed * delta;
    if (pos.x > 7) {
      pos.x = 7;
      this.moveDirection.x = -1;
    }
    if (pos.x < -7) {
      pos.x = -7;
      this.moveDirection.x = 1;
    }
  }

  private moveZigzag(pos: THREE.Vector3, speed: number, delta: number): void {
    pos.x += this.moveDirection.x * speed * delta;
    pos.z = -8 + Math.sin(performance.now() * 0.0015) * 3;
    if (pos.x > 7) {
      pos.x = 7;
      this.moveDirection.x = -1;
    }
    if (pos.x < -7) {
      pos.x = -7;
      this.moveDirection.x = 1;
    }
  }

  private moveRandom(pos: THREE.Vector3, speed: number, delta: number): void {
    this.moveTimer += delta;
    if (this.moveTimer > 0.8 + Math.random() * 0.7) {
      this.moveDirection.x = (Math.random() - 0.5) * 2;
      this.moveDirection.z = (Math.random() - 0.5) * 1;
      this.moveTimer = 0;
      if (Math.random() < 0.3) {
        this.jumpVelocity = 0;
        this.jumpVelocity = 3;
      }
    }
    pos.x += this.moveDirection.x * speed * delta;
    pos.z += this.moveDirection.z * speed * delta;
    pos.x = Math.max(-7, Math.min(7, pos.x));
    pos.z = Math.max(-15, Math.min(-5, pos.z));
  }

  private updateJump(delta: number): void {
    if (this.jumpVelocity > 0) {
      this.jumpVelocity -= 9.8 * delta;
      if (this.jumpVelocity < 0) this.jumpVelocity = 0;
    }
  }

  private trackVelocity(): void {
    const dyaw = this.yaw - this.lastYaw;
    const dpitch = this.pitch - this.lastPitch;
    const velocity = Math.sqrt(dyaw * dyaw + dpitch * dpitch);
    this.velocityChanges.push(velocity);
    this.lastYaw = this.yaw;
    this.lastPitch = this.pitch;
  }

  private checkCrosshairOnTarget(): boolean {
    if (!this.currentTarget) return false;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes: THREE.Object3D[] = [];
    this.currentTarget.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.hittable !== false) {
        meshes.push(child);
      }
    });
    return this.raycaster.intersectObjects(meshes, false).length > 0;
  }

  private applyDamageAndRegen(delta: number, onTarget: boolean): void {
    const dps = this.getDamagePerSecond(this.currentLevel);
    if (this.isFiring && onTarget) {
      this.targetHealth -= dps * delta;
      this.callbacks.onHealthUpdate?.(this.targetHealth, this.maxTargetHealth);
    } else {
      this.targetHealth += REGEN_PER_SECOND * delta;
      if (this.targetHealth > this.maxTargetHealth) {
        this.targetHealth = this.maxTargetHealth;
      }
    }
  }

  private getDamagePerSecond(level: number): number {
    return 40 + level * 8;
  }

  private updateHealthBar(): void {
    if (!this.healthBar || !this.currentTarget) return;
    this.healthBar.position.copy(this.currentTarget.position);
    this.healthBar.position.y += 1.9;
    this.healthBar.lookAt(this.camera.position);
    const ratio = Math.max(0, this.targetHealth / this.maxTargetHealth);
    this.healthBar.scale.x = Math.max(0.01, ratio);
    const mat = this.healthBar.material as THREE.MeshBasicMaterial;
    const r = 1;
    const g = Math.round(ratio * 0xd7);
    mat.color.setRGB(r, g / 255, 0);
  }

  private updateAccuracyAndTime(): void {
    const accuracy =
      this.totalTime > 0 ? Math.round((this.timeOnTarget / this.totalTime) * 100) : 0;
    this.callbacks.onAccuracyUpdate?.(accuracy);
    const remaining = this.currentKillTimeLimit - (performance.now() - this.targetSpawnTime);
    this.callbacks.onTimeUpdate?.(Math.max(0, remaining), this.currentKillTimeLimit);
  }

  private checkKillOrTimeout(): void {
    if (this.targetHealth <= 0) {
      this.handleKill();
      return;
    }
    const elapsed = performance.now() - this.targetSpawnTime;
    if (elapsed >= this.currentKillTimeLimit) {
      this.handleFail();
    }
  }

  private handleKill(): void {
    const killTime = performance.now() - this.targetSpawnTime;
    const smoothness = calculateTrackingSmoothness(this.velocityChanges);
    const result: KillResult = {
      killTimeMs: Math.round(killTime),
      timeOnTargetMs: Math.round(this.timeOnTarget),
      totalTimeMs: Math.round(this.totalTime),
      difficultyLevel: this.currentLevel,
      smoothness,
    };
    this.killResults.push(result);
    this.killCount++;
    this.callbacks.onKill?.(result);
    this.playKillSound();
    this.startDissolve();
  }

  private handleFail(): void {
    this.fails++;
    this.callbacks.onFail?.(this.fails);
    this.playFailSound();
    this.clearCurrentTarget();
    if (this.fails >= MAX_FAILS) {
      this.gameOver();
      return;
    }
    this.targetState = 'none';
    this.nextSpawnTime = performance.now() + SPAWN_DELAY_MS;
  }

  private startDissolve(): void {
    this.targetState = 'dying';
    this.dissolveStartTime = performance.now();
    this.isFiring = false;
    this.currentTarget?.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        mat.transparent = true;
      }
    });
  }

  private updateDissolve(): void {
    if (!this.currentTarget) return;
    const elapsed = performance.now() - this.dissolveStartTime;
    const progress = Math.min(elapsed / DISSOLVE_DURATION_MS, 1);
    this.currentTarget.scale.setScalar(1 + progress * 0.5);
    this.currentTarget.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        mat.opacity = 1 - progress;
      }
    });
    if (progress >= 1) {
      this.clearCurrentTarget();
      this.targetState = 'none';
      this.nextSpawnTime = performance.now() + SPAWN_DELAY_MS;
    }
  }

  private spawnTarget(): void {
    this.clearCurrentTarget();
    const level = getDifficultyLevel(this.killCount + this.fails);
    this.currentLevel = level;
    const size = getTargetSize(level);
    this.maxTargetHealth = getTargetHealth(level);
    this.targetHealth = this.maxTargetHealth;
    this.currentKillTimeLimit = getKillTimeLimit(level);
    this.currentTarget = this.createHumanoidTarget(size);
    const startZ = -8 - Math.random() * 4;
    this.currentTarget.position.set((Math.random() - 0.5) * 10, 0, startZ);
    this.scene.add(this.currentTarget);
    this.createHealthBar();
    this.targetSpawnTime = performance.now();
    this.targetState = 'active';
    this.timeOnTarget = 0;
    this.totalTime = 0;
    this.velocityChanges = [];
    this.lastYaw = this.yaw;
    this.lastPitch = this.pitch;
    this.moveDirection.set(Math.random() > 0.5 ? 1 : -1, 0, 0);
    this.moveTimer = 0;
    this.jumpVelocity = 0;
    this.callbacks.onDifficultyChange?.(level);
    this.callbacks.onHealthUpdate?.(this.targetHealth, this.maxTargetHealth);
  }

  private createHumanoidTarget(size: number): THREE.Group {
    const group = new THREE.Group();
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(HEAD_RADIUS * size, 16, 16),
      new THREE.MeshStandardMaterial({
        color: COLORS.head,
        emissive: COLORS.head,
        emissiveIntensity: 0.4,
        roughness: 0.3,
        metalness: 0.7,
      }),
    );
    head.position.set(0, 1.65 * size, 0);
    head.userData.hittable = true;
    group.add(head);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(BODY_RADIUS * size, BODY_RADIUS * size, BODY_HEIGHT * size, 16),
      new THREE.MeshStandardMaterial({
        color: COLORS.body,
        emissive: COLORS.body,
        emissiveIntensity: 0.25,
        roughness: 0.5,
        metalness: 0.4,
      }),
    );
    body.position.set(0, 1.1 * size, 0);
    body.userData.hittable = true;
    group.add(body);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(BASE_RADIUS * size, BASE_RADIUS * 1.2 * size, BASE_HEIGHT, 12),
      new THREE.MeshStandardMaterial({ color: COLORS.base, roughness: 0.8 }),
    );
    base.position.set(0, 0.04, 0);
    base.userData.hittable = false;
    group.add(base);

    const light = new THREE.PointLight(COLORS.body, 0.8, 4);
    light.position.set(0, 1.3, 0);
    group.add(light);
    return group;
  }

  private createHealthBar(): void {
    this.disposeHealthBar();
    const geo = new THREE.PlaneGeometry(0.6, 0.06);
    const mat = new THREE.MeshBasicMaterial({ color: COLORS.healthFull, side: THREE.DoubleSide });
    this.healthBar = new THREE.Mesh(geo, mat);
    this.healthBar.position.set(0, 2.0, 0);
    this.scene.add(this.healthBar);
  }

  private disposeHealthBar(): void {
    if (!this.healthBar) return;
    this.scene.remove(this.healthBar);
    this.healthBar.geometry.dispose();
    (this.healthBar.material as THREE.Material).dispose();
    this.healthBar = null;
  }

  private updateMuzzleFlash(): void {
    if (!this.muzzleFlash) return;
    if (this.isFiring && this.targetState === 'active') {
      this.muzzleFlash.intensity = MUZZLE_FLASH_MAX * (0.7 + Math.random() * 0.3);
    } else {
      this.muzzleFlash.intensity = Math.max(0, this.muzzleFlash.intensity - 0.5);
    }
  }

  private playKillSound(): void {
    this.playSound(800, 0.2, 0.3, 'sine');
  }

  private playFailSound(): void {
    this.playSound(200, 0.3, 0.2, 'sawtooth');
  }

  private playSound(freq: number, duration: number, volume: number, type: OscillatorType): void {
    if (!this.audioCtx) return;
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start();
    osc.stop(this.audioCtx.currentTime + duration);
  }

  private clearCurrentTarget(): void {
    this.disposeHealthBar();
    if (!this.currentTarget) return;
    this.scene.remove(this.currentTarget);
    this.currentTarget.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        const mat = child.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else {
          mat?.dispose();
        }
      }
    });
    this.currentTarget = null;
  }

  private gameOver(): void {
    this.gameActive = false;
    this.clearCurrentTarget();
    this.targetState = 'none';
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
    this.callbacks.onGameOver?.(this.killResults, this.fails);
  }

  override dispose(): void {
    this.gameActive = false;
    this.clearCurrentTarget();
    document.removeEventListener('mousemove', this.handleMouseMove);
    this.renderer.domElement.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mouseup', this.handleMouseUp);
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
    super.dispose();
  }
}
