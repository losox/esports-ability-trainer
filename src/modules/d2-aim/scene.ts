import * as THREE from 'three';
import { SceneBase } from '../shared/scene-base';
import {
  MAX_MISSES,
  getDifficultyLevel,
  getTargetDistance,
  getExistenceTime,
  getTargetAngleRange,
  determineHitZone,
  type HitResult,
  type HitZone,
} from './logic';

type TargetState = 'none' | 'active' | 'dissolving';

interface AimingSceneCallbacks {
  onHit?: (hit: HitResult) => void;
  onMiss?: (missCount: number) => void;
  onTargetSpawn?: (index: number, distance: number, existenceMs: number) => void;
  onPointerLockChange?: (locked: boolean) => void;
  onGameOver?: (hits: HitResult[], misses: number) => void;
  onDifficultyChange?: (level: number) => void;
}

interface HitEffectData {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  startTime: number;
  duration: number;
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
};

const HEAD_RADIUS = 0.15;
const BODY_RADIUS = 0.25;
const BODY_HEIGHT = 0.7;
const BASE_RADIUS = 0.35;
const BASE_HEIGHT = 0.08;
const DISSOLVE_DURATION_MS = 300;
const SPAWN_DELAY_MS = 200;
const MUZZLE_FLASH_DURATION_MS = 60;
const HIT_EFFECT_DURATION_MS = 300;

export class AimingScene extends SceneBase {
  private callbacks: AimingSceneCallbacks;
  private currentTarget: THREE.Group | null = null;
  private targetState: TargetState = 'none';
  private targetSpawnTime = 0;
  private dissolveStartTime = 0;
  private nextSpawnTime = 0;
  private targetIndex = 0;
  private hits: HitResult[] = [];
  private misses = 0;
  private gameActive = false;
  private isPointerLocked = false;
  private pauseStartTime = 0;
  private yaw = 0;
  private pitch = 0;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(0, 0);
  private muzzleFlash: THREE.PointLight | null = null;
  private muzzleFlashTimer = 0;
  private hitEffects: HitEffectData[] = [];
  private audioCtx: AudioContext | null = null;

  constructor(container: HTMLElement, callbacks: AimingSceneCallbacks = {}) {
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
    const backWallGeo = new THREE.BoxGeometry(24, 6, 0.3);
    const backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, 3, -25);
    this.scene.add(backWall);

    const sideGeo = new THREE.BoxGeometry(0.3, 6, 30);
    const leftWall = new THREE.Mesh(sideGeo, wallMat);
    leftWall.position.set(-12, 3, -10);
    this.scene.add(leftWall);

    const rightWall = new THREE.Mesh(sideGeo, wallMat);
    rightWall.position.set(12, 3, -10);
    this.scene.add(rightWall);

    const ceilGeo = new THREE.BoxGeometry(24, 0.3, 30);
    const ceilMat = new THREE.MeshStandardMaterial({ color: COLORS.ceiling, roughness: 0.9 });
    const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
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
      const geo = new THREE.BoxGeometry(20, 0.1, 0.4);
      const strip = new THREE.Mesh(geo, stripMat);
      strip.position.set(0, 5.8, -5 - i * 5);
      this.scene.add(strip);

      const light = new THREE.PointLight(COLORS.lightStrip, 0.5, 15);
      light.position.set(0, 5.5, -5 - i * 5);
      this.scene.add(light);
    }
  }

  private createDistanceMarkers(): void {
    const markerMat = new THREE.MeshStandardMaterial({ color: COLORS.marker, roughness: 0.7 });
    const distances = [5, 10, 15, 20];
    for (const d of distances) {
      const geo = new THREE.BoxGeometry(24, 0.05, 0.3);
      const marker = new THREE.Mesh(geo, markerMat);
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
    const barGeo = new THREE.CylinderGeometry(0.05, 0.05, 3, 8);

    const positions: [number, number][] = [
      [-1.5, -0.5],
      [1.5, -0.5],
    ];
    for (const [px, pz] of positions) {
      const post = new THREE.Mesh(postGeo, railingMat);
      post.position.set(px, 0.6, pz);
      this.scene.add(post);
    }
    const bar = new THREE.Mesh(barGeo, railingMat);
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
    this.renderer.domElement.addEventListener('click', this.handleShoot);
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

  private handlePointerLockChange(locked: boolean): void {
    this.isPointerLocked = locked;
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
    this.targetIndex = 0;
    this.hits = [];
    this.misses = 0;
    this.targetState = 'none';
    this.nextSpawnTime = performance.now();
  }

  private handleShoot = (): void => {
    if (!this.isPointerLocked || !this.gameActive) return;
    if (this.targetState !== 'active' || !this.currentTarget) return;
    this.fireMuzzleFlash();
    this.playShotSound();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(this.currentTarget.children, true);
    if (intersects.length === 0) {
      this.handleShootMiss();
      return;
    }
    this.processHit(intersects[0]);
  };

  private handleShootMiss(): void {
    this.misses++;
    this.callbacks.onMiss?.(this.misses);
    if (this.misses >= MAX_MISSES) {
      this.gameOver();
    }
  }

  private processHit(intersection: THREE.Intersection): void {
    const obj = intersection.object;
    const zone = obj.userData.zone as string;
    let distFromCenter = 0;
    if (zone === 'body') {
      const localPoint = obj.worldToLocal(intersection.point.clone());
      distFromCenter = Math.sqrt(localPoint.x ** 2 + localPoint.z ** 2);
    }
    const hitZone: HitZone = determineHitZone(zone, distFromCenter, BODY_RADIUS);
    const aimTime = performance.now() - this.targetSpawnTime;
    const level = getDifficultyLevel(this.targetIndex);
    const distance = getTargetDistance(level);
    const hitResult: HitResult = {
      zone: hitZone,
      distance,
      aimTimeMs: aimTime,
      targetIndex: this.targetIndex,
    };
    this.hits.push(hitResult);
    this.callbacks.onHit?.(hitResult);
    this.createHitEffect(intersection.point, hitZone);
    this.playHitSound(hitZone);
    this.startDissolve();
  }

  private startDissolve(): void {
    this.targetState = 'dissolving';
    this.dissolveStartTime = performance.now();
    this.currentTarget?.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        mat.transparent = true;
      }
    });
  }

  private createHitEffect(position: THREE.Vector3, zone: HitZone): void {
    const color = zone === 'head' ? 0xffd700 : zone === 'body' ? 0xff4500 : 0x7a7a82;
    const geo = new THREE.RingGeometry(0.05, 0.08, 16);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.lookAt(this.camera.position);
    this.scene.add(mesh);
    this.hitEffects.push({
      mesh,
      material: mat,
      startTime: performance.now(),
      duration: HIT_EFFECT_DURATION_MS,
    });
  }

  private fireMuzzleFlash(): void {
    if (!this.muzzleFlash) return;
    this.muzzleFlash.intensity = 5;
    this.muzzleFlashTimer = performance.now();
  }

  private playShotSound(): void {
    this.playSound(120, 0.08, 0.25, 'square');
  }

  private playHitSound(zone: HitZone): void {
    if (zone === 'head') {
      this.playSound(1200, 0.12, 0.3, 'sine');
    } else if (zone === 'body') {
      this.playSound(500, 0.1, 0.2, 'sine');
    } else {
      this.playSound(300, 0.08, 0.15, 'triangle');
    }
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

  protected onUpdate(): void {
    if (!this.gameActive) return;
    this.updateMuzzleFlash();
    this.updateHitEffects();
    if (!this.isPointerLocked) return;
    if (this.targetState === 'active' && this.currentTarget) {
      this.checkTargetTimeout();
    }
    if (this.targetState === 'dissolving') {
      this.updateDissolve();
    }
    if (this.targetState === 'none' && performance.now() >= this.nextSpawnTime) {
      this.spawnTarget();
    }
  }

  private checkTargetTimeout(): void {
    const level = getDifficultyLevel(this.targetIndex);
    const existenceMs = getExistenceTime(level);
    const elapsed = performance.now() - this.targetSpawnTime;
    if (elapsed >= existenceMs) {
      this.handleTargetTimeout();
    }
  }

  private handleTargetTimeout(): void {
    this.misses++;
    this.callbacks.onMiss?.(this.misses);
    this.clearCurrentTarget();
    if (this.misses >= MAX_MISSES) {
      this.gameOver();
      return;
    }
    this.targetState = 'none';
    this.nextSpawnTime = performance.now() + SPAWN_DELAY_MS;
  }

  private updateDissolve(): void {
    if (!this.currentTarget) return;
    const elapsed = performance.now() - this.dissolveStartTime;
    const progress = Math.min(elapsed / DISSOLVE_DURATION_MS, 1);
    const scale = 1 + progress * 0.5;
    this.currentTarget.scale.setScalar(scale);
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

  private updateMuzzleFlash(): void {
    if (!this.muzzleFlash || this.muzzleFlashTimer === 0) return;
    const elapsed = performance.now() - this.muzzleFlashTimer;
    if (elapsed >= MUZZLE_FLASH_DURATION_MS) {
      this.muzzleFlash.intensity = 0;
      this.muzzleFlashTimer = 0;
    } else {
      const progress = elapsed / MUZZLE_FLASH_DURATION_MS;
      this.muzzleFlash.intensity = 5 * (1 - progress);
    }
  }

  private updateHitEffects(): void {
    const now = performance.now();
    const remaining: HitEffectData[] = [];
    for (const effect of this.hitEffects) {
      const elapsed = now - effect.startTime;
      if (elapsed >= effect.duration) {
        this.scene.remove(effect.mesh);
        effect.mesh.geometry.dispose();
        effect.material.dispose();
      } else {
        const progress = elapsed / effect.duration;
        const scale = 1 + progress * 4;
        effect.mesh.scale.setScalar(scale);
        effect.material.opacity = 1 - progress;
        remaining.push(effect);
      }
    }
    this.hitEffects = remaining;
  }

  private spawnTarget(): void {
    this.clearCurrentTarget();
    const level = getDifficultyLevel(this.targetIndex);
    const distance = getTargetDistance(level);
    const angleRangeDeg = getTargetAngleRange(level);
    const existenceMs = getExistenceTime(level);
    const angleRangeRad = (angleRangeDeg * Math.PI) / 180;
    const angle = (Math.random() - 0.5) * 2 * angleRangeRad;
    const x = Math.sin(angle) * distance;
    const z = -Math.cos(angle) * distance;
    this.currentTarget = this.createHumanoidTarget();
    this.currentTarget.position.set(x, 0, z);
    this.scene.add(this.currentTarget);
    this.targetSpawnTime = performance.now();
    this.targetState = 'active';
    this.callbacks.onTargetSpawn?.(this.targetIndex, distance, existenceMs);
    this.callbacks.onDifficultyChange?.(level);
  }

  private createHumanoidTarget(): THREE.Group {
    const group = new THREE.Group();

    const headGeo = new THREE.SphereGeometry(HEAD_RADIUS, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({
      color: COLORS.head,
      emissive: COLORS.head,
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.7,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 1.65, 0);
    head.userData.zone = 'head';
    group.add(head);

    const bodyGeo = new THREE.CylinderGeometry(BODY_RADIUS, BODY_RADIUS, BODY_HEIGHT, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: COLORS.body,
      emissive: COLORS.body,
      emissiveIntensity: 0.25,
      roughness: 0.5,
      metalness: 0.4,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 1.1, 0);
    body.userData.zone = 'body';
    group.add(body);

    const baseGeo = new THREE.CylinderGeometry(BASE_RADIUS, BASE_RADIUS * 1.2, BASE_HEIGHT, 12);
    const baseMat = new THREE.MeshStandardMaterial({ color: COLORS.base, roughness: 0.8 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(0, 0.04, 0);
    base.userData.zone = 'miss';
    group.add(base);

    const light = new THREE.PointLight(COLORS.body, 0.8, 4);
    light.position.set(0, 1.3, 0);
    group.add(light);

    return group;
  }

  private clearCurrentTarget(): void {
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
    this.callbacks.onGameOver?.(this.hits, this.misses);
  }

  override dispose(): void {
    this.gameActive = false;
    this.clearCurrentTarget();
    for (const effect of this.hitEffects) {
      this.scene.remove(effect.mesh);
      effect.mesh.geometry.dispose();
      effect.material.dispose();
    }
    this.hitEffects = [];
    document.removeEventListener('mousemove', this.handleMouseMove);
    this.renderer.domElement.removeEventListener('click', this.handleShoot);
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
    super.dispose();
  }
}
