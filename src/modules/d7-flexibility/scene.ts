import * as THREE from 'three';
import { SceneBase } from '../shared/scene-base';
import {
  BOARD_RULES,
  PATTERN_TIME_LIMIT_MS,
  SESSION_DURATION_MS,
  generateLightChangeInterval,
  generateRandomBoard,
  validatePattern,
  isPatternCompletedWithinTime,
  calculateSessionMetrics,
  isSessionOver,
  KEY_TO_BOARD,
  isBoardKey,
  getBoardRule,
  type BoardId,
  type BoardRule,
  type PiecePosition,
  type SwitchEvent,
  type PatternCompletion,
} from './logic';

export interface FlexibilitySceneCallbacks {
  onActiveBoardChange?: (board: BoardId | null) => void;
  onPatternTimerUpdate?: (remainingMs: number) => void;
  onSessionTimerUpdate?: (remainingMs: number) => void;
  onPieceClick?: (boardId: BoardId, pieceIndex: number, clickedOrder: number[]) => void;
  onSwitchEvent?: (event: SwitchEvent) => void;
  onPatternComplete?: (completion: PatternCompletion) => void;
  onSessionComplete?: (metrics: ReturnType<typeof calculateSessionMetrics>) => void;
  onError?: (message: string) => void;
}

interface PieceMesh {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  baseColor: number;
  isLit: boolean;
}

interface BoardMesh {
  rule: BoardRule;
  group: THREE.Group;
  surface: THREE.Mesh;
  surfaceMaterial: THREE.MeshStandardMaterial;
  pieces: PieceMesh[];
  position: THREE.Vector3;
}

interface LightOrb {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  baseColor: number;
  boardId: BoardId;
  isActive: boolean;
}

const PIECE_BASE_COLOR = 0x333335;
const SURFACE_COLOR = 0x1e1e22;
const TABLE_COLOR = 0x2a2a2e;
const LIT_INTENSITY = 0.9;
const UNLIT_INTENSITY = 0.05;
const PIECE_SIZE = 0.35;
const PIECE_HEIGHT = 0.6;
const SURFACE_SIZE = 1.8;

const BOARD_LAYOUT: Record<BoardId, THREE.Vector3> = {
  A: new THREE.Vector3(-3.5, 0, -2.5),
  B: new THREE.Vector3(3.5, 0, -2.5),
  C: new THREE.Vector3(-3.5, 0, 2.5),
  D: new THREE.Vector3(3.5, 0, 2.5),
  E: new THREE.Vector3(0, 0, 0),
};

const PIECE_OFFSETS: THREE.Vector3[] = [
  new THREE.Vector3(-0.4, 0, -0.4),
  new THREE.Vector3(0.4, 0, -0.4),
  new THREE.Vector3(-0.4, 0, 0.4),
  new THREE.Vector3(0.4, 0, 0.4),
];

const LIGHT_ORB_POSITIONS: Record<BoardId, THREE.Vector3> = {
  A: new THREE.Vector3(-4, 3.5, -4),
  B: new THREE.Vector3(-2, 3.5, -4),
  C: new THREE.Vector3(0, 3.5, -4),
  D: new THREE.Vector3(2, 3.5, -4),
  E: new THREE.Vector3(4, 3.5, -4),
};

export class FlexibilityScene extends SceneBase {
  private callbacks: FlexibilitySceneCallbacks;
  private boards: Map<BoardId, BoardMesh> = new Map();
  private lightOrbs: Map<BoardId, LightOrb> = new Map();
  private tableMesh!: THREE.Mesh;

  private activeBoard: BoardId | null = null;
  private playerBoard: BoardId | null = null;
  private patternStartTime = 0;
  private sessionStartTime = 0;
  private currentClickedOrder: PiecePosition[] = [];
  private lightChangeTimeout: ReturnType<typeof setTimeout> | null = null;
  private sessionCheckInterval: ReturnType<typeof setInterval> | null = null;
  private patternCheckInterval: ReturnType<typeof setInterval> | null = null;

  private switchEvents: SwitchEvent[] = [];
  private patternCompletions: PatternCompletion[] = [];
  private lastLightChangeTime = 0;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private ambientLight!: THREE.AmbientLight;
  private isSessionActive = false;

  constructor(container: HTMLElement, callbacks: FlexibilitySceneCallbacks = {}) {
    super({ container, cameraType: 'fixed-front' });
    this.callbacks = callbacks;
    // Adjust camera for better view of the tabletop scene
    this.camera.position.set(0, 6, 10);
    this.camera.lookAt(0, 0, 0);
  }

  protected onInit(): void {
    this.createTabletop();
    this.createBoards();
    this.createLightOrbs();
    this.setupInteraction();
  }

  protected onUpdate(_delta: number): void {
    // Animate pieces on active board
    if (this.activeBoard && this.playerBoard === this.activeBoard) {
      const board = this.boards.get(this.activeBoard);
      if (board) {
        const elapsed = performance.now() - this.patternStartTime;
        const remaining = Math.max(0, PATTERN_TIME_LIMIT_MS - elapsed);
        this.callbacks.onPatternTimerUpdate?.(remaining);

        // Pulse lit pieces
        for (const piece of board.pieces) {
          if (piece.isLit) {
            const pulse = 0.7 + Math.sin(performance.now() * 0.008) * 0.3;
            piece.material.emissiveIntensity = pulse;
          }
        }
      }
    }

    // Animate light orbs
    for (const orb of this.lightOrbs.values()) {
      if (orb.isActive) {
        const pulse = 0.8 + Math.sin(performance.now() * 0.005) * 0.2;
        orb.material.opacity = pulse;
      }
    }

    // Smooth ambient light transition when active board changes
    if (this.activeBoard && this.ambientLight) {
      const rule = getBoardRule(this.activeBoard);
      const targetColor = new THREE.Color(rule.color);
      this.ambientLight.color.lerp(targetColor, 0.02);
    }
  }

  // -------------------------------------------------------------------------
  // Environment
  // -------------------------------------------------------------------------

  private createTabletop(): void {
    const geo = new THREE.BoxGeometry(12, 0.5, 10);
    const mat = new THREE.MeshStandardMaterial({
      color: TABLE_COLOR,
      roughness: 0.7,
      metalness: 0.2,
    });
    this.tableMesh = new THREE.Mesh(geo, mat);
    this.tableMesh.position.y = -0.25;
    this.scene.add(this.tableMesh);

    // Add ambient light reference for dynamic color transitions
    // The base ambient is already added by SceneBase; we reference it
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.AmbientLight) {
        this.ambientLight = obj;
      }
    });
  }

  private createBoards(): void {
    for (const rule of BOARD_RULES) {
      const group = new THREE.Group();
      const pos = BOARD_LAYOUT[rule.id];
      group.position.copy(pos);

      // Board surface
      const surfaceGeo = new THREE.BoxGeometry(SURFACE_SIZE, 0.15, SURFACE_SIZE);
      const surfaceMat = new THREE.MeshStandardMaterial({
        color: SURFACE_COLOR,
        roughness: 0.5,
        metalness: 0.3,
        emissive: rule.color,
        emissiveIntensity: 0.05,
      });
      const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
      surface.position.y = 0.075;
      group.add(surface);

      // Board label ring (colored border)
      const ringGeo = new THREE.RingGeometry(SURFACE_SIZE * 0.55, SURFACE_SIZE * 0.6, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: rule.color,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.16;
      group.add(ring);

      // Pieces
      const pieces: PieceMesh[] = [];
      const pieceCount = rule.order.length === 3 ? 4 : 4; // Board D has 4 pieces but only 3 in pattern

      for (let i = 0; i < pieceCount; i++) {
        const offset = PIECE_OFFSETS[i];
        const pieceGeo = new THREE.OctahedronGeometry(PIECE_SIZE, 0);
        const pieceMat = new THREE.MeshStandardMaterial({
          color: PIECE_BASE_COLOR,
          emissive: PIECE_BASE_COLOR,
          emissiveIntensity: UNLIT_INTENSITY,
          roughness: 0.3,
          metalness: 0.5,
        });
        const mesh = new THREE.Mesh(pieceGeo, pieceMat);
        mesh.position.set(offset.x, PIECE_HEIGHT / 2 + 0.15, offset.z);
        mesh.userData = { boardId: rule.id, pieceIndex: i };
        group.add(mesh);

        pieces.push({
          mesh,
          material: pieceMat,
          baseColor: PIECE_BASE_COLOR,
          isLit: false,
        });
      }

      this.scene.add(group);
      this.boards.set(rule.id, {
        rule,
        group,
        surface,
        surfaceMaterial: surfaceMat,
        pieces,
        position: pos.clone(),
      });
    }
  }

  private createLightOrbs(): void {
    for (const rule of BOARD_RULES) {
      const pos = LIGHT_ORB_POSITIONS[rule.id];
      const geo = new THREE.SphereGeometry(0.25, 16, 16);
      const mat = new THREE.MeshBasicMaterial({
        color: rule.color,
        transparent: true,
        opacity: 0.2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.userData = { boardId: rule.id, isLightOrb: true };
      this.scene.add(mesh);

      // Glow halo
      const haloGeo = new THREE.SphereGeometry(0.4, 16, 16);
      const haloMat = new THREE.MeshBasicMaterial({
        color: rule.color,
        transparent: true,
        opacity: 0.1,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.copy(pos);
      this.scene.add(halo);

      this.lightOrbs.set(rule.id, {
        mesh,
        material: mat,
        baseColor: rule.color,
        boardId: rule.id,
        isActive: false,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Interaction
  // -------------------------------------------------------------------------

  private setupInteraction(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousedown', this.handleClick);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  private handleClick = (event: MouseEvent): void => {
    if (!this.isSessionActive) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes: THREE.Object3D[] = [];
    for (const board of this.boards.values()) {
      for (const piece of board.pieces) {
        meshes.push(piece.mesh);
      }
    }
    const intersects = this.raycaster.intersectObjects(meshes);

    if (intersects.length === 0) return;

    const hit = intersects[0].object;
    const boardId = hit.userData.boardId as BoardId;
    const pieceIndex = hit.userData.pieceIndex as number;

    this.handlePieceClick(boardId, pieceIndex);
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.isSessionActive) return;
    if (!isBoardKey(event.key)) return;

    const boardId = KEY_TO_BOARD[event.key.toLowerCase()];
    this.handleBoardSwitch(boardId);
  };

  private handleBoardSwitch(boardId: BoardId): void {
    const previousBoard = this.playerBoard;
    this.playerBoard = boardId;

    // Record switch event
    const isActive = this.activeBoard === boardId;
    let reactionTimeMs = 0;

    if (this.activeBoard && this.lastLightChangeTime > 0) {
      reactionTimeMs = performance.now() - this.lastLightChangeTime;
    }

    const switchEvent: SwitchEvent = {
      timestamp: performance.now(),
      fromBoard: previousBoard,
      toBoard: boardId,
      firstKeypressBoard: boardId,
      reactionTimeMs,
      isCorrectFirstSwitch: isActive,
    };

    this.switchEvents.push(switchEvent);
    this.callbacks.onSwitchEvent?.(switchEvent);

    // Reset pattern if switching to active board
    if (this.activeBoard === boardId) {
      this.startPattern();
    } else {
      // Switched to wrong board - clear lit pieces on previous player board
      this.clearLitPieces(previousBoard);
    }
  }

  private handlePieceClick(boardId: BoardId, pieceIndex: number): void {
    // Player must be on this board to click pieces
    if (this.playerBoard !== boardId) return;
    // Board must be active
    if (this.activeBoard !== boardId) return;

    const board = this.boards.get(boardId);
    if (!board) return;

    const piece = board.pieces[pieceIndex];
    if (!piece || piece.isLit) return;

    // Light up the piece
    piece.isLit = true;
    piece.material.color.setHex(board.rule.color);
    piece.material.emissive.setHex(board.rule.color);
    piece.material.emissiveIntensity = LIT_INTENSITY;

    this.currentClickedOrder.push(pieceIndex as PiecePosition);
    this.callbacks.onPieceClick?.(boardId, pieceIndex, this.currentClickedOrder);

    // Check if pattern is complete
    const rule = board.rule;
    if (this.currentClickedOrder.length >= rule.order.length) {
      this.completePattern(boardId);
    }
  }

  // -------------------------------------------------------------------------
  // Pattern management
  // -------------------------------------------------------------------------

  private startPattern(): void {
    this.currentClickedOrder = [];
    this.patternStartTime = performance.now();

    if (this.patternCheckInterval) {
      clearInterval(this.patternCheckInterval);
    }

    this.patternCheckInterval = setInterval(() => {
      if (!this.activeBoard || !this.isSessionActive) return;

      const elapsed = performance.now() - this.patternStartTime;
      if (elapsed >= PATTERN_TIME_LIMIT_MS) {
        // Timeout - reset pattern
        this.failPattern();
      }
    }, 100);
  }

  private completePattern(boardId: BoardId): void {
    if (!this.activeBoard) return;

    const board = this.boards.get(boardId);
    if (!board) return;

    const elapsed = performance.now() - this.patternStartTime;
    const isCompleted = validatePattern(this.currentClickedOrder, board.rule.order);
    const isWithinTime = isPatternCompletedWithinTime(elapsed);

    const completion: PatternCompletion = {
      timestamp: performance.now(),
      boardId,
      clickedOrder: [...this.currentClickedOrder],
      correctOrder: [...board.rule.order],
      isCompleted,
      timeElapsedMs: Math.round(elapsed),
      isWithinTime,
    };

    this.patternCompletions.push(completion);
    this.callbacks.onPatternComplete?.(completion);

    // Reset for next pattern (same board stays active)
    this.clearLitPieces(boardId);
    this.startPattern();
  }

  private failPattern(): void {
    if (!this.activeBoard) return;

    const board = this.boards.get(this.activeBoard);
    if (!board) return;

    const completion: PatternCompletion = {
      timestamp: performance.now(),
      boardId: this.activeBoard,
      clickedOrder: [...this.currentClickedOrder],
      correctOrder: [...board.rule.order],
      isCompleted: false,
      timeElapsedMs: PATTERN_TIME_LIMIT_MS,
      isWithinTime: false,
    };

    this.patternCompletions.push(completion);
    this.callbacks.onPatternComplete?.(completion);

    // Clear and restart
    this.clearLitPieces(this.activeBoard);
    this.startPattern();
  }

  private clearLitPieces(boardId: BoardId | null): void {
    if (!boardId) return;
    const board = this.boards.get(boardId);
    if (!board) return;

    for (const piece of board.pieces) {
      piece.isLit = false;
      piece.material.color.setHex(PIECE_BASE_COLOR);
      piece.material.emissive.setHex(PIECE_BASE_COLOR);
      piece.material.emissiveIntensity = UNLIT_INTENSITY;
    }
  }

  // -------------------------------------------------------------------------
  // Light orb management
  // -------------------------------------------------------------------------

  private setActiveLight(boardId: BoardId): void {
    // Deactivate previous
    if (this.activeBoard) {
      const prevOrb = this.lightOrbs.get(this.activeBoard);
      if (prevOrb) {
        prevOrb.isActive = false;
        prevOrb.material.opacity = 0.2;
      }
      // Dim previous board surface
      const prevBoard = this.boards.get(this.activeBoard);
      if (prevBoard) {
        prevBoard.surfaceMaterial.emissiveIntensity = 0.05;
      }
    }

    // Activate new
    this.activeBoard = boardId;
    this.lastLightChangeTime = performance.now();

    const orb = this.lightOrbs.get(boardId);
    if (orb) {
      orb.isActive = true;
      orb.material.opacity = 0.9;
    }

    // Highlight active board surface
    const board = this.boards.get(boardId);
    if (board) {
      board.surfaceMaterial.emissiveIntensity = 0.25;
    }

    this.callbacks.onActiveBoardChange?.(boardId);

    // If player is already on this board, start pattern immediately
    if (this.playerBoard === boardId) {
      this.startPattern();
    }
  }

  private scheduleLightChange(): void {
    const delay = generateLightChangeInterval();
    this.lightChangeTimeout = setTimeout(() => {
      if (!this.isSessionActive) return;
      const newBoard = generateRandomBoard(this.activeBoard ?? undefined);
      this.setActiveLight(newBoard);
      this.scheduleLightChange();
    }, delay);
  }

  // -------------------------------------------------------------------------
  // Session management
  // -------------------------------------------------------------------------

  startTraining(): void {
    this.isSessionActive = true;
    this.sessionStartTime = performance.now();
    this.switchEvents = [];
    this.patternCompletions = [];

    // Start first light
    const firstBoard = generateRandomBoard();
    this.setActiveLight(firstBoard);

    // Schedule subsequent light changes
    this.scheduleLightChange();

    // Session timer
    this.sessionCheckInterval = setInterval(() => {
      const now = performance.now();
      const remaining = Math.max(0, SESSION_DURATION_MS - (now - this.sessionStartTime));
      this.callbacks.onSessionTimerUpdate?.(remaining);

      if (isSessionOver(this.sessionStartTime, now)) {
        this.endSession();
      }
    }, 100);
  }

  private endSession(): void {
    this.isSessionActive = false;

    if (this.lightChangeTimeout) {
      clearTimeout(this.lightChangeTimeout);
      this.lightChangeTimeout = null;
    }
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
      this.sessionCheckInterval = null;
    }
    if (this.patternCheckInterval) {
      clearInterval(this.patternCheckInterval);
      this.patternCheckInterval = null;
    }

    const metrics = calculateSessionMetrics(this.switchEvents, this.patternCompletions);
    this.callbacks.onSessionComplete?.(metrics);
  }

  // -------------------------------------------------------------------------
  // Board state queries
  // -------------------------------------------------------------------------

  getActiveBoard(): BoardId | null {
    return this.activeBoard;
  }

  getPlayerBoard(): BoardId | null {
    return this.playerBoard;
  }

  getBoardRules(): BoardRule[] {
    return BOARD_RULES;
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  override dispose(): void {
    if (this.lightChangeTimeout) {
      clearTimeout(this.lightChangeTimeout);
    }
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
    }
    if (this.patternCheckInterval) {
      clearInterval(this.patternCheckInterval);
    }
    this.renderer.domElement.removeEventListener('click', this.handleClick);
    document.removeEventListener('keydown', this.handleKeyDown);
    super.dispose();
  }
}
