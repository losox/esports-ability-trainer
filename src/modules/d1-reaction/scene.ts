import * as THREE from 'three';
import { SceneBase } from '../shared/scene-base';
import { generateWaitTime, REQUIRED_SUCCESS_COUNT } from './logic';

type BallState = 'waiting' | 'activated' | 'dissolving' | 'resetting';

interface ReactionSceneCallbacks {
  onStateChange?: (state: BallState) => void;
  onReaction?: (timeMs: number, isFalseStart: boolean) => void;
  onSuccessUpdate?: (successCount: number, required: number) => void;
  onRoundComplete?: (successCount: number, times: number[], falseStarts: number) => void;
}

const BALL_RADIUS = 0.6;
const COLORS = {
  waiting: 0x4488ff,
  activated: 0xffd700,
  dissolving: 0xff4500,
  pedestal: 0x3a3a3e,
  ground: 0x1a1a1e,
  tree: 0x2a4a2a,
};

export class ReactionScene extends SceneBase {
  private ball!: THREE.Mesh;
  private ballMaterial!: THREE.MeshStandardMaterial;
  private pedestal!: THREE.Mesh;
  private state: BallState = 'waiting';
  private activationTime = 0;
  private reactionTimes: number[] = [];
  private falseStarts = 0;
  private callbacks: ReactionSceneCallbacks;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private waitTimeout: ReturnType<typeof setTimeout> | null = null;
  private dissolveStart = 0;

  constructor(container: HTMLElement, callbacks: ReactionSceneCallbacks = {}) {
    super({ container, cameraType: 'fixed-front' });
    this.callbacks = callbacks;
  }

  protected onInit(): void {
    this.createEnvironment();
    this.createPedestal();
    this.createBall();
    this.setupClickHandler();
    this.callbacks.onSuccessUpdate?.(0, REQUIRED_SUCCESS_COUNT);
    this.startTrial();
  }

  private createEnvironment(): void {
    const groundGeo = new THREE.CircleGeometry(20, 64);
    const groundMat = new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const radius = 8 + Math.random() * 4;
      const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 3 + Math.random() * 2, 8);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.8 });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(
        Math.cos(angle) * radius,
        (3 + Math.random() * 2) / 2,
        Math.sin(angle) * radius,
      );
      this.scene.add(trunk);

      const canopyGeo = new THREE.SphereGeometry(1.5 + Math.random() * 0.5, 8, 8);
      const canopyMat = new THREE.MeshStandardMaterial({ color: COLORS.tree, roughness: 0.7 });
      const canopy = new THREE.Mesh(canopyGeo, canopyMat);
      canopy.position.set(trunk.position.x, trunk.position.y + 2.5, trunk.position.z);
      this.scene.add(canopy);
    }

    const particleGeo = new THREE.BufferGeometry();
    const particleCount = 100;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 30;
      positions[i + 1] = Math.random() * 8;
      positions[i + 2] = (Math.random() - 0.5) * 30;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xff8844,
      size: 0.08,
      transparent: true,
      opacity: 0.6,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    this.scene.add(particles);
  }

  private createPedestal(): void {
    const geo = new THREE.CylinderGeometry(0.8, 1.0, 1.2, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.pedestal,
      roughness: 0.6,
      metalness: 0.3,
    });
    this.pedestal = new THREE.Mesh(geo, mat);
    this.pedestal.position.set(0, 0.6, 0);
    this.scene.add(this.pedestal);
  }

  private createBall(): void {
    const geo = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
    this.ballMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.waiting,
      emissive: COLORS.waiting,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.5,
    });
    this.ball = new THREE.Mesh(geo, this.ballMaterial);
    this.ball.position.set(0, 1.8, 0);
    this.scene.add(this.ball);

    const light = new THREE.PointLight(COLORS.waiting, 2, 10);
    light.position.copy(this.ball.position);
    this.ball.add(light);
  }

  private setupClickHandler(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousedown', this.handleClick);
  }

  private handleClick = (event: MouseEvent): void => {
    if (this.state === 'dissolving' || this.state === 'resetting') return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObject(this.ball);

    if (intersects.length === 0) return;

    const now = performance.now();

    if (this.state === 'waiting') {
      // 抢跑：不计入进度，立刻重开本轮
      this.falseStarts++;
      this.callbacks.onReaction?.(-1, true);
      this.setState('dissolving');
      return;
    }

    if (this.state === 'activated') {
      const reactionTime = now - this.activationTime;
      this.reactionTimes.push(reactionTime);
      this.callbacks.onReaction?.(reactionTime, false);
      this.callbacks.onSuccessUpdate?.(this.reactionTimes.length, REQUIRED_SUCCESS_COUNT);
      this.setState('dissolving');
    }
  };

  /**
   * 开始一次「尝试」：抢跑不计为消耗，会立即再次 startTrial；成功才推进进度。
   */
  private startTrial(): void {
    const successes = this.reactionTimes.length;
    if (successes >= REQUIRED_SUCCESS_COUNT) {
      this.callbacks.onRoundComplete?.(successes, this.reactionTimes, this.falseStarts);
      return;
    }

    this.setState('waiting');
    this.ballMaterial.color.setHex(COLORS.waiting);
    this.ballMaterial.emissive.setHex(COLORS.waiting);
    this.ball.visible = true;
    this.ball.scale.setScalar(1);

    const wait = generateWaitTime();
    this.waitTimeout = setTimeout(() => {
      if (this.state !== 'waiting') return;
      this.activationTime = performance.now();
      this.setState('activated');
      this.ballMaterial.color.setHex(COLORS.activated);
      this.ballMaterial.emissive.setHex(COLORS.activated);
      this.ballMaterial.emissiveIntensity = 0.8;
    }, wait);
  }

  private setState(state: BallState): void {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  protected onUpdate(delta: number): void {
    this.ball.position.y = 1.8 + Math.sin(performance.now() * 0.002) * 0.1;

    if (this.state === 'activated') {
      this.ballMaterial.emissiveIntensity = 0.6 + Math.sin(performance.now() * 0.01) * 0.2;
    }

    if (this.state === 'dissolving') {
      if (this.dissolveStart === 0) this.dissolveStart = performance.now();
      const elapsed = performance.now() - this.dissolveStart;
      const progress = Math.min(elapsed / 500, 1);
      this.ball.scale.setScalar(1 + progress * 0.5);
      this.ballMaterial.emissiveIntensity = 0.8 * (1 - progress);
      this.ballMaterial.opacity = 1 - progress;
      this.ballMaterial.transparent = true;

      if (progress >= 1) {
        this.ball.visible = false;
        this.ballMaterial.transparent = false;
        this.ballMaterial.opacity = 1;
        this.dissolveStart = 0;
        this.setState('resetting');
        setTimeout(() => this.startTrial(), 300);
      }
    } else {
      this.dissolveStart = 0;
    }

    this.scene.rotation.y += delta * 0.02;
  }

  override dispose(): void {
    if (this.waitTimeout) {
      clearTimeout(this.waitTimeout);
    }
    this.renderer.domElement.removeEventListener('mousedown', this.handleClick);
    super.dispose();
  }
}
