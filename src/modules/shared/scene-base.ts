import * as THREE from 'three';
import type { CameraType, MouseSensitivity } from './types';

interface SceneBaseOptions {
  container: HTMLElement;
  cameraType: CameraType;
  sensitivity?: MouseSensitivity;
  onPointerLockChange?: (locked: boolean) => void;
}

/** 收集并释放材质上的所有纹理。 */
function disposeMaterialTextures(material: THREE.Material): void {
  const textureKeys = [
    'map',
    'alphaMap',
    'aoMap',
    'bumpMap',
    'displacementMap',
    'emissiveMap',
    'envMap',
    'lightMap',
    'metalnessMap',
    'normalMap',
    'roughnessMap',
  ];
  const mat = material as unknown as Record<string, THREE.Texture | null | undefined>;
  for (const key of textureKeys) {
    const texture = mat[key];
    if (texture && typeof texture.dispose === 'function') {
      texture.dispose();
    }
  }
}

export abstract class SceneBase {
  protected renderer: THREE.WebGLRenderer;
  protected scene: THREE.Scene;
  protected camera: THREE.PerspectiveCamera;
  protected container: HTMLElement;
  protected cameraType: CameraType;
  protected sensitivity: MouseSensitivity;
  protected animationId: number | null = null;
  protected isRunning = false;
  protected disposed = false;
  protected contextLost = false;
  private onPointerLockChange?: (locked: boolean) => void;
  private resizeObserver: ResizeObserver | null = null;
  private contextLostOverlay: HTMLDivElement | null = null;
  private boundHandleContextLost: (event: Event) => void;
  private boundHandleContextRestored: () => void;

  constructor(options: SceneBaseOptions) {
    this.container = options.container;
    this.cameraType = options.cameraType;
    this.sensitivity = options.sensitivity ?? { value: 1.0 };
    this.onPointerLockChange = options.onPointerLockChange;

    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    // WebGL 支持检查：无法创建上下文时给出明确提示，避免黑屏后无信息。
    const gl = this.container.ownerDocument.createElement('canvas').getContext('webgl2');
    if (!gl) {
      this.showFallbackMessage(
        'WebGL not supported',
        'Your browser or device does not support WebGL, which is required for 3D training.',
      );
      throw new Error('WebGL not supported');
    }

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x161618, 10, 50);

    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    this.setupCamera();

    this.setupLights();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    if (this.cameraType === 'first-person') {
      this.setupPointerLock();
    }

    this.boundHandleContextLost = (event) => this.handleContextLost(event);
    this.boundHandleContextRestored = () => this.handleContextRestored();
    this.renderer.domElement.addEventListener('webglcontextlost', this.boundHandleContextLost);
    this.renderer.domElement.addEventListener(
      'webglcontextrestored',
      this.boundHandleContextRestored,
    );
  }

  private showFallbackMessage(title: string, message: string): void {
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(22,22,24,0.95)';
    overlay.style.color = '#E8E8E8';
    overlay.style.padding = '24px';
    overlay.style.textAlign = 'center';
    overlay.style.zIndex = '10000';
    overlay.innerHTML = `
      <h2 style="margin:0 0 12px;color:#FF4500;font-family:Impact,sans-serif;font-size:2rem">${title}</h2>
      <p style="max-width:480px;color:#7A7A82;margin:0 0 20px">${message}</p>
      <button id="scene-reload-btn" style="padding:12px 28px;border:2px solid #FF4500;background:#FF4500;color:#fff;font-weight:700;cursor:pointer;border-radius:4px">Reload</button>
    `;
    this.container.appendChild(overlay);
    overlay
      .querySelector('#scene-reload-btn')
      ?.addEventListener('click', () => window.location.reload());
  }

  private handleContextLost(event: Event): void {
    event.preventDefault();
    this.contextLost = true;
    this.stop();
    if (!this.contextLostOverlay) {
      this.showFallbackMessage(
        'Graphics context lost',
        'The 3D graphics context was lost, usually due to memory pressure or GPU recovery. Click Reload to restart this training.',
      );
      this.contextLostOverlay = this.container.lastElementChild as HTMLDivElement;
    }
  }

  private handleContextRestored(): void {
    // 实际恢复需要重新创建所有 GPU 资源，对当前架构成本较高。
    // 这里给出友好提示，让用户刷新页面，避免继续黑屏。
    this.contextLost = true;
    this.stop();
  }

  private setupCamera(): void {
    switch (this.cameraType) {
      case 'first-person':
        this.camera.position.set(0, 1.6, 0);
        break;
      case 'isometric':
        this.camera.position.set(8, 12, 8);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'fixed-front':
        this.camera.position.set(0, 2, 8);
        this.camera.lookAt(0, 1, 0);
        break;
    }
  }

  private setupLights(): void {
    const ambient = new THREE.AmbientLight(0x404050, 0.6);
    this.scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xff8844, 0.8);
    directional.position.set(5, 10, 5);
    this.scene.add(directional);

    const fill = new THREE.DirectionalLight(0x4488ff, 0.3);
    fill.position.set(-5, 5, -5);
    this.scene.add(fill);
  }

  private setupPointerLock(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('click', () => {
      if (!this.disposed && this.cameraType === 'first-person') {
        canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      this.onPointerLockChange?.(locked);
    });
  }

  private handleResize(): void {
    if (this.disposed || this.contextLost) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  start(): void {
    if (this.isRunning || this.contextLost) return;
    this.isRunning = true;
    this.onInit();
    this.animate();
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private animate = (): void => {
    if (!this.isRunning || this.disposed || this.contextLost) return;
    this.animationId = requestAnimationFrame(this.animate);
    const delta = 0.016;
    this.onUpdate(delta);
    this.renderer.render(this.scene, this.camera);
  };

  protected abstract onInit(): void;
  protected abstract onUpdate(delta: number): void;

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();

    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.renderer.domElement.removeEventListener('webglcontextlost', this.boundHandleContextLost);
    this.renderer.domElement.removeEventListener(
      'webglcontextrestored',
      this.boundHandleContextRestored,
    );

    // 遍历场景：释放几何体、材质及其贴图，避免 GPU 内存泄漏导致上下文丢失。
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite || obj instanceof THREE.Line) {
        obj.geometry?.dispose();
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach((material) => {
          if (material) {
            disposeMaterialTextures(material);
            material.dispose();
          }
        });
      }
    });

    // 释放场景层级本身
    this.scene.clear();

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
