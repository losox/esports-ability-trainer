import * as THREE from 'three';
import type { CameraType, MouseSensitivity } from './types';

interface SceneBaseOptions {
  container: HTMLElement;
  cameraType: CameraType;
  sensitivity?: MouseSensitivity;
  onPointerLockChange?: (locked: boolean) => void;
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
  private onPointerLockChange?: (locked: boolean) => void;
  private resizeObserver: ResizeObserver | null = null;

  constructor(options: SceneBaseOptions) {
    this.container = options.container;
    this.cameraType = options.cameraType;
    this.sensitivity = options.sensitivity ?? { value: 1.0 };
    this.onPointerLockChange = options.onPointerLockChange;

    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
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
    if (this.disposed) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  start(): void {
    if (this.isRunning) return;
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
    if (!this.isRunning || this.disposed) return;
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

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
