import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { SceneBase } from '../shared/scene-base';
import { generateWaitTime, REQUIRED_SUCCESS_COUNT } from './logic';

type BallState = 'waiting' | 'activated' | 'dissolving' | 'resetting';

interface ReactionSceneCallbacks {
  onStateChange?: (state: BallState) => void;
  onReaction?: (timeMs: number, isFalseStart: boolean) => void;
  onSuccessUpdate?: (successCount: number, required: number) => void;
  onRoundComplete?: (successCount: number, times: number[], falseStarts: number) => void;
}

const BALL_RADIUS = 0.42;

const PALETTE = {
  bg: 0x0e0e10,
  waiting: 0x4d8cff,
  activated: 0xffcc00,
  dissolving: 0xff4500,
  falseStart: 0xff2222,
  pedestalDark: 0x252529,
  pedestalMetal: 0x4a4a52,
  pedestalHighlight: 0x60606a,
  gold: 0xffb000,
  ember: 0xff5500,
  ground: 0x121215,
  fog: 0x0e0e10,
};

function createSoftCircleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.6)');
  gradient.addColorStop(0.75, 'rgba(255, 255, 255, 0.1)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createForgeTexture(
  baseColor: string,
  noiseColor: string,
  options: { cracks?: string; density?: number; contrast?: number } = {},
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 512, 512);

  const density = options.density ?? 30000;
  const contrast = options.contrast ?? 0.12;
  for (let i = 0; i < density; i++) {
    ctx.fillStyle = noiseColor;
    ctx.globalAlpha = Math.random() * contrast;
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillRect(x, y, 2, 2);
  }

  if (options.cracks) {
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = options.cracks;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 22; i++) {
      ctx.beginPath();
      let x = Math.random() * 512;
      let y = Math.random() * 512;
      ctx.moveTo(x, y);
      for (let j = 0; j < 4 + Math.random() * 5; j++) {
        x += (Math.random() - 0.5) * 140;
        y += (Math.random() - 0.5) * 140;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createNoiseTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const imageData = ctx.createImageData(256, 256);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const v = Math.random() * 255;
    imageData.data[i] = v;
    imageData.data[i + 1] = v;
    imageData.data[i + 2] = v;
    imageData.data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export class ReactionSceneForge extends SceneBase {
  private ball!: THREE.Mesh;
  private ballMaterial!: THREE.MeshPhysicalMaterial;
  private innerCore!: THREE.Mesh;
  private glowShell!: THREE.Mesh;
  private glowMaterial!: THREE.MeshBasicMaterial;
  private rings: THREE.Mesh[] = [];
  private runeRing!: THREE.Mesh;
  private pedestal!: THREE.Group;
  private embers!: THREE.Points;
  private burstParticles!: THREE.Points;
  private shockwave!: THREE.Mesh;
  private shockwaveMaterial!: THREE.MeshBasicMaterial;
  private coreLight!: THREE.PointLight;
  private pedestalRimLight!: THREE.SpotLight;
  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
  private reflector!: Reflector;
  private environmentMap!: THREE.Texture;
  private pmremGenerator!: THREE.PMREMGenerator;

  private state: BallState = 'waiting';
  private activationTime = 0;
  private reactionTimes: number[] = [];
  private falseStarts = 0;
  private callbacks: ReactionSceneCallbacks;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private waitTimeout: ReturnType<typeof setTimeout> | null = null;
  private dissolveStart = 0;
  private burstStart = 0;
  private burstPositions: Float32Array | null = null;
  private burstVelocities: THREE.Vector3[] = [];
  private isFalseStartDissolve = false;

  constructor(container: HTMLElement, callbacks: ReactionSceneCallbacks = {}) {
    super({ container, cameraType: 'fixed-front' });
    this.callbacks = callbacks;
  }

  protected onInit(): void {
    this.configureRenderer();
    this.setupEnvironment();
    this.setupPostProcessing();
    this.createGround();
    this.createPedestal();
    this.createBall();
    this.createEmbers();
    this.createBurstSystem();
    this.createShockwave();
    this.createBackground();
    this.setupClickHandler();
    this.callbacks.onSuccessUpdate?.(0, REQUIRED_SUCCESS_COUNT);
    this.startTrial();
  }

  private configureRenderer(): void {
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  private setupEnvironment(): void {
    this.scene.background = new THREE.Color(PALETTE.bg);
    this.scene.fog = new THREE.FogExp2(PALETTE.fog, 0.038);

    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.pmremGenerator.compileEquirectangularShader();
    this.environmentMap = this.pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.environmentMap;
  }

  private setupPostProcessing(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.38, 0.3, 0.9);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  private createGround(): void {
    const reflectorGeo = new THREE.CircleGeometry(5.5, 96);
    this.reflector = new Reflector(reflectorGeo, {
      clipBias: 0.003,
      textureWidth: this.container.clientWidth * window.devicePixelRatio,
      textureHeight: this.container.clientHeight * window.devicePixelRatio,
      color: 0x222225,
    });
    this.reflector.rotation.x = -Math.PI / 2;
    this.reflector.position.y = 0.005;
    this.scene.add(this.reflector);

    const groundTex = createForgeTexture('#141416', '#242428', {
      cracks: '#333338',
      density: 35000,
      contrast: 0.15,
    });
    groundTex.repeat.set(6, 6);
    const noiseTex = createNoiseTexture();
    noiseTex.repeat.set(8, 8);

    const groundGeo = new THREE.CircleGeometry(40, 128);
    const groundMat = new THREE.MeshStandardMaterial({
      color: PALETTE.ground,
      map: groundTex,
      bumpMap: groundTex,
      bumpScale: 0.06,
      roughnessMap: noiseTex,
      roughness: 0.85,
      metalness: 0.25,
      envMapIntensity: 0.3,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  private createPedestal(): void {
    this.pedestal = new THREE.Group();

    const stoneTex = createForgeTexture('#28282c', '#3a3a40', {
      cracks: '#ff4500',
      density: 22000,
      contrast: 0.14,
    });
    const metalTex = createForgeTexture('#4a4a52', '#6a6a72', { density: 25000, contrast: 0.18 });
    const roughnessTex = createNoiseTexture();
    roughnessTex.repeat.set(4, 1);

    const metalMat = new THREE.MeshStandardMaterial({
      color: PALETTE.pedestalMetal,
      map: metalTex,
      roughnessMap: roughnessTex,
      roughness: 0.35,
      metalness: 0.85,
      envMapIntensity: 1.2,
    });
    const stoneMat = new THREE.MeshStandardMaterial({
      color: PALETTE.pedestalDark,
      map: stoneTex,
      bumpMap: stoneTex,
      bumpScale: 0.08,
      roughness: 0.82,
      metalness: 0.3,
      emissive: PALETTE.ember,
      emissiveMap: stoneTex,
      emissiveIntensity: 0.18,
      envMapIntensity: 0.4,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: PALETTE.gold,
      roughness: 0.2,
      metalness: 1.0,
      envMapIntensity: 1.5,
    });

    const baseGeo = new THREE.CylinderGeometry(2.5, 2.7, 0.28, 80);
    const base = new THREE.Mesh(baseGeo, metalMat);
    base.position.y = 0.14;
    base.castShadow = true;
    base.receiveShadow = true;
    this.pedestal.add(base);

    const midGeo = new THREE.CylinderGeometry(2.0, 2.25, 1.0, 80);
    const mid = new THREE.Mesh(midGeo, stoneMat);
    mid.position.y = 0.78;
    mid.castShadow = true;
    mid.receiveShadow = true;
    this.pedestal.add(mid);

    const grooveGeo = new THREE.TorusGeometry(2.12, 0.04, 16, 120);
    const grooveMat = new THREE.MeshBasicMaterial({
      color: PALETTE.ember,
      transparent: true,
      opacity: 0.6,
    });
    const groove = new THREE.Mesh(grooveGeo, grooveMat);
    groove.rotation.x = Math.PI / 2;
    groove.position.y = 0.45;
    this.pedestal.add(groove);

    const goldGeo = new THREE.CylinderGeometry(1.55, 1.65, 0.18, 80);
    const goldRim = new THREE.Mesh(goldGeo, goldMat);
    goldRim.position.y = 1.27;
    goldRim.castShadow = true;
    goldRim.receiveShadow = true;
    this.pedestal.add(goldRim);

    const topGeo = new THREE.CylinderGeometry(1.25, 1.25, 0.22, 80);
    const top = new THREE.Mesh(topGeo, metalMat);
    top.position.y = 1.47;
    top.castShadow = true;
    top.receiveShadow = true;
    this.pedestal.add(top);

    const glowGeo = new THREE.TorusGeometry(1.4, 0.045, 16, 120);
    const glowMat = new THREE.MeshBasicMaterial({
      color: PALETTE.ember,
      transparent: true,
      opacity: 0.9,
    });
    const glowRing = new THREE.Mesh(glowGeo, glowMat);
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.y = 1.38;
    this.pedestal.add(glowRing);

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const rivetGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.08, 16);
      const rivet = new THREE.Mesh(rivetGeo, goldMat);
      rivet.position.set(Math.cos(angle) * 2.3, 0.14, Math.sin(angle) * 2.3);
      this.pedestal.add(rivet);
    }

    this.pedestalRimLight = new THREE.SpotLight(0xffaa00, 4, 12, Math.PI / 5, 0.4, 1);
    this.pedestalRimLight.position.set(0, 4, -3);
    this.pedestalRimLight.target = this.pedestal;
    this.pedestalRimLight.castShadow = true;
    this.scene.add(this.pedestalRimLight);

    this.scene.add(this.pedestal);

    const ambient = new THREE.AmbientLight(0x2a2a35, 0.35);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffaa77, 1.0);
    key.position.set(5, 9, 5);
    key.castShadow = true;
    key.shadow.mapSize.width = 1024;
    key.shadow.mapSize.height = 1024;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x5577aa, 0.45);
    fill.position.set(-5, 5, -4);
    this.scene.add(fill);

    const rim = new THREE.SpotLight(0xffd700, 2.5, 20, Math.PI / 6, 0.5, 1);
    rim.position.set(0, 2.5, -5);
    rim.target.position.set(0, 1.5, 0);
    rim.target.updateMatrixWorld();
    this.scene.add(rim);
  }

  private createBall(): void {
    this.camera.position.set(0, 1.7, 6.5);
    this.camera.lookAt(0, 1.55, 0);

    const coreGeo = new THREE.SphereGeometry(BALL_RADIUS, 64, 64);
    this.ballMaterial = new THREE.MeshPhysicalMaterial({
      color: PALETTE.waiting,
      emissive: PALETTE.waiting,
      emissiveIntensity: 0.6,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.35,
      thickness: 1.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      ior: 1.6,
      envMapIntensity: 1.2,
    });
    this.ball = new THREE.Mesh(coreGeo, this.ballMaterial);
    this.ball.position.set(0, 2.2, 0);
    this.ball.castShadow = true;
    this.scene.add(this.ball);

    const innerGeo = new THREE.SphereGeometry(BALL_RADIUS * 0.55, 32, 32);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x050510,
      roughness: 0.9,
      metalness: 0.0,
    });
    this.innerCore = new THREE.Mesh(innerGeo, innerMat);
    this.ball.add(this.innerCore);

    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: PALETTE.waiting,
      transparent: true,
      opacity: 0.08,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const shellGeo = new THREE.SphereGeometry(BALL_RADIUS * 1.7, 48, 48);
    this.glowShell = new THREE.Mesh(shellGeo, this.glowMaterial);
    this.ball.add(this.glowShell);

    this.coreLight = new THREE.PointLight(PALETTE.waiting, 2, 10);
    this.coreLight.position.set(0, 0, 0);
    this.ball.add(this.coreLight);

    const ringMat = new THREE.MeshBasicMaterial({
      color: PALETTE.ember,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    for (let i = 0; i < 3; i++) {
      const torusGeo = new THREE.TorusGeometry(0.82 + i * 0.2, 0.012, 16, 120);
      const ring = new THREE.Mesh(torusGeo, ringMat.clone());
      ring.rotation.x = Math.random() * Math.PI;
      ring.rotation.y = Math.random() * Math.PI;
      this.ball.add(ring);
      this.rings.push(ring);
    }

    const runeGeo = new THREE.TorusGeometry(1.18, 0.018, 16, 160);
    const runeMat = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.runeRing = new THREE.Mesh(runeGeo, runeMat);
    this.runeRing.position.y = 0;
    this.ball.add(this.runeRing);
  }

  private createEmbers(): void {
    const count = 120;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 2.5 + Math.random() * 7;
      const angle = Math.random() * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = 0.2 + Math.random() * 5.5;
      positions[i * 3 + 2] = Math.sin(angle) * r;
      sizes[i] = 0.5 + Math.random() * 0.8;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      color: PALETTE.ember,
      size: 0.08,
      map: createSoftCircleTexture(),
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.embers = new THREE.Points(geo, mat);
    this.embers.userData = {
      positions: positions.slice(),
      speeds: new Float32Array(count).map(() => 0.15 + Math.random() * 0.35),
    };
    this.scene.add(this.embers);
  }

  private createBurstSystem(): void {
    const count = 140;
    const positions = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: PALETTE.activated,
      size: 0.16,
      map: createSoftCircleTexture(),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.burstParticles = new THREE.Points(geo, mat);
    this.burstParticles.position.copy(this.ball.position);
    this.scene.add(this.burstParticles);
    this.burstPositions = positions;

    for (let i = 0; i < count; i++) {
      this.burstVelocities.push(new THREE.Vector3());
    }
  }

  private createShockwave(): void {
    this.shockwaveMaterial = new THREE.MeshBasicMaterial({
      color: PALETTE.activated,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const geo = new THREE.RingGeometry(0.5, 0.62, 80);
    this.shockwave = new THREE.Mesh(geo, this.shockwaveMaterial);
    this.shockwave.rotation.x = -Math.PI / 2;
    this.shockwave.position.set(0, 2.18, 0);
    this.scene.add(this.shockwave);
  }

  private createBackground(): void {
    const archMat = new THREE.MeshStandardMaterial({
      color: PALETTE.pedestalMetal,
      roughness: 0.45,
      metalness: 0.8,
      envMapIntensity: 0.8,
    });

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.15;
      const radius = 9 + Math.random() * 2.5;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      this.createArch(x, z, angle, archMat);
    }

    const dustCount = 300;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPositions[i * 3] = (Math.random() - 0.5) * 30;
      dustPositions[i * 3 + 1] = Math.random() * 8;
      dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 30;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xffaa55,
      size: 0.04,
      map: createSoftCircleTexture(),
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    this.scene.add(dust);
  }

  private createArch(x: number, z: number, angle: number, mat: THREE.Material): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = -angle;

    const pillarGeo = new THREE.CylinderGeometry(0.22, 0.32, 7.5, 20);
    const leftPillar = new THREE.Mesh(pillarGeo, mat);
    leftPillar.position.set(-1.6, 3.75, 0);
    leftPillar.castShadow = true;
    group.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, mat);
    rightPillar.position.set(1.6, 3.75, 0);
    rightPillar.castShadow = true;
    group.add(rightPillar);

    const beamGeo = new THREE.BoxGeometry(3.9, 0.45, 0.35);
    const beam = new THREE.Mesh(beamGeo, mat);
    beam.position.set(0, 7.5, 0);
    beam.castShadow = true;
    group.add(beam);

    const stripGeo = new THREE.BoxGeometry(3.5, 0.06, 0.04);
    const stripMat = new THREE.MeshBasicMaterial({
      color: PALETTE.ember,
      transparent: true,
      opacity: 0.5,
    });
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.position.set(0, 7.35, 0.18);
    group.add(strip);

    this.scene.add(group);
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
      this.falseStarts++;
      this.callbacks.onReaction?.(-1, true);
      this.isFalseStartDissolve = true;
      this.setState('dissolving');
      return;
    }

    if (this.state === 'activated') {
      const reactionTime = now - this.activationTime;
      this.reactionTimes.push(reactionTime);
      this.callbacks.onReaction?.(reactionTime, false);
      this.callbacks.onSuccessUpdate?.(this.reactionTimes.length, REQUIRED_SUCCESS_COUNT);
      this.isFalseStartDissolve = false;
      this.setState('dissolving');
    }
  };

  private startTrial(): void {
    const successes = this.reactionTimes.length;
    if (successes >= REQUIRED_SUCCESS_COUNT) {
      this.callbacks.onRoundComplete?.(successes, this.reactionTimes, this.falseStarts);
      return;
    }

    this.setState('waiting');
    this.isFalseStartDissolve = false;
    this.applyBallColor(PALETTE.waiting);
    this.ball.visible = true;
    this.ball.scale.setScalar(1);
    this.shockwave.scale.setScalar(0);
    this.shockwaveMaterial.opacity = 0;

    const wait = generateWaitTime();
    this.waitTimeout = setTimeout(() => {
      if (this.state !== 'waiting') return;
      this.activationTime = performance.now();
      this.setState('activated');
      this.applyBallColor(PALETTE.activated);
      this.spawnBurst();
    }, wait);
  }

  private applyBallColor(color: number): void {
    this.ballMaterial.color.setHex(color);
    this.ballMaterial.emissive.setHex(color);
    this.glowMaterial.color.setHex(color);
    this.coreLight.color.setHex(color);
  }

  private spawnBurst(): void {
    if (!this.burstPositions) return;
    this.burstStart = performance.now();
    const mat = this.burstParticles.material as THREE.PointsMaterial;
    mat.opacity = 1;
    mat.color.setHex(PALETTE.activated);

    for (let i = 0; i < this.burstVelocities.length; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 2 + Math.random() * 3.5;
      this.burstVelocities[i].set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.sin(phi) * Math.sin(theta) * speed,
        Math.cos(phi) * speed,
      );
      this.burstPositions[i * 3] = 0;
      this.burstPositions[i * 3 + 1] = 0;
      this.burstPositions[i * 3 + 2] = 0;
    }
    this.burstParticles.geometry.attributes.position.needsUpdate = true;
  }

  private setState(state: BallState): void {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  protected onUpdate(delta: number): void {
    const now = performance.now();
    this.ball.position.y = 2.2 + Math.sin(now * 0.0012) * 0.06;

    this.rings.forEach((ring, i) => {
      const speed = this.state === 'activated' ? 1.8 : 0.35;
      ring.rotation.x += delta * speed * (i % 2 === 0 ? 1 : -1);
      ring.rotation.y += delta * speed * 0.7;
    });

    this.runeRing.rotation.z += delta * 0.5;

    if (this.state === 'waiting') {
      const pulse = 0.7 + Math.sin(now * 0.002) * 0.2;
      this.ballMaterial.emissiveIntensity = pulse;
      this.coreLight.intensity = 1.5 + pulse;
      this.glowMaterial.opacity = 0.08 + Math.sin(now * 0.003) * 0.03;
    }

    if (this.state === 'activated') {
      const pulse = 0.9 + Math.sin(now * 0.012) * 0.25;
      this.ballMaterial.emissiveIntensity = pulse;
      this.coreLight.intensity = 3 + pulse;
      this.glowMaterial.opacity = 0.18 + Math.sin(now * 0.01) * 0.04;
      this.updateBurst(delta);
    }

    if (this.state === 'dissolving') {
      if (this.dissolveStart === 0) {
        this.dissolveStart = now;
        if (!this.isFalseStartDissolve) {
          this.triggerShockwave();
        }
      }
      const elapsed = now - this.dissolveStart;
      const progress = Math.min(elapsed / 450, 1);
      const ease = 1 - Math.pow(1 - progress, 3);

      this.ball.scale.setScalar(1 - ease * 0.85);
      this.ballMaterial.emissiveIntensity = 1.2 * (1 - ease);
      this.glowMaterial.opacity = 0.15 * (1 - ease);
      this.coreLight.intensity = 3 * (1 - ease);

      const color = this.isFalseStartDissolve ? PALETTE.falseStart : PALETTE.dissolving;
      this.applyBallColor(color);
      this.updateBurst(delta);

      if (progress >= 1) {
        this.ball.visible = false;
        this.dissolveStart = 0;
        this.burstStart = 0;
        (this.burstParticles.material as THREE.PointsMaterial).opacity = 0;
        this.setState('resetting');
        setTimeout(() => this.startTrial(), 250);
      }
    } else {
      this.dissolveStart = 0;
    }

    this.updateEmbers(delta);
    this.updateShockwave(delta);
  }

  private updateBurst(delta: number): void {
    if (!this.burstPositions || this.burstStart === 0) return;
    const mat = this.burstParticles.material as THREE.PointsMaterial;
    const elapsed = (performance.now() - this.burstStart) / 1000;
    mat.opacity = Math.max(0, 1 - elapsed * 1.8);

    for (let i = 0; i < this.burstVelocities.length; i++) {
      this.burstVelocities[i].y -= 2.2 * delta;
      this.burstPositions[i * 3] += this.burstVelocities[i].x * delta;
      this.burstPositions[i * 3 + 1] += this.burstVelocities[i].y * delta;
      this.burstPositions[i * 3 + 2] += this.burstVelocities[i].z * delta;
    }
    this.burstParticles.geometry.attributes.position.needsUpdate = true;
  }

  private updateEmbers(delta: number): void {
    const positions = this.embers.geometry.attributes.position.array as Float32Array;
    const original = this.embers.userData.positions as Float32Array;
    const speeds = this.embers.userData.speeds as Float32Array;
    for (let i = 0; i < speeds.length; i++) {
      positions[i * 3 + 1] += speeds[i] * delta;
      if (positions[i * 3 + 1] > original[i * 3 + 1] + 2.5) {
        positions[i * 3 + 1] = original[i * 3 + 1];
      }
    }
    this.embers.geometry.attributes.position.needsUpdate = true;
  }

  private triggerShockwave(): void {
    this.shockwave.scale.setScalar(0.1);
    this.shockwaveMaterial.opacity = 0.8;
  }

  private updateShockwave(delta: number): void {
    if (this.shockwaveMaterial.opacity <= 0.01) return;
    this.shockwave.scale.addScalar(delta * 5);
    this.shockwaveMaterial.opacity -= delta * 1.8;
    if (this.shockwaveMaterial.opacity < 0) this.shockwaveMaterial.opacity = 0;
  }

  override start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.onInit();
    this.runLoop();
  }

  private runLoop = (): void => {
    if (!this.isRunning || this.disposed) return;
    this.animationId = requestAnimationFrame(this.runLoop);
    this.onUpdate(0.016);
    this.composer.render();
  };

  override stop(): void {
    this.isRunning = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  override dispose(): void {
    if (this.disposed) return;
    if (this.waitTimeout) {
      clearTimeout(this.waitTimeout);
      this.waitTimeout = null;
    }
    this.renderer.domElement.removeEventListener('mousedown', this.handleClick);

    this.environmentMap?.dispose();
    this.pmremGenerator?.dispose();
    this.reflector?.dispose();
    this.composer?.dispose();
    this.bloomPass?.dispose();

    this.burstVelocities = [];
    super.dispose();
  }
}
