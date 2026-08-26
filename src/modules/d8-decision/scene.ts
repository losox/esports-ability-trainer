import * as THREE from 'three';
import { SceneBase } from '../shared/scene-base';
import {
  generateRound,
  PLAYER_MAX_HP,
  TARGET_SPECS,
  type GameVersion,
  type RoundConfig,
  type RoundResult,
  type TargetType,
} from './logic';

// === Types ===

interface TargetObject {
  group: THREE.Group;
  type: TargetType;
  hp: number;
  maxHp: number;
  attack: number;
  countdownMs: number;
  initialCountdownMs: number;
  alive: boolean;
  dissolving: boolean;
  dissolveStart: number;
  hitMeshes: THREE.Mesh[];
  bodyMaterial: THREE.MeshStandardMaterial;
  hpBar: THREE.Mesh;
  hpBarMaterial: THREE.MeshBasicMaterial;
  countdownSprite: THREE.Sprite;
  countdownTexture: THREE.CanvasTexture;
  lastDisplayedCountdown: number;
  basePosition: THREE.Vector3;
  movePhase: number;
}

interface DecisionSceneCallbacks {
  onHpChange?: (hp: number) => void;
  onRoundStart?: (round: number) => void;
  onRoundResult?: (result: RoundResult) => void;
  onGameOver?: (survivedRounds: number, results: RoundResult[]) => void;
  onTargetEliminated?: (type: TargetType, remaining: number) => void;
  onFirstDecision?: (timeMs: number) => void;
  onDamageTaken?: (damage: number, hp: number) => void;
  onPointerLockChange?: (locked: boolean) => void;
}

// === Constants ===

const TARGET_COLORS: Record<TargetType, number> = {
  normal: 0x888888,
  'high-attack': 0xff4500,
  tank: 0x4488ff,
};

const ENV_COLORS = {
  ground: 0x1a1a1e,
  rangeWall: 0x2a2a2e,
  towerBody: 0x4a4a4e,
  towerTop: 0xff4500,
  crystal: 0xffd700,
  particle: 0xff8844,
  lane: 0x333338,
};

const DISSOLVE_DURATION = 400;
const ROUND_TRANSITION_DELAY = 800;

// === Scene class ===

export class DecisionScene extends SceneBase {
  private version: GameVersion;
  private callbacks: DecisionSceneCallbacks;
  private pointerLocked = false;

  // Game state
  private currentRound = 0;
  private hp = PLAYER_MAX_HP;
  private targets: TargetObject[] = [];
  private roundStartTime = 0;
  private firstDecisionTime: number | null = null;
  private roundResults: RoundResult[] = [];
  private damageTakenThisRound = 0;
  private targetsEliminatedThisRound = 0;
  private totalTargetsThisRound = 0;
  private isRoundActive = false;
  private isGameOver = false;
  private nextRoundTimeout: ReturnType<typeof setTimeout> | null = null;
  private currentRoundConfig: RoundConfig | null = null;

  // Reusable objects
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private meshToTarget = new Map<THREE.Mesh, TargetObject>();

  // Environment references for dispose
  private environmentObjects: THREE.Object3D[] = [];

  constructor(
    container: HTMLElement,
    version: GameVersion,
    callbacks: DecisionSceneCallbacks = {},
  ) {
    super({
      container,
      cameraType: version === 'fps' ? 'first-person' : 'isometric',
      onPointerLockChange: (locked: boolean) => {
        this.pointerLocked = locked;
        this.callbacks.onPointerLockChange?.(locked);
      },
    });
    this.version = version;
    this.callbacks = callbacks;
  }

  // === Init ===

  protected onInit(): void {
    if (this.version === 'fps') {
      this.createFpsEnvironment();
    } else {
      this.createMobaEnvironment();
    }
    this.setupClickHandler();
    this.startNextRound();
  }

  // === Environment creation ===

  private createFpsEnvironment(): void {
    this.createGround();
    this.createRangeElements();
    this.createParticles();
  }

  private createMobaEnvironment(): void {
    this.createGround();
    this.createTower();
    this.createLanes();
    this.createParticles();
  }

  private createGround(): void {
    const geo = new THREE.CircleGeometry(25, 64);
    const mat = new THREE.MeshStandardMaterial({ color: ENV_COLORS.ground, roughness: 0.9 });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    this.environmentObjects.push(ground);
  }

  private createRangeElements(): void {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = 15;
      const geo = new THREE.BoxGeometry(0.5, 4, 0.5);
      const mat = new THREE.MeshStandardMaterial({ color: ENV_COLORS.rangeWall, roughness: 0.8 });
      const post = new THREE.Mesh(geo, mat);
      post.position.set(Math.cos(angle) * radius, 2, Math.sin(angle) * radius);
      this.scene.add(post);
      this.environmentObjects.push(post);
    }
  }

  private createTower(): void {
    const group = new THREE.Group();

    const baseGeo = new THREE.CylinderGeometry(1.5, 2, 1, 12);
    const baseMat = new THREE.MeshStandardMaterial({
      color: ENV_COLORS.rangeWall,
      roughness: 0.8,
      metalness: 0.3,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.5;
    group.add(base);

    const bodyGeo = new THREE.CylinderGeometry(1.2, 1.4, 3, 12);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: ENV_COLORS.towerBody,
      roughness: 0.7,
      metalness: 0.4,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 2.5;
    group.add(body);

    const topGeo = new THREE.ConeGeometry(1.5, 1.5, 12);
    const topMat = new THREE.MeshStandardMaterial({
      color: ENV_COLORS.towerTop,
      emissive: ENV_COLORS.towerTop,
      emissiveIntensity: 0.3,
      roughness: 0.5,
    });
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.y = 5;
    group.add(top);

    const crystalGeo = new THREE.OctahedronGeometry(0.4);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: ENV_COLORS.crystal,
      emissive: ENV_COLORS.crystal,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.8,
    });
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystal.position.y = 6;
    group.add(crystal);

    const light = new THREE.PointLight(ENV_COLORS.crystal, 2, 15);
    light.position.set(0, 5, 0);
    group.add(light);

    this.scene.add(group);
    this.environmentObjects.push(group);
  }

  private createLanes(): void {
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const geo = new THREE.PlaneGeometry(1.5, 12);
      const mat = new THREE.MeshStandardMaterial({
        color: ENV_COLORS.lane,
        transparent: true,
        opacity: 0.5,
        roughness: 0.9,
      });
      const lane = new THREE.Mesh(geo, mat);
      lane.rotation.x = -Math.PI / 2;
      lane.rotation.z = angle;
      lane.position.set(Math.cos(angle) * 6, 0.01, Math.sin(angle) * 6);
      this.scene.add(lane);
      this.environmentObjects.push(lane);
    }
  }

  private createParticles(): void {
    const particleCount = 80;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 30;
      positions[i + 1] = Math.random() * 8;
      positions[i + 2] = (Math.random() - 0.5) * 30;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: ENV_COLORS.particle,
      size: 0.08,
      transparent: true,
      opacity: 0.6,
    });
    const particles = new THREE.Points(geo, mat);
    this.scene.add(particles);
    this.environmentObjects.push(particles);
  }

  // === Target creation ===

  private createTarget(
    type: TargetType,
    position: THREE.Vector3,
    countdownMs: number,
    index: number,
  ): TargetObject {
    const spec = TARGET_SPECS[type];
    const color = TARGET_COLORS[type];

    const group = new THREE.Group();
    group.position.copy(position);

    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.3,
      roughness: 0.6,
      metalness: 0.2,
    });

    const hitMeshes: THREE.Mesh[] = [];
    this.buildHumanoidParts(group, material, hitMeshes);

    const hpBar = this.createHpBar();
    hpBar.position.set(0, 2.1, 0);
    group.add(hpBar);

    const { sprite, texture } = this.createCountdownLabel();
    sprite.position.set(0, 2.5, 0);
    group.add(sprite);

    this.scene.add(group);

    return {
      group,
      type,
      hp: spec.hp,
      maxHp: spec.hp,
      attack: spec.attack,
      countdownMs,
      initialCountdownMs: countdownMs,
      alive: true,
      dissolving: false,
      dissolveStart: 0,
      hitMeshes,
      bodyMaterial: material,
      hpBar,
      hpBarMaterial: hpBar.material as THREE.MeshBasicMaterial,
      countdownSprite: sprite,
      countdownTexture: texture,
      lastDisplayedCountdown: -1,
      basePosition: position.clone(),
      movePhase: index * 1.5,
    };
  }

  private buildHumanoidParts(
    group: THREE.Group,
    material: THREE.MeshStandardMaterial,
    hitMeshes: THREE.Mesh[],
  ): void {
    const headGeo = new THREE.SphereGeometry(0.22, 12, 12);
    const head = new THREE.Mesh(headGeo, material);
    head.position.y = 1.6;
    group.add(head);
    hitMeshes.push(head);

    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.25, 0.8, 8);
    const body = new THREE.Mesh(bodyGeo, material);
    body.position.y = 1.1;
    group.add(body);
    hitMeshes.push(body);

    const armGeo = new THREE.CylinderGeometry(0.08, 0.06, 0.7, 6);
    const leftArm = new THREE.Mesh(armGeo, material);
    leftArm.position.set(-0.35, 1.1, 0);
    leftArm.rotation.z = 0.2;
    group.add(leftArm);
    hitMeshes.push(leftArm);

    const rightArm = new THREE.Mesh(armGeo, material);
    rightArm.position.set(0.35, 1.1, 0);
    rightArm.rotation.z = -0.2;
    group.add(rightArm);
    hitMeshes.push(rightArm);

    const legGeo = new THREE.CylinderGeometry(0.12, 0.08, 0.7, 6);
    const leftLeg = new THREE.Mesh(legGeo, material);
    leftLeg.position.set(-0.15, 0.35, 0);
    group.add(leftLeg);
    hitMeshes.push(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, material);
    rightLeg.position.set(0.15, 0.35, 0);
    group.add(rightLeg);
    hitMeshes.push(rightLeg);
  }

  private createHpBar(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(0.8, 0.08);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.9,
    });
    const bar = new THREE.Mesh(geo, mat);
    return bar;
  }

  private createCountdownLabel(): { sprite: THREE.Sprite; texture: THREE.CanvasTexture } {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.2, 0.6, 1);
    return { sprite, texture };
  }

  // === Round management ===

  private startNextRound(): void {
    this.currentRound++;
    const config = generateRound(this.currentRound);
    this.currentRoundConfig = config;

    this.firstDecisionTime = null;
    this.damageTakenThisRound = 0;
    this.targetsEliminatedThisRound = 0;
    this.totalTargetsThisRound = config.targets.length;

    this.spawnTargets(config);
    this.roundStartTime = performance.now();
    this.isRoundActive = true;

    this.callbacks.onRoundStart?.(this.currentRound);
  }

  private spawnTargets(config: RoundConfig): void {
    const total = config.targets.length;
    for (let i = 0; i < total; i++) {
      const spec = config.targets[i];
      const pos = this.getTargetPosition(i, total);
      const target = this.createTarget(spec.type, pos, config.countdownMs, i);
      this.targets.push(target);
      for (const mesh of target.hitMeshes) {
        this.meshToTarget.set(mesh, target);
      }
    }
  }

  private getTargetPosition(index: number, total: number): THREE.Vector3 {
    if (this.version === 'fps') {
      const angleSpread = Math.PI / 2;
      const startAngle = -angleSpread / 2;
      const angle = total > 1 ? startAngle + (angleSpread * index) / (total - 1) : 0;
      const distance = 6 + (index % 2) * 2;
      return new THREE.Vector3(Math.sin(angle) * distance, 0, -Math.cos(angle) * distance);
    }
    const angle = (index / total) * Math.PI * 2 + Math.PI / 4;
    const distance = 8;
    return new THREE.Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
  }

  private endRound(survived: boolean): void {
    this.isRoundActive = false;

    const result: RoundResult = {
      round: this.currentRound,
      survived,
      firstDecisionMs: this.firstDecisionTime,
      damageTaken: this.damageTakenThisRound,
      targetsEliminated: this.targetsEliminatedThisRound,
      totalTargets: this.totalTargetsThisRound,
    };
    this.roundResults.push(result);
    this.callbacks.onRoundResult?.(result);

    this.clearTargets();

    if (!survived || this.hp <= 0) {
      this.triggerGameOver();
      return;
    }

    this.nextRoundTimeout = setTimeout(() => {
      this.startNextRound();
    }, ROUND_TRANSITION_DELAY);
  }

  private triggerGameOver(): void {
    this.isGameOver = true;
    const survivedRounds = this.roundResults.filter((r) => r.survived).length;
    this.callbacks.onGameOver?.(survivedRounds, [...this.roundResults]);
  }

  // === Target interaction ===

  private hitTarget(target: TargetObject): void {
    if (!target.alive) return;

    if (this.firstDecisionTime === null) {
      this.firstDecisionTime = Math.round(performance.now() - this.roundStartTime);
      this.callbacks.onFirstDecision?.(this.firstDecisionTime);
    }

    target.hp--;
    this.updateHpBar(target);
    target.bodyMaterial.emissiveIntensity = 1.0;

    if (target.hp <= 0) {
      this.eliminateTarget(target);
    }
  }

  private eliminateTarget(target: TargetObject): void {
    target.alive = false;
    target.dissolving = true;
    target.dissolveStart = performance.now();
    target.bodyMaterial.transparent = true;

    this.targetsEliminatedThisRound++;
    const remaining = this.targets.filter((t) => t.alive).length;
    this.callbacks.onTargetEliminated?.(target.type, remaining);

    if (remaining === 0) {
      this.endRound(true);
    }
  }

  // === Click handling ===

  private setupClickHandler(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('click', this.handleClick);
  }

  private handleClick = (event: MouseEvent): void => {
    if (!this.isRoundActive || this.isGameOver) return;

    if (this.version === 'fps' && this.pointerLocked) {
      this.pointer.set(0, 0);
    } else {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
    }

    this.raycaster.setFromCamera(this.pointer, this.camera);

    const aliveMeshes: THREE.Mesh[] = [];
    for (const [mesh, target] of this.meshToTarget) {
      if (target.alive) aliveMeshes.push(mesh);
    }

    const intersects = this.raycaster.intersectObjects(aliveMeshes, false);
    if (intersects.length === 0) return;

    const hitMesh = intersects[0].object as THREE.Mesh;
    const hitTarget = this.meshToTarget.get(hitMesh);
    if (hitTarget) {
      this.hitTarget(hitTarget);
    }
  };

  // === Update loop ===

  protected onUpdate(delta: number): void {
    if (this.isGameOver) return;

    if (this.isRoundActive) {
      this.updateCountdowns(delta);
      this.updateMovement(delta);
    }

    this.updateDissolving();
    this.updateFlash(delta);
    this.updateCountdownLabels();

    if (this.version === 'moba') {
      this.scene.rotation.y += delta * 0.01;
    }
  }

  private updateCountdowns(delta: number): void {
    const deltaMs = delta * 1000;
    for (const target of this.targets) {
      if (!target.alive) continue;

      target.countdownMs -= deltaMs;
      if (target.countdownMs <= 0) {
        this.dealDamage(target);
        target.countdownMs = target.initialCountdownMs;
      }
    }
  }

  private dealDamage(target: TargetObject): void {
    this.hp = Math.max(0, this.hp - target.attack);
    this.damageTakenThisRound += target.attack;
    this.callbacks.onDamageTaken?.(target.attack, this.hp);
    this.callbacks.onHpChange?.(this.hp);

    if (this.hp <= 0) {
      this.endRound(false);
    }
  }

  private updateMovement(delta: number): void {
    if (!this.currentRoundConfig?.hasMovement) return;

    for (const target of this.targets) {
      if (!target.alive) continue;
      this.updateTargetMovement(target, delta);
    }
  }

  private updateTargetMovement(target: TargetObject, delta: number): void {
    target.movePhase += delta * 1.5;

    if (this.version === 'fps') {
      const offset = Math.sin(target.movePhase) * 1.5;
      target.group.position.x = target.basePosition.x + offset;
    } else {
      const distanceFromCenter = target.group.position.length();
      if (distanceFromCenter > 2.5) {
        const dir = target.group.position.clone().normalize();
        target.group.position.addScaledVector(dir, -delta * 0.8);
      }
    }
  }

  private updateDissolving(): void {
    for (const target of this.targets) {
      if (!target.dissolving) continue;

      const elapsed = performance.now() - target.dissolveStart;
      const progress = Math.min(elapsed / DISSOLVE_DURATION, 1);
      target.group.scale.setScalar(1 + progress * 0.5);
      target.bodyMaterial.opacity = 1 - progress;

      if (progress >= 1) {
        target.group.visible = false;
        target.dissolving = false;
      }
    }
  }

  private updateFlash(delta: number): void {
    for (const target of this.targets) {
      if (!target.alive) continue;
      if (target.bodyMaterial.emissiveIntensity > 0.3) {
        target.bodyMaterial.emissiveIntensity = Math.max(
          0.3,
          target.bodyMaterial.emissiveIntensity - delta * 5,
        );
      }
    }
  }

  private updateCountdownLabels(): void {
    for (const target of this.targets) {
      if (!target.alive) continue;
      const seconds = Math.ceil(target.countdownMs / 1000);
      if (seconds === target.lastDisplayedCountdown) continue;
      target.lastDisplayedCountdown = seconds;
      this.drawCountdownLabel(target, seconds);
    }
  }

  // === Visual helpers ===

  private updateHpBar(target: TargetObject): void {
    const ratio = target.hp / target.maxHp;
    target.hpBar.scale.x = Math.max(0.01, ratio);
    target.hpBar.position.x = -(1 - ratio) * 0.4;

    if (ratio > 0.5) {
      target.hpBarMaterial.color.setHex(0x00ff00);
    } else if (ratio > 0.25) {
      target.hpBarMaterial.color.setHex(0xffd700);
    } else {
      target.hpBarMaterial.color.setHex(0xff4500);
    }
  }

  private drawCountdownLabel(target: TargetObject, seconds: number): void {
    const ctx = this.getCountdownContext(target);
    if (!ctx) return;

    const canvas = target.countdownTexture.image as HTMLCanvasElement;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const isUrgent = seconds <= 2;
    const color = isUrgent ? '#FF4500' : '#E8E8E8';
    const bgColor = isUrgent ? 'rgba(80,15,0,0.9)' : 'rgba(22,22,24,0.85)';

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle =
      TARGET_COLORS[target.type] === 0xff4500
        ? '#FF4500'
        : TARGET_COLORS[target.type] === 0x4488ff
          ? '#4488ff'
          : '#888888';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);

    ctx.font = 'bold 40px Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(`${seconds}`, w / 2, h / 2);

    target.countdownTexture.needsUpdate = true;
  }

  private getCountdownContext(target: TargetObject): CanvasRenderingContext2D | null {
    const canvas = target.countdownTexture.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    return ctx;
  }

  // === Cleanup ===

  private clearTargets(): void {
    for (const target of this.targets) {
      target.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
          } else {
            mat?.dispose();
          }
        }
      });
      target.countdownSprite.material.dispose();
      target.countdownTexture.dispose();
      this.scene.remove(target.group);
    }
    this.targets = [];
    this.meshToTarget.clear();
  }

  override dispose(): void {
    if (this.nextRoundTimeout) {
      clearTimeout(this.nextRoundTimeout);
      this.nextRoundTimeout = null;
    }
    this.renderer.domElement.removeEventListener('click', this.handleClick);
    this.clearTargets();
    super.dispose();
  }
}
