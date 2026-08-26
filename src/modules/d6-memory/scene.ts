import * as THREE from 'three';
import { SceneBase } from '../shared/scene-base';
import {
  generateDifficulty,
  generateUnitPositions,
  applyMovement,
  assignUnitTypes,
  calculateMarkingResults,
  calculateRoundScore,
  isFailure,
  MAX_FAILURES,
  MAP_SIZE,
  type DifficultyConfig,
  type UnitPosition,
  type Position,
  type MarkingResult,
  type RoundResult,
  type UnitType,
} from './logic';

type GamePhase = 'idle' | 'observe' | 'silence' | 'recall' | 'reveal' | 'gameover';

export interface MemorySceneCallbacks {
  onPhaseChange?: (phase: GamePhase) => void;
  onRoundStart?: (round: number, difficulty: DifficultyConfig) => void;
  onMarkingUpdate?: (marked: number, total: number) => void;
  onRoundComplete?: (result: RoundResult) => void;
  onFailuresUpdate?: (failures: number) => void;
  onSessionComplete?: (rounds: RoundResult[]) => void;
  onError?: (message: string) => void;
}

interface UnitMesh {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  position: Position;
  unitId: number;
  type: UnitType;
}

interface MarkingMarker {
  mesh: THREE.Mesh;
  position: Position;
}

const COLORS: Record<string, number> = {
  ground: 0x1a2a1a,
  mapBorder: 0x2a4a2a,
  river: 0x1a3a4a,
  unitNormal: 0xff4500,
  unitFast: 0xffd700,
  unitTank: 0x4488ff,
  interference: 0x666666,
  marking: 0xffd700,
  revealActual: 0x00ff88,
  fog: 0x161618,
  pedestal: 0x3a3a3e,
};

const UNIT_COLORS: Record<UnitType, number> = {
  normal: COLORS.unitNormal,
  fast: COLORS.unitFast,
  tank: COLORS.unitTank,
};

const UNIT_SIZES: Record<UnitType, number> = {
  normal: 0.4,
  fast: 0.3,
  tank: 0.55,
};

export class MemoryScene extends SceneBase {
  private callbacks: MemorySceneCallbacks;
  private phase: GamePhase = 'idle';
  private round = 0;
  private failures = 0;
  private roundResults: RoundResult[] = [];

  private currentDifficulty: DifficultyConfig | null = null;
  private currentUnits: UnitPosition[] = [];
  private unitMeshes: UnitMesh[] = [];
  private markingMarkers: MarkingMarker[] = [];
  private revealMeshes: THREE.Object3D[] = [];
  private interferenceMeshes: THREE.Mesh[] = [];

  private groundMesh!: THREE.Mesh;
  private fogOverlay!: THREE.Mesh;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  private phaseTimeout: ReturnType<typeof setTimeout> | null = null;
  private movementStart = 0;
  private markedPositions: Position[] = [];

  constructor(container: HTMLElement, callbacks: MemorySceneCallbacks = {}) {
    super({ container, cameraType: 'isometric' });
    this.callbacks = callbacks;
  }

  protected onInit(): void {
    this.createEnvironment();
    this.createFogOverlay();
    this.setupClickHandler();
  }

  protected onUpdate(_delta: number): void {
    if (this.phase === 'observe' && this.currentDifficulty) {
      const elapsed = performance.now() - this.movementStart;
      const observeMs = this.currentDifficulty.observeDurationMs;
      const movementPhase = observeMs * 0.4;

      if (elapsed > movementPhase && this.currentDifficulty.movement !== 'none') {
        // Units move in the second half of observe phase
        this.updateUnitMovement(elapsed - movementPhase, movementPhase);
      }
    }

    // Animate fog overlay
    if (this.fogOverlay && this.fogOverlay.visible) {
      const mat = this.fogOverlay.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.5 + Math.sin(performance.now() * 0.002) * 0.1;
    }
  }

  // -------------------------------------------------------------------------
  // Environment
  // -------------------------------------------------------------------------

  private createEnvironment(): void {
    // MOBA-style map ground
    const mapGeo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 32, 32);
    const mapMat = new THREE.MeshStandardMaterial({
      color: COLORS.ground,
      roughness: 0.9,
      metalness: 0.1,
    });
    this.groundMesh = new THREE.Mesh(mapGeo, mapMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.y = 0;
    this.scene.add(this.groundMesh);

    // Map border
    const borderGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(MAP_SIZE, 0.3, MAP_SIZE));
    const borderMat = new THREE.LineBasicMaterial({ color: COLORS.mapBorder });
    const border = new THREE.LineSegments(borderGeo, borderMat);
    border.position.y = 0.15;
    this.scene.add(border);

    // River line (decorative)
    const riverGeo = new THREE.PlaneGeometry(MAP_SIZE, 1.5);
    const riverMat = new THREE.MeshStandardMaterial({
      color: COLORS.river,
      transparent: true,
      opacity: 0.4,
      roughness: 0.3,
    });
    const river = new THREE.Mesh(riverGeo, riverMat);
    river.rotation.x = -Math.PI / 2;
    river.position.set(0, 0.02, 0);
    this.scene.add(river);

    // Decorative pillars at corners
    const cornerOffsets = [
      [-MAP_SIZE / 2 + 0.5, -MAP_SIZE / 2 + 0.5],
      [MAP_SIZE / 2 - 0.5, -MAP_SIZE / 2 + 0.5],
      [-MAP_SIZE / 2 + 0.5, MAP_SIZE / 2 - 0.5],
      [MAP_SIZE / 2 - 0.5, MAP_SIZE / 2 - 0.5],
    ];
    for (const [cx, cz] of cornerOffsets) {
      const pillarGeo = new THREE.CylinderGeometry(0.3, 0.4, 2.5, 8);
      const pillarMat = new THREE.MeshStandardMaterial({
        color: COLORS.pedestal,
        roughness: 0.6,
        metalness: 0.3,
      });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(cx, 1.25, cz);
      this.scene.add(pillar);
    }

    // Atmospheric particles (fog of war motes)
    const particleGeo = new THREE.BufferGeometry();
    const particleCount = 80;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * MAP_SIZE;
      positions[i + 1] = Math.random() * 6;
      positions[i + 2] = (Math.random() - 0.5) * MAP_SIZE;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x446688,
      size: 0.1,
      transparent: true,
      opacity: 0.4,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    this.scene.add(particles);
  }

  private createFogOverlay(): void {
    const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE);
    const mat = new THREE.MeshBasicMaterial({
      color: COLORS.fog,
      transparent: true,
      opacity: 0.5,
    });
    this.fogOverlay = new THREE.Mesh(geo, mat);
    this.fogOverlay.rotation.x = -Math.PI / 2;
    this.fogOverlay.position.y = 0.5;
    this.fogOverlay.visible = false;
    this.scene.add(this.fogOverlay);
  }

  // -------------------------------------------------------------------------
  // Unit management
  // -------------------------------------------------------------------------

  private createUnitMesh(unit: UnitPosition): UnitMesh {
    const size = UNIT_SIZES[unit.type];
    const color = UNIT_COLORS[unit.type];

    const geo = new THREE.ConeGeometry(size, size * 2, 6);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.5,
      roughness: 0.4,
      metalness: 0.3,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(unit.position.x, size, unit.position.y);
    this.scene.add(mesh);

    // Glow ring
    const ringGeo = new THREE.RingGeometry(size * 1.2, size * 1.5, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(unit.position.x, 0.05, unit.position.y);
    mesh.add(ring);

    return {
      mesh,
      material: mat,
      position: { ...unit.position },
      unitId: unit.id,
      type: unit.type,
    };
  }

  private clearUnits(): void {
    for (const u of this.unitMeshes) {
      this.scene.remove(u.mesh);
      u.mesh.geometry.dispose();
      u.material.dispose();
    }
    this.unitMeshes = [];
  }

  private clearMarkers(): void {
    for (const m of this.markingMarkers) {
      this.scene.remove(m.mesh);
      m.mesh.geometry.dispose();
      (m.mesh.material as THREE.Material).dispose();
    }
    this.markingMarkers = [];
  }

  private clearRevealMeshes(): void {
    for (const m of this.revealMeshes) {
      this.scene.remove(m);
      const obj = m as THREE.Mesh | THREE.Line;
      obj.geometry?.dispose();
      const mat = obj.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) {
        mat.forEach((mm) => mm.dispose());
      } else {
        mat?.dispose();
      }
    }
    this.revealMeshes = [];
  }

  private clearInterference(): void {
    for (const m of this.interferenceMeshes) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.interferenceMeshes = [];
  }

  // -------------------------------------------------------------------------
  // Game flow
  // -------------------------------------------------------------------------

  startTraining(): void {
    this.round = 0;
    this.failures = 0;
    this.roundResults = [];
    this.startNextRound();
  }

  private startNextRound(): void {
    this.round++;
    this.clearUnits();
    this.clearMarkers();
    this.clearRevealMeshes();
    this.clearInterference();
    this.markedPositions = [];

    const difficulty = generateDifficulty(this.round);
    this.currentDifficulty = difficulty;

    let units = generateUnitPositions(difficulty.unitCount, MAP_SIZE);
    units = assignUnitTypes(units, difficulty.unitTypesDifferentiated);

    // Apply movement to get final positions (units will visually move during observe)
    this.currentUnits = applyMovement(units, difficulty.movement);
    // But store original positions for the initial placement; movement happens over time
    this.currentUnits = units.map((u) => ({ ...u, moveOffset: u.moveOffset }));

    this.callbacks.onRoundStart?.(this.round, difficulty);

    // Phase 1: Observe
    this.setPhase('observe');
    this.movementStart = performance.now();

    for (const unit of units) {
      const mesh = this.createUnitMesh(unit);
      this.unitMeshes.push(mesh);
    }

    this.phaseTimeout = setTimeout(() => {
      this.startSilencePhase();
    }, difficulty.observeDurationMs);
  }

  private updateUnitMovement(elapsed: number, movementPhase: number): void {
    const progress = Math.min(elapsed / movementPhase, 1);
    for (let i = 0; i < this.unitMeshes.length && i < this.currentUnits.length; i++) {
      const unit = this.currentUnits[i];
      if (!unit.moveOffset) continue;

      const mesh = this.unitMeshes[i];
      const originalPos = {
        x: unit.position.x - unit.moveOffset.x,
        y: unit.position.y - unit.moveOffset.y,
      };
      const eased = 1 - Math.pow(1 - progress, 2);
      const x = originalPos.x + unit.moveOffset.x * eased;
      const z = originalPos.y + unit.moveOffset.y * eased;
      mesh.mesh.position.x = x;
      mesh.mesh.position.z = z;
      mesh.position = { x, y: z };
    }
  }

  private startSilencePhase(): void {
    // Store final positions after movement
    this.currentUnits = this.unitMeshes.map((u) => ({
      id: u.unitId,
      position: { ...u.position },
      type: u.type,
    }));

    this.clearUnits();
    this.setPhase('silence');
    this.fogOverlay.visible = true;

    // Spawn interference
    if (this.currentDifficulty) {
      this.spawnInterference(this.currentDifficulty);
    }

    this.phaseTimeout = setTimeout(() => {
      this.clearInterference();
      this.startRecallPhase();
    }, this.currentDifficulty?.silenceDurationMs ?? 2000);
  }

  private spawnInterference(difficulty: DifficultyConfig): void {
    if (difficulty.interference === 'none') return;

    // Flashing interference units
    if (difficulty.interference === 'flashing' || difficulty.interference === 'text-prompt') {
      const interferenceCount = Math.floor(difficulty.unitCount * 0.5);
      for (let i = 0; i < interferenceCount; i++) {
        const x = (Math.random() - 0.5) * MAP_SIZE * 0.7;
        const z = (Math.random() - 0.5) * MAP_SIZE * 0.7;
        const geo = new THREE.SphereGeometry(0.2, 8, 8);
        const mat = new THREE.MeshBasicMaterial({
          color: COLORS.interference,
          transparent: true,
          opacity: 0.3,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, 0.5, z);
        this.scene.add(mesh);
        this.interferenceMeshes.push(mesh);
      }
    }
  }

  private startRecallPhase(): void {
    this.fogOverlay.visible = false;
    this.setPhase('recall');
    this.markedPositions = [];
    this.callbacks.onMarkingUpdate?.(0, this.currentUnits.length);
  }

  private startRevealPhase(): void {
    this.setPhase('reveal');

    const markings = this.calculateMarkings();
    const difficulty = this.currentDifficulty ?? generateDifficulty(1);
    const failed = isFailure(markings, 200);
    const avgDeviation =
      markings.length > 0 ? markings.reduce((s, m) => s + m.deviation, 0) / markings.length : 999;
    const completeRecall = markings.length > 0 && markings.every((m) => !m.isMissing);
    const roundScore = calculateRoundScore(markings, difficulty);

    // Show actual positions
    for (const unit of this.currentUnits) {
      const geo = new THREE.RingGeometry(0.4, 0.5, 16);
      const mat = new THREE.MeshBasicMaterial({
        color: COLORS.revealActual,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(unit.position.x, 0.06, unit.position.y);
      this.scene.add(mesh);
      this.revealMeshes.push(mesh);
    }

    // Draw deviation lines
    for (const marking of markings) {
      if (marking.isMissing) continue;
      this.drawDeviationLine(marking);
    }

    const result: RoundResult = {
      round: this.round,
      difficulty,
      markings,
      avgDeviation: Math.round(avgDeviation),
      completeRecall,
      isFailure: failed,
      roundScore,
    };

    this.roundResults.push(result);
    this.callbacks.onRoundComplete?.(result);

    if (failed) {
      this.failures++;
      this.callbacks.onFailuresUpdate?.(this.failures);
    }

    this.phaseTimeout = setTimeout(() => {
      if (this.failures >= MAX_FAILURES) {
        this.setPhase('gameover');
        this.callbacks.onSessionComplete?.(this.roundResults);
      } else {
        this.startNextRound();
      }
    }, 3500);
  }

  private calculateMarkings(): MarkingResult[] {
    return calculateMarkingResults(this.markedPositions, this.currentUnits);
  }

  private drawDeviationLine(marking: MarkingResult): void {
    const points = [
      new THREE.Vector3(marking.markedPosition.x, 0.1, marking.markedPosition.y),
      new THREE.Vector3(marking.actualPosition.x, 0.1, marking.actualPosition.y),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const color = marking.deviation < 50 ? 0x00ff88 : marking.deviation < 150 ? 0xffd700 : 0xff4500;
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.revealMeshes.push(line);
  }

  // -------------------------------------------------------------------------
  // Click handling
  // -------------------------------------------------------------------------

  private setupClickHandler(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousedown', this.handleClick);
  }

  private handleClick = (event: MouseEvent): void => {
    if (this.phase !== 'recall') return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObject(this.groundMesh);

    if (intersects.length === 0) return;

    const point = intersects[0].point;
    const position: Position = { x: point.x, y: point.z };
    this.markedPositions.push(position);
    this.createMarkingMarker(position);

    this.callbacks.onMarkingUpdate?.(this.markedPositions.length, this.currentUnits.length);

    // Auto-transition to reveal when all units marked
    if (this.markedPositions.length >= this.currentUnits.length) {
      this.startRevealPhase();
    }
  };

  private createMarkingMarker(position: Position): void {
    const geo = new THREE.RingGeometry(0.3, 0.4, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: COLORS.marking,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(position.x, 0.08, position.y);
    this.scene.add(mesh);
    this.markingMarkers.push({ mesh, position });
  }

  /** Manually trigger reveal (user clicks "Done" button instead of marking all) */
  triggerReveal(): void {
    if (this.phase === 'recall') {
      this.startRevealPhase();
    }
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  private setPhase(phase: GamePhase): void {
    this.phase = phase;
    this.callbacks.onPhaseChange?.(phase);
  }

  getPhase(): GamePhase {
    return this.phase;
  }

  override dispose(): void {
    if (this.phaseTimeout) {
      clearTimeout(this.phaseTimeout);
    }
    this.clearUnits();
    this.clearMarkers();
    this.clearRevealMeshes();
    this.clearInterference();
    this.renderer.domElement.removeEventListener('click', this.handleClick);
    super.dispose();
  }
}
