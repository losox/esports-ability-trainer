import * as THREE from 'three';
import { SceneBase } from '../shared/scene-base';
import {
  getDifficultyParams,
  getDifficultyLevel,
  generateMoveAngle,
  generateCurveAngularSpeed,
  type TrackingDifficultyParams,
} from './logic';

/** 追踪目标数据 */
interface TrackingTarget {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  moveAngle: number;
  angularSpeed: number;
  spawnTime: number;
  survivalTime: number;
  speed: number;
  active: boolean;
  hit: boolean;
  pattern: 'straight' | 'curve' | 'random';
  randomTimer: number;
  randomAngle: number;
}

/** 多目标追踪场景回调 */
export interface MultiTrackSceneCallbacks {
  onScore?: (score: number) => void;
  onEliminate?: (switchTime: number) => void;
  onEscape?: (escapes: number) => void;
  onDifficultyChange?: (level: number) => void;
  onGameOver?: (finalScore: number) => void;
  onNoEscapeWave?: (waves: number) => void;
  onActiveTargets?: (count: number) => void;
}

const COLORS = {
  ground: 0x1a1a1e,
  wall: 0x2a2a2e,
  target: 0x8b0000,
  targetGlow: 0xff4500,
  targetHit: 0xffd700,
  particle: 0xff8844,
  base: 0x3a3a3e,
  crystal: 0x4488ff,
};

const TARGET_RADIUS = 0.4;
const BOUNDARY_RADIUS = 6.0;

/**
 * 多目标追踪训练场景
 * 等距俯视MOBA地图风格
 */
export class MultiTrackScene extends SceneBase {
  private targets: Map<number, TrackingTarget> = new Map();
  private nextTargetId = 0;
  private callbacks: MultiTrackSceneCallbacks;
  private score = 0;
  private escapes = 0;
  private eliminated = 0;
  private noEscapeWaves = 0;
  private currentWaveEscapes = 0;
  private lastEliminateTime = 0;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private currentDifficulty: TrackingDifficultyParams;
  private switchTimes: number[] = [];
  private isGameOver = false;
  private spawnTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(container: HTMLElement, callbacks: MultiTrackSceneCallbacks = {}) {
    super({ container, cameraType: 'isometric' });
    this.callbacks = callbacks;
    this.currentDifficulty = getDifficultyParams(1);
  }

  protected onInit(): void {
    this.createEnvironment();
    this.setupClickHandler();
    this.spawnInitialWave();
    this.callbacks.onDifficultyChange?.(1);
  }

  private createEnvironment(): void {
    const groundGeo = new THREE.CircleGeometry(15, 64);
    const groundMat = new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    const boundaryGeo = new THREE.RingGeometry(BOUNDARY_RADIUS - 0.1, BOUNDARY_RADIUS, 64);
    const boundaryMat = new THREE.MeshBasicMaterial({
      color: COLORS.base,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    const boundary = new THREE.Mesh(boundaryGeo, boundaryMat);
    boundary.rotation.x = -Math.PI / 2;
    boundary.position.y = 0.02;
    this.scene.add(boundary);

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const pillarGeo = new THREE.CylinderGeometry(0.25, 0.3, 2.5, 8);
      const pillarMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.8 });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(
        Math.cos(angle) * (BOUNDARY_RADIUS + 2),
        1.25,
        Math.sin(angle) * (BOUNDARY_RADIUS + 2),
      );
      this.scene.add(pillar);
    }

    this.createParticles();
  }

  private createParticles(): void {
    const particleGeo = new THREE.BufferGeometry();
    const particleCount = 60;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 24;
      positions[i + 1] = Math.random() * 5;
      positions[i + 2] = (Math.random() - 0.5) * 24;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: COLORS.particle,
      size: 0.08,
      transparent: true,
      opacity: 0.5,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    this.scene.add(particles);
  }

  private setupClickHandler(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousedown', this.handleClick);
  }

  private handleClick = (event: MouseEvent): void => {
    if (this.isGameOver) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    for (const [id, target] of this.targets) {
      if (!target.active || target.hit) continue;
      const intersects = this.raycaster.intersectObject(target.mesh);
      if (intersects.length > 0) {
        this.onTargetEliminated(id, target);
        return;
      }
    }
  };

  private onTargetEliminated(id: number, target: TrackingTarget): void {
    const now = performance.now();
    const switchTime = this.lastEliminateTime > 0 ? now - this.lastEliminateTime : 0;
    this.lastEliminateTime = now;

    target.hit = true;
    target.active = false;
    this.eliminated++;
    this.score += 15;

    if (switchTime > 0) {
      this.switchTimes.push(switchTime);
    }

    this.callbacks.onEliminate?.(switchTime);
    this.callbacks.onScore?.(this.score);

    this.dissolveTarget(id);

    if (this.currentWaveEscapes === 0 && this.eliminated > 0 && this.eliminated % 5 === 0) {
      this.noEscapeWaves++;
      this.callbacks.onNoEscapeWave?.(this.noEscapeWaves);
    }

    this.updateDifficulty();
    this.ensureTargets();
  }

  private dissolveTarget(id: number): void {
    const target = this.targets.get(id);
    if (!target) return;

    const startTime = performance.now();
    const dissolve = (): void => {
      if (!this.isRunning || this.disposed) return;
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / 300, 1);
      target.mesh.scale.setScalar(1 + progress * 0.3);
      target.material.opacity = 1 - progress;
      target.material.transparent = true;

      if (progress >= 1) {
        this.scene.remove(target.mesh);
        target.mesh.geometry.dispose();
        target.material.dispose();
        this.targets.delete(id);
        return;
      }
      requestAnimationFrame(dissolve);
    };
    dissolve();
  }

  private updateDifficulty(): void {
    const level = getDifficultyLevel(this.eliminated);
    const newParams = getDifficultyParams(level);
    if (newParams.simultaneousTargets !== this.currentDifficulty.simultaneousTargets) {
      this.currentDifficulty = newParams;
      this.callbacks.onDifficultyChange?.(level);
    } else {
      this.currentDifficulty = newParams;
    }
  }

  private spawnInitialWave(): void {
    const count = this.currentDifficulty.simultaneousTargets;
    for (let i = 0; i < count; i++) {
      this.spawnTarget();
    }
    this.callbacks.onActiveTargets?.(this.countActiveTargets());
  }

  private ensureTargets(): void {
    const activeCount = this.countActiveTargets();
    const needed = this.currentDifficulty.simultaneousTargets - activeCount;
    for (let i = 0; i < needed; i++) {
      this.spawnTarget();
    }
    if (needed > 0) {
      this.callbacks.onActiveTargets?.(this.countActiveTargets());
    }
  }

  private spawnTarget(): void {
    if (this.countActiveTargets() >= this.currentDifficulty.simultaneousTargets) return;

    const geo = new THREE.SphereGeometry(TARGET_RADIUS, 16, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.target,
      emissive: COLORS.targetGlow,
      emissiveIntensity: 0.5,
      roughness: 0.4,
      metalness: 0.3,
    });
    const mesh = new THREE.Mesh(geo, mat);

    const angle = generateMoveAngle();
    const spawnRadius = 2 + Math.random() * (BOUNDARY_RADIUS - 3);
    const x = Math.cos(angle) * spawnRadius;
    const z = Math.sin(angle) * spawnRadius;
    mesh.position.set(x, TARGET_RADIUS, z);
    this.scene.add(mesh);

    const moveAngle = generateMoveAngle();
    const angularSpeed = generateCurveAngularSpeed();

    const id = this.nextTargetId++;
    this.targets.set(id, {
      mesh,
      material: mat,
      moveAngle,
      angularSpeed,
      spawnTime: performance.now(),
      survivalTime: this.currentDifficulty.survivalTime * 1000,
      speed: this.currentDifficulty.moveSpeed,
      active: true,
      hit: false,
      pattern: this.currentDifficulty.movePattern,
      randomTimer: 0,
      randomAngle: moveAngle,
    });
  }

  private countActiveTargets(): number {
    let count = 0;
    for (const target of this.targets.values()) {
      if (target.active && !target.hit) count++;
    }
    return count;
  }

  protected onUpdate(delta: number): void {
    const now = performance.now();
    const escapedIds: number[] = [];

    for (const [id, target] of this.targets) {
      if (!target.active || target.hit) continue;

      this.moveTarget(target, delta);

      const elapsed = now - target.spawnTime;
      const remaining = target.survivalTime - elapsed;
      const ratio = Math.max(0, remaining / target.survivalTime);
      const pulse = 0.4 + Math.sin(now * 0.01 + id) * 0.15;
      target.material.emissiveIntensity = pulse * (0.5 + ratio * 0.5);

      const dist = Math.sqrt(target.mesh.position.x ** 2 + target.mesh.position.z ** 2);
      if (dist > BOUNDARY_RADIUS) {
        target.moveAngle = Math.atan2(-target.mesh.position.z, -target.mesh.position.x);
      }

      if (remaining <= 0) {
        escapedIds.push(id);
      }
    }

    for (const id of escapedIds) {
      this.onTargetEscaped(id);
    }
  }

  private moveTarget(target: TrackingTarget, delta: number): void {
    const dt = delta;
    const pos = target.mesh.position;

    if (target.pattern === 'straight') {
      pos.x += Math.cos(target.moveAngle) * target.speed * dt;
      pos.z += Math.sin(target.moveAngle) * target.speed * dt;
    } else if (target.pattern === 'curve') {
      target.moveAngle += target.angularSpeed * dt;
      pos.x += Math.cos(target.moveAngle) * target.speed * dt;
      pos.z += Math.sin(target.moveAngle) * target.speed * dt;
    } else {
      target.randomTimer += dt;
      if (target.randomTimer > 1.0) {
        target.randomTimer = 0;
        target.randomAngle = generateMoveAngle();
      }
      const blend = target.angularSpeed * 0.5;
      target.moveAngle = this.lerpAngle(target.moveAngle, target.randomAngle, blend * dt);
      pos.x += Math.cos(target.moveAngle) * target.speed * dt;
      pos.z += Math.sin(target.moveAngle) * target.speed * dt;
    }

    pos.y = TARGET_RADIUS + Math.sin(performance.now() * 0.005 + target.spawnTime * 0.001) * 0.08;
  }

  private lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  private onTargetEscaped(id: number): void {
    const target = this.targets.get(id);
    if (!target) return;

    target.active = false;
    target.hit = false;
    this.escapes++;
    this.currentWaveEscapes++;

    this.callbacks.onEscape?.(this.escapes);
    this.dissolveTarget(id);

    this.ensureTargets();

    if (this.escapes >= 3) {
      this.endGame();
    }
  }

  private endGame(): void {
    this.isGameOver = true;
    if (this.spawnTimer) clearTimeout(this.spawnTimer);
    this.callbacks.onGameOver?.(this.score);
  }

  override dispose(): void {
    this.isGameOver = true;
    if (this.spawnTimer) clearTimeout(this.spawnTimer);

    for (const [id, target] of this.targets) {
      this.scene.remove(target.mesh);
      target.mesh.geometry.dispose();
      target.material.dispose();
      this.targets.delete(id);
    }

    this.renderer.domElement.removeEventListener('click', this.handleClick);
    super.dispose();
  }
}
