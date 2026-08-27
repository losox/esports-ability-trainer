import * as THREE from 'three';
import { SceneBase } from '../shared/scene-base';
import {
  getDifficultyParams,
  getDifficultyLevel,
  generateEdgeAngle,
  generateSpawnAngle,
  type DifficultyParams,
} from './logic';

/** 目标类型 */
type TargetKind = 'center' | 'edge';

/** FPS目标数据 */
interface FPSTarget {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  kind: TargetKind;
  spawnTime: number;
  lifetime: number;
  active: boolean;
}

/** MOBA怪物数据 */
interface MobAMonster {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  spawnAngle: number;
  spawnTime: number;
  lifetime: number;
  speed: number;
  active: boolean;
  hit: boolean;
}

/** 外围视觉场景回调 */
export interface PeripheralSceneCallbacks {
  onScore?: (score: number) => void;
  onMiss?: (misses: number) => void;
  onHit?: (kind: TargetKind, reactionTime: number) => void;
  onDifficultyChange?: (level: number) => void;
  onGameOver?: (finalScore: number) => void;
  onTowerHP?: (hp: number) => void;
  onMaxSimultaneous?: (count: number) => void;
  onEdgeAppear?: (total: number) => void;
}

const COLORS = {
  centerTarget: 0xff4500,
  edgeTarget: 0xffd700,
  ground: 0x1a1a1e,
  wall: 0x2a2a2e,
  targetExpired: 0x550000,
  mobaMonster: 0x8b0000,
  mobaMonsterHit: 0xff4500,
  tower: 0x4a4a52,
  towerGlow: 0xff4500,
  particle: 0xff8844,
  base: 0x3a3a3e,
  pedestal: 0x3a3a3e,
  tree: 0x2a4a2a,
};

const TARGET_RADIUS = 0.35;
const MONSTER_RADIUS = 0.4;
const TOWER_HEIGHT = 2.0;
const TOWER_RADIUS = 0.8;

/**
 * FPS版本外围视觉训练场景
 * 第一人称射击靶场，中央目标+边缘目标
 */
export class PeripheralSceneFPS extends SceneBase {
  private targets: Map<number, FPSTarget> = new Map();
  private nextTargetId = 0;
  private callbacks: PeripheralSceneCallbacks;
  private score = 0;
  private misses = 0;
  private eliminated = 0;
  private centerSpawnTimer: ReturnType<typeof setTimeout> | null = null;
  private edgeSpawnTimer: ReturnType<typeof setTimeout> | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private currentDifficulty: DifficultyParams;
  private edgeAppearances = 0;
  private maxSimultaneous = 0;
  private edgeReactionTimes: number[] = [];
  private isGameOver = false;
  private locked = false;

  constructor(container: HTMLElement, callbacks: PeripheralSceneCallbacks = {}) {
    super({
      container,
      cameraType: 'first-person',
      onPointerLockChange: (locked) => {
        this.locked = locked;
      },
    });
    this.callbacks = callbacks;
    this.currentDifficulty = getDifficultyParams(1);
  }

  protected onInit(): void {
    this.createEnvironment();
    this.setupClickHandler();
    this.scheduleCenterTarget();
    this.scheduleEdgeTarget();
    this.callbacks.onDifficultyChange?.(1);
  }

  private createEnvironment(): void {
    const groundGeo = new THREE.PlaneGeometry(40, 40);
    const groundMat = new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const wallGeo = new THREE.BoxGeometry(2, 4, 0.3);
      const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.8 });
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.set(Math.cos(angle) * 18, 2, Math.sin(angle) * 18);
      wall.lookAt(0, 2, 0);
      this.scene.add(wall);
    }

    this.createParticles();
  }

  private createParticles(): void {
    const particleGeo = new THREE.BufferGeometry();
    const particleCount = 80;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 30;
      positions[i + 1] = Math.random() * 6 + 0.5;
      positions[i + 2] = (Math.random() - 0.5) * 30;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: COLORS.particle,
      size: 0.06,
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
    if (this.isGameOver || !this.locked) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    let hitSomething = false;
    for (const [id, target] of this.targets) {
      if (!target.active) continue;
      const intersects = this.raycaster.intersectObject(target.mesh);
      if (intersects.length > 0) {
        this.onTargetHit(id, target);
        hitSomething = true;
        break;
      }
    }

    if (!hitSomething) {
      this.onMiss();
    }
  };

  private onTargetHit(id: number, target: FPSTarget): void {
    const reactionTime = performance.now() - target.spawnTime;
    target.active = false;
    this.eliminated++;

    if (target.kind === 'center') {
      this.score += 10;
    } else {
      this.score += 30;
      this.edgeReactionTimes.push(reactionTime);
    }

    this.callbacks.onHit?.(target.kind, reactionTime);
    this.callbacks.onScore?.(this.score);

    this.dissolveTarget(id);
    this.updateDifficulty();
  }

  private dissolveTarget(id: number): void {
    const target = this.targets.get(id);
    if (!target) return;

    const startTime = performance.now();
    const dissolve = (): void => {
      if (!this.isRunning || this.disposed) return;
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / 300, 1);
      target.mesh.scale.setScalar(1 + progress * 0.5);
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

  private onMiss(): void {
    this.misses++;
    this.callbacks.onMiss?.(this.misses);

    if (this.misses >= 3) {
      this.endGame();
    }
  }

  private updateDifficulty(): void {
    const level = getDifficultyLevel(this.eliminated);
    const newParams = getDifficultyParams(level);
    if (newParams.centerInterval !== this.currentDifficulty.centerInterval) {
      this.currentDifficulty = newParams;
      this.callbacks.onDifficultyChange?.(level);
    }
  }

  private scheduleCenterTarget(): void {
    if (this.isGameOver || this.disposed) return;
    this.centerSpawnTimer = setTimeout(() => {
      if (this.isGameOver || this.disposed) return;
      this.spawnCenterTarget();
      this.scheduleCenterTarget();
    }, this.currentDifficulty.centerInterval);
  }

  private scheduleEdgeTarget(): void {
    if (this.isGameOver || this.disposed) return;
    this.edgeSpawnTimer = setTimeout(() => {
      if (this.isGameOver || this.disposed) return;
      this.spawnEdgeTarget();
      this.scheduleEdgeTarget();
    }, this.currentDifficulty.edgeInterval);
  }

  private spawnCenterTarget(): void {
    if (this.countActiveTargets() >= this.currentDifficulty.maxSimultaneous) return;

    const geo = new THREE.SphereGeometry(TARGET_RADIUS, 16, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.centerTarget,
      emissive: COLORS.centerTarget,
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.5,
    });
    const mesh = new THREE.Mesh(geo, mat);

    const distance = 5 + Math.random() * 3;
    const angle = Math.random() * Math.PI;
    const x = Math.sin(angle) * distance * (Math.random() > 0.5 ? 1 : -1);
    const y = 1.2 + Math.random() * 0.8;
    const z = -Math.cos(angle) * distance;
    mesh.position.set(x, y, z);
    this.scene.add(mesh);

    const id = this.nextTargetId++;
    this.targets.set(id, {
      mesh,
      material: mat,
      kind: 'center',
      spawnTime: performance.now(),
      lifetime: this.currentDifficulty.centerInterval,
      active: true,
    });

    this.updateMaxSimultaneous();
  }

  private spawnEdgeTarget(): void {
    if (this.countActiveTargets() >= this.currentDifficulty.maxSimultaneous) return;

    const geo = new THREE.SphereGeometry(TARGET_RADIUS * 0.9, 16, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.edgeTarget,
      emissive: COLORS.edgeTarget,
      emissiveIntensity: 0.8,
      roughness: 0.3,
      metalness: 0.5,
    });
    const mesh = new THREE.Mesh(geo, mat);

    const edgeAngle = generateEdgeAngle();
    const distance = 7;
    const x = Math.cos(edgeAngle) * distance;
    const y = 1.0 + Math.random() * 1.2;
    const z = Math.sin(edgeAngle) * distance;
    mesh.position.set(x, y, z);
    this.scene.add(mesh);

    const id = this.nextTargetId++;
    this.targets.set(id, {
      mesh,
      material: mat,
      kind: 'edge',
      spawnTime: performance.now(),
      lifetime: this.currentDifficulty.edgeLifetime,
      active: true,
    });

    this.edgeAppearances++;
    this.callbacks.onEdgeAppear?.(this.edgeAppearances);
    this.updateMaxSimultaneous();
  }

  private countActiveTargets(): number {
    let count = 0;
    for (const target of this.targets.values()) {
      if (target.active) count++;
    }
    return count;
  }

  private updateMaxSimultaneous(): void {
    const current = this.countActiveTargets();
    if (current > this.maxSimultaneous) {
      this.maxSimultaneous = current;
      this.callbacks.onMaxSimultaneous?.(this.maxSimultaneous);
    }
  }

  protected onUpdate(_delta: number): void {
    const now = performance.now();
    const expiredIds: number[] = [];

    for (const [id, target] of this.targets) {
      if (!target.active) continue;

      const elapsed = now - target.spawnTime;
      const remaining = target.lifetime - elapsed;
      const ratio = Math.max(0, remaining / target.lifetime);

      if (target.kind === 'edge') {
        const pulse = 0.6 + Math.sin(now * 0.015) * 0.2;
        target.material.emissiveIntensity = pulse * ratio;
      }

      if (remaining <= 0) {
        expiredIds.push(id);
      }
    }

    for (const id of expiredIds) {
      const target = this.targets.get(id);
      if (target) {
        target.active = false;
        if (target.kind === 'center') {
          this.onMiss();
        }
        this.dissolveTarget(id);
      }
    }
  }

  private endGame(): void {
    this.isGameOver = true;
    if (this.centerSpawnTimer) clearTimeout(this.centerSpawnTimer);
    if (this.edgeSpawnTimer) clearTimeout(this.edgeSpawnTimer);
    this.callbacks.onGameOver?.(this.score);
  }

  override dispose(): void {
    this.isGameOver = true;
    if (this.centerSpawnTimer) clearTimeout(this.centerSpawnTimer);
    if (this.edgeSpawnTimer) clearTimeout(this.edgeSpawnTimer);

    for (const [id, target] of this.targets) {
      this.scene.remove(target.mesh);
      target.mesh.geometry.dispose();
      target.material.dispose();
      this.targets.delete(id);
    }

    this.renderer.domElement.removeEventListener('mousedown', this.handleClick);
    super.dispose();
  }
}

/**
 * MOBA版本外围视觉训练场景
 * 等距俯视塔防，怪物从各方向出现
 */
export class PeripheralSceneMOBA extends SceneBase {
  private monsters: Map<number, MobAMonster> = new Map();
  private nextMonsterId = 0;
  private callbacks: PeripheralSceneCallbacks;
  private score = 0;
  private misses = 0;
  private eliminated = 0;
  private towerHP = 3;
  private spawnTimer: ReturnType<typeof setTimeout> | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private currentDifficulty: DifficultyParams;
  private edgeAppearances = 0;
  private maxSimultaneous = 0;
  private edgeReactionTimes: number[] = [];
  private isGameOver = false;
  private tower!: THREE.Mesh;
  private towerMaterial!: THREE.MeshStandardMaterial;
  private towerGlow!: THREE.PointLight;

  constructor(container: HTMLElement, callbacks: PeripheralSceneCallbacks = {}) {
    super({ container, cameraType: 'isometric' });
    this.callbacks = callbacks;
    this.currentDifficulty = getDifficultyParams(1);
  }

  protected onInit(): void {
    this.createEnvironment();
    this.createTower();
    this.setupClickHandler();
    this.scheduleSpawn();
    this.callbacks.onDifficultyChange?.(1);
    this.callbacks.onTowerHP?.(this.towerHP);
  }

  private createEnvironment(): void {
    const groundGeo = new THREE.CircleGeometry(15, 64);
    const groundMat = new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    const ringGeo = new THREE.RingGeometry(6.5, 7, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: COLORS.base,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    this.scene.add(ring);

    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const pillarGeo = new THREE.CylinderGeometry(0.25, 0.3, 3, 8);
      const pillarMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.8 });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(Math.cos(angle) * 13, 1.5, Math.sin(angle) * 13);
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

  private createTower(): void {
    const geo = new THREE.CylinderGeometry(TOWER_RADIUS, TOWER_RADIUS * 1.2, TOWER_HEIGHT, 16);
    this.towerMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.tower,
      emissive: COLORS.towerGlow,
      emissiveIntensity: 0.3,
      roughness: 0.5,
      metalness: 0.6,
    });
    this.tower = new THREE.Mesh(geo, this.towerMaterial);
    this.tower.position.set(0, TOWER_HEIGHT / 2, 0);
    this.scene.add(this.tower);

    this.towerGlow = new THREE.PointLight(COLORS.towerGlow, 1.5, 10);
    this.towerGlow.position.set(0, TOWER_HEIGHT, 0);
    this.scene.add(this.towerGlow);

    const crystalGeo = new THREE.OctahedronGeometry(0.4, 0);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: COLORS.edgeTarget,
      emissive: COLORS.edgeTarget,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.8,
    });
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystal.position.set(0, TOWER_HEIGHT + 0.3, 0);
    this.scene.add(crystal);
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

    for (const [id, monster] of this.monsters) {
      if (!monster.active || monster.hit) continue;
      const intersects = this.raycaster.intersectObject(monster.mesh);
      if (intersects.length > 0) {
        this.onMonsterHit(id, monster);
        return;
      }
    }
  };

  private onMonsterHit(id: number, monster: MobAMonster): void {
    const reactionTime = performance.now() - monster.spawnTime;
    monster.hit = true;
    monster.active = false;
    this.eliminated++;
    this.score += 20;

    this.edgeReactionTimes.push(reactionTime);
    this.callbacks.onHit?.('edge', reactionTime);
    this.callbacks.onScore?.(this.score);

    this.dissolveMonster(id);
    this.updateDifficulty();
  }

  private dissolveMonster(id: number): void {
    const monster = this.monsters.get(id);
    if (!monster) return;

    const startTime = performance.now();
    const dissolve = (): void => {
      if (!this.isRunning || this.disposed) return;
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / 300, 1);
      monster.mesh.scale.setScalar(1 + progress * 0.3);
      monster.material.opacity = 1 - progress;
      monster.material.transparent = true;

      if (progress >= 1) {
        this.scene.remove(monster.mesh);
        monster.mesh.geometry.dispose();
        monster.material.dispose();
        this.monsters.delete(id);
        return;
      }
      requestAnimationFrame(dissolve);
    };
    dissolve();
  }

  private updateDifficulty(): void {
    const level = getDifficultyLevel(this.eliminated);
    const newParams = getDifficultyParams(level);
    if (newParams.edgeInterval !== this.currentDifficulty.edgeInterval) {
      this.currentDifficulty = newParams;
      this.callbacks.onDifficultyChange?.(level);
    }
  }

  private scheduleSpawn(): void {
    if (this.isGameOver || this.disposed) return;
    this.spawnTimer = setTimeout(() => {
      if (this.isGameOver || this.disposed) return;
      this.spawnMonster();
      this.scheduleSpawn();
    }, this.currentDifficulty.centerInterval);
  }

  private spawnMonster(): void {
    if (this.countActiveMonsters() >= this.currentDifficulty.maxSimultaneous) return;

    const geo = new THREE.SphereGeometry(MONSTER_RADIUS, 16, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.mobaMonster,
      emissive: COLORS.mobaMonster,
      emissiveIntensity: 0.5,
      roughness: 0.4,
      metalness: 0.3,
    });
    const mesh = new THREE.Mesh(geo, mat);

    const angle = generateSpawnAngle();
    const isCenter = Math.random() < 0.3;

    let startX: number;
    let startZ: number;
    let speed: number;

    if (isCenter) {
      startX = (Math.random() - 0.5) * 2;
      startZ = (Math.random() - 0.5) * 2;
      speed = 1.5 + Math.random() * 0.5;
    } else {
      const spawnRadius = 7;
      startX = Math.cos(angle) * spawnRadius;
      startZ = Math.sin(angle) * spawnRadius;
      speed = 1.0 + Math.random() * 0.5;
    }

    mesh.position.set(startX, MONSTER_RADIUS, startZ);
    this.scene.add(mesh);

    const id = this.nextMonsterId++;
    this.monsters.set(id, {
      mesh,
      material: mat,
      spawnAngle: angle,
      spawnTime: performance.now(),
      lifetime: this.currentDifficulty.edgeLifetime,
      speed,
      active: true,
      hit: false,
    });

    this.edgeAppearances++;
    this.callbacks.onEdgeAppear?.(this.edgeAppearances);
    this.updateMaxSimultaneous();
  }

  private countActiveMonsters(): number {
    let count = 0;
    for (const monster of this.monsters.values()) {
      if (monster.active && !monster.hit) count++;
    }
    return count;
  }

  private updateMaxSimultaneous(): void {
    const current = this.countActiveMonsters();
    if (current > this.maxSimultaneous) {
      this.maxSimultaneous = current;
      this.callbacks.onMaxSimultaneous?.(this.maxSimultaneous);
    }
  }

  protected onUpdate(_delta: number): void {
    const now = performance.now();
    const expiredIds: number[] = [];

    for (const [id, monster] of this.monsters) {
      if (!monster.active || monster.hit) continue;

      const direction = new THREE.Vector3(0, 0, 0).sub(monster.mesh.position).normalize();
      monster.mesh.position.add(direction.multiplyScalar(monster.speed * _delta));
      monster.mesh.position.y = MONSTER_RADIUS + Math.sin(now * 0.005 + id) * 0.1;

      const distToTower = monster.mesh.position.length();
      if (distToTower < TOWER_RADIUS + MONSTER_RADIUS) {
        this.onTowerHit(id);
        continue;
      }

      const elapsed = now - monster.spawnTime;
      if (elapsed > monster.lifetime) {
        expiredIds.push(id);
      }
    }

    for (const id of expiredIds) {
      const monster = this.monsters.get(id);
      if (monster) {
        monster.active = false;
        this.dissolveMonster(id);
      }
    }

    this.towerGlow.intensity = 1.2 + Math.sin(now * 0.003) * 0.3;
  }

  private onTowerHit(id: number): void {
    const monster = this.monsters.get(id);
    if (!monster) return;

    monster.active = false;
    monster.hit = true;
    this.towerHP--;
    this.misses++;
    this.towerMaterial.emissiveIntensity = 0.8;
    this.towerGlow.color.setHex(0xff0000);

    setTimeout(() => {
      if (this.disposed) return;
      this.towerMaterial.emissiveIntensity = 0.3;
      this.towerGlow.color.setHex(COLORS.towerGlow);
    }, 300);

    this.callbacks.onTowerHP?.(this.towerHP);
    this.callbacks.onMiss?.(this.misses);
    this.dissolveMonster(id);

    if (this.towerHP <= 0) {
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

    for (const [id, monster] of this.monsters) {
      this.scene.remove(monster.mesh);
      monster.mesh.geometry.dispose();
      monster.material.dispose();
      this.monsters.delete(id);
    }

    this.renderer.domElement.removeEventListener('mousedown', this.handleClick);
    super.dispose();
  }
}
