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

const BALL_RADIUS = 0.55;

/** 森林月光主题配色：低饱和、冷调，避免刺眼。 */
const COLORS = {
  waiting: 0x6b9dc7, // 月光蓝
  activated: 0xffd86b, // 柔和金
  dissolving: 0xffa04d, // 暖橙消散
  stump: 0x4a453e, // 树桩褐
  ground: 0x1c211d, // 深墨绿黑
  fog: 0x0d1114, // 深夜雾
};

const TEXTURE_BASE = '/textures/d1-forest';

/** 加载纹理，失败时返回 null 不影响主流程。 */
function loadTexture(url: string): THREE.Texture | null {
  try {
    const loader = new THREE.TextureLoader();
    const texture = loader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
  } catch {
    return null;
  }
}

/** 生成柔和圆形粒子贴图，让萤火虫/光尘呈现光点而非方块。 */
function createSoftDotTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.4)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ReactionSceneForest extends SceneBase {
  private ball!: THREE.Mesh;
  private ballMaterial!: THREE.MeshStandardMaterial;
  private stump!: THREE.Mesh;
  private state: BallState = 'waiting';
  private activationTime = 0;
  private reactionTimes: number[] = [];
  private falseStarts = 0;
  private callbacks: ReactionSceneCallbacks;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private waitTimeout: ReturnType<typeof setTimeout> | null = null;
  private dissolveStart = 0;
  private fireflies!: THREE.Points;

  constructor(container: HTMLElement, callbacks: ReactionSceneCallbacks = {}) {
    super({ container, cameraType: 'fixed-front' });
    this.callbacks = callbacks;
  }

  protected onInit(): void {
    this.createEnvironment();
    this.createStump();
    this.createBall();
    this.createFireflies();
    this.setupClickHandler();
    this.callbacks.onSuccessUpdate?.(0, REQUIRED_SUCCESS_COUNT);
    this.startTrial();
  }

  private createEnvironment(): void {
    // 1. 天空背景：使用月光天空贴图，若加载失败则回退为纯色夜空。
    const skyTexture = loadTexture(`${TEXTURE_BASE}/moon-sky.jpg`);
    if (skyTexture) {
      this.scene.background = skyTexture;
    } else {
      this.scene.background = new THREE.Color(0x070a0d);
    }

    // 2. 深雾：营造森林夜晚的层次感，同时柔化远处树木边缘。
    this.scene.fog = new THREE.FogExp2(COLORS.fog, 0.022);

    // 3. 地面：使用无缝地面贴图，重复铺设形成自然森林地面。
    const groundTexture = loadTexture(`${TEXTURE_BASE}/ground.jpg`);
    const groundGeo = new THREE.CircleGeometry(32, 96);
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTexture,
      color: 0x888888,
      roughness: 0.95,
      metalness: 0.0,
    });
    if (groundTexture) {
      groundTexture.repeat.set(10, 10);
    }
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 4. 森林：随机分布树木，外圈半径避免遮挡中心球体。
    const barkTexture = loadTexture(`${TEXTURE_BASE}/bark.jpg`);
    const canopyTexture = loadTexture(`${TEXTURE_BASE}/canopy-round.png`);
    const treeCount = 18;

    // 树冠材质：复用同一张带透明通道的 PNG， softer alpha 边缘。
    const spriteMat = new THREE.SpriteMaterial({
      map: canopyTexture,
      color: 0xbbccd6,
      alphaTest: 0.05,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });

    const trunkMat = new THREE.MeshStandardMaterial({
      map: barkTexture,
      color: 0x999999,
      roughness: 0.92,
      metalness: 0.0,
    });
    const branchMat = new THREE.MeshStandardMaterial({
      map: barkTexture,
      color: 0x888888,
      roughness: 0.94,
      metalness: 0.0,
    });

    for (let i = 0; i < treeCount; i++) {
      const angle = (i / treeCount) * Math.PI * 2 + Math.random() * 0.4;
      const radius = 8 + Math.random() * 8;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const height = 4 + Math.random() * 3;
      this.createNaturalTree(x, z, height, trunkMat, branchMat, spriteMat);
    }

    // 5. 月光照明：冷白主光从斜上方照射，补光保留暗部细节。
    // 先移除 SceneBase 默认灯光，避免暖色光破坏月光氛围。
    this.scene.children
      .filter((child) => child instanceof THREE.Light)
      .forEach((light) => this.scene.remove(light));

    const moonLight = new THREE.DirectionalLight(0xdceeff, 1.4);
    moonLight.position.set(12, 18, 8);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.width = 1024;
    moonLight.shadow.mapSize.height = 1024;
    this.scene.add(moonLight);

    // 半球光模拟月光在大气中的散射，让地面和树冠有柔和的冷调。
    const hemiLight = new THREE.HemisphereLight(0x7e9ebb, 0x1c211d, 0.65);
    this.scene.add(hemiLight);

    const ambient = new THREE.AmbientLight(0x253040, 0.45);
    this.scene.add(ambient);

    const fillLight = new THREE.DirectionalLight(0x3a4a5a, 0.4);
    fillLight.position.set(-10, 6, -10);
    this.scene.add(fillLight);
  }

  /**
   * 生成一棵自然弯曲、带枝杈的树。
   * 树干由多段短圆柱组成，每段有轻微偏转；枝杈从树干不同高度伸出，
   * 树冠 Sprite 放置在枝杈末端和树顶，形成蓬松自然的轮廓。
   */
  private createNaturalTree(
    x: number,
    z: number,
    height: number,
    trunkMat: THREE.MeshStandardMaterial,
    branchMat: THREE.MeshStandardMaterial,
    spriteMat: THREE.SpriteMaterial,
  ): void {
    const treeGroup = new THREE.Group();
    treeGroup.position.set(x, 0, z);
    treeGroup.rotation.y = Math.random() * Math.PI * 2;

    const segmentCount = 5;
    const segmentHeight = height / segmentCount;
    let currentPos = new THREE.Vector3(0, segmentHeight * 0.5, 0);
    let currentDir = new THREE.Vector3(0, 1, 0);
    const leanAxis = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    const leanAngle = (Math.random() - 0.5) * 0.18;

    const canopyAnchors: THREE.Vector3[] = [];

    for (let i = 0; i < segmentCount; i++) {
      const baseRadius = 0.32 * (1 - i / segmentCount) + 0.12;
      const topRadius = 0.32 * (1 - (i + 1) / segmentCount) + 0.12;
      const segGeo = new THREE.CylinderGeometry(topRadius, baseRadius, segmentHeight, 8);
      const segment = new THREE.Mesh(segGeo, trunkMat);
      segment.position.copy(currentPos);

      // 让树干微微倾向 leanAxis 方向
      const tilt = leanAxis.clone().multiplyScalar(Math.sin(i * 0.6) * leanAngle);
      const segmentDir = currentDir.clone().add(tilt).normalize();
      const quaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        segmentDir,
      );
      segment.setRotationFromQuaternion(quaternion);
      segment.castShadow = true;
      segment.receiveShadow = true;
      treeGroup.add(segment);

      // 从第二段开始随机长出枝杈
      if (i >= 1 && Math.random() > 0.25) {
        const branchCount = 1 + Math.floor(Math.random() * 2);
        for (let b = 0; b < branchCount; b++) {
          const branchAnchor = currentPos
            .clone()
            .add(segmentDir.clone().multiplyScalar(segmentHeight * 0.3));
          const branchLength = 0.8 + Math.random() * 1.2;
          const branchAngle = Math.random() * Math.PI * 2;
          const branchUp = 0.2 + Math.random() * 0.4;
          const branchDir = new THREE.Vector3(
            Math.cos(branchAngle),
            branchUp,
            Math.sin(branchAngle),
          ).normalize();

          const branchSegCount = 2;
          const branchSegLen = branchLength / branchSegCount;
          let branchPos = branchAnchor.clone();
          let branchCurDir = branchDir.clone();
          for (let bs = 0; bs < branchSegCount; bs++) {
            const brGeo = new THREE.CylinderGeometry(0.06, 0.1, branchSegLen, 6);
            const branchSeg = new THREE.Mesh(brGeo, branchMat);
            branchSeg.position.copy(
              branchPos.add(branchCurDir.clone().multiplyScalar(branchSegLen * 0.5)),
            );
            const branchQuat = new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              branchCurDir,
            );
            branchSeg.setRotationFromQuaternion(branchQuat);
            branchSeg.castShadow = true;
            branchSeg.receiveShadow = true;
            treeGroup.add(branchSeg);
            branchPos = branchPos
              .clone()
              .add(branchCurDir.clone().multiplyScalar(branchSegLen * 0.5));
            branchCurDir.y += 0.15;
            branchCurDir.normalize();
          }
          canopyAnchors.push(branchPos);
        }
      }

      currentPos = currentPos.clone().add(segmentDir.clone().multiplyScalar(segmentHeight));
      currentDir = segmentDir;
    }

    // 树顶也加一个树冠锚点
    canopyAnchors.push(currentPos);

    // 在每个锚点放置蓬松树冠 Sprite 簇
    const canopySize = 1.4 + Math.random() * 1.0;
    const spritesPerAnchor = 4;
    for (const anchor of canopyAnchors) {
      for (let s = 0; s < spritesPerAnchor; s++) {
        const sprite = new THREE.Sprite(spriteMat);
        const sScale = canopySize * (0.7 + Math.random() * 0.6);
        sprite.scale.set(sScale * 1.7, sScale * 1.7, 1);
        sprite.position.set(
          anchor.x + (Math.random() - 0.5) * canopySize * 0.7,
          anchor.y + (Math.random() - 0.2) * canopySize * 0.5,
          anchor.z + (Math.random() - 0.5) * canopySize * 0.7,
        );
        sprite.material.rotation = Math.random() * Math.PI;
        treeGroup.add(sprite);
      }
    }

    this.scene.add(treeGroup);
  }

  private createStump(): void {
    // 树桩底座，使用树皮贴图并带青苔色调，承托魔法球。
    const barkTexture = loadTexture(`${TEXTURE_BASE}/bark.jpg`);
    const geo = new THREE.CylinderGeometry(0.85, 1.0, 1.1, 14);
    const mat = new THREE.MeshStandardMaterial({
      map: barkTexture,
      color: 0x6b7a6b,
      roughness: 0.92,
      metalness: 0.0,
    });
    this.stump = new THREE.Mesh(geo, mat);
    this.stump.position.set(0, 0.55, 0);
    this.stump.receiveShadow = true;
    this.stump.castShadow = true;
    this.scene.add(this.stump);
  }

  private createBall(): void {
    const geo = new THREE.SphereGeometry(BALL_RADIUS, 48, 48);
    this.ballMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.waiting,
      emissive: COLORS.waiting,
      emissiveIntensity: 0.25,
      roughness: 0.45,
      metalness: 0.0,
    });
    this.ball = new THREE.Mesh(geo, this.ballMaterial);
    this.ball.position.set(0, 1.65, 0);
    this.ball.castShadow = true;
    this.scene.add(this.ball);

    // 柔和的局部点光源，仅照亮球体附近，不造成强反射。
    const light = new THREE.PointLight(COLORS.waiting, 1.2, 5);
    light.position.copy(this.ball.position);
    this.ball.add(light);
  }

  private createFireflies(): void {
    // 暗场景中少量萤火虫/光尘，增强森林氛围而不干扰注意力。
    const particleCount = 60;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 3 + Math.random() * 10;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = 0.3 + Math.random() * 3.5;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xaaddff,
      size: 0.09,
      map: createSoftDotTexture(),
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.fireflies = new THREE.Points(particleGeo, particleMat);
    this.scene.add(this.fireflies);
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
      this.ballMaterial.emissiveIntensity = 0.65;
    }, wait);
  }

  private setState(state: BallState): void {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  protected onUpdate(delta: number): void {
    const now = performance.now();

    // 魔法球轻微呼吸浮动
    this.ball.position.y = 1.65 + Math.sin(now * 0.0015) * 0.06;

    // 等待态：柔和脉动；激活态：更明亮但不过曝
    if (this.state === 'waiting') {
      this.ballMaterial.emissiveIntensity = 0.18 + Math.sin(now * 0.002) * 0.05;
    } else if (this.state === 'activated') {
      this.ballMaterial.emissiveIntensity = 0.45 + Math.sin(now * 0.008) * 0.08;
    }

    // 萤火虫缓慢漂移
    const positions = this.fireflies.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length / 3; i++) {
      positions[i * 3 + 1] += Math.sin(now * 0.001 + i) * 0.003;
    }
    this.fireflies.geometry.attributes.position.needsUpdate = true;

    if (this.state === 'dissolving') {
      if (this.dissolveStart === 0) this.dissolveStart = now;
      const elapsed = now - this.dissolveStart;
      const progress = Math.min(elapsed / 500, 1);
      this.ball.scale.setScalar(1 + progress * 0.4);
      this.ballMaterial.emissiveIntensity = 0.7 * (1 - progress);
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

    // 场景极缓慢旋转，让森林有环绕感但不过度分散注意力
    this.scene.rotation.y += delta * 0.005;
  }

  override dispose(): void {
    if (this.waitTimeout) {
      clearTimeout(this.waitTimeout);
    }
    this.renderer.domElement.removeEventListener('mousedown', this.handleClick);
    super.dispose();
  }
}
