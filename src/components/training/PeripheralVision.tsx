import { useRef, useState, useEffect, useCallback } from 'react';
import { PeripheralSceneFPS, PeripheralSceneMOBA } from '../../modules/d4-peripheral/scene';
import {
  calculateScore,
  calculateEdgeDetectionRate,
  calculateEdgeReactionTime,
  calculateGrade,
  calculateCapacityLevel,
  type PeripheralStats,
} from '../../modules/d4-peripheral/logic';
import { saveTrainingSession } from '../../lib/training';

type Version = 'fps' | 'moba';
type TargetKind = 'center' | 'edge';

interface Props {
  locale: 'en' | 'zh';
  onComplete?: (score: number) => void;
}

const STR = {
  en: {
    title: 'D4 Peripheral Vision',
    fps: 'FPS',
    moba: 'MOBA',
    versionSelect: 'Select Version',
    start: 'Click to Start',
    restart: 'Restart',
    score: 'Score',
    misses: 'Misses',
    difficulty: 'Level',
    edgeRate: 'Edge Rate',
    maxSim: 'Max Simultaneous',
    edgeReact: 'Edge React',
    complete: 'Game Over',
    grade: 'Grade',
    capacity: 'Capacity',
    saving: 'Saving...',
    saved: 'Saved!',
    fpsDesc: 'Shoot center & edge targets. Edge targets flash briefly — use peripheral vision!',
    mobaDesc: 'Monsters spawn from all directions. Click to eliminate before they reach the tower!',
    towerHP: 'Tower HP',
    exit: 'Exit',
    locked: 'Click to lock mouse',
    clickStart: 'Click to start',
  },
  zh: {
    title: 'D4 外围视觉',
    fps: 'FPS',
    moba: 'MOBA',
    versionSelect: '选择版本',
    start: '点击开始',
    restart: '重新开始',
    score: '得分',
    misses: '失误',
    difficulty: '等级',
    edgeRate: '边缘检测率',
    maxSim: '同时处理',
    edgeReact: '边缘反应',
    complete: '游戏结束',
    grade: '评级',
    capacity: '能力等级',
    saving: '保存中...',
    saved: '已保存！',
    fpsDesc: '射击中央和边缘目标。边缘目标一闪即逝——用余光捕捉！',
    mobaDesc: '怪物从四面八方出现，在它们到达塔之前点击消灭！',
    towerHP: '塔生命',
    exit: '退出',
    locked: '点击锁定鼠标',
    clickStart: '点击开始',
  },
};

export default function PeripheralVision({ locale, onComplete }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fpsSceneRef = useRef<PeripheralSceneFPS | null>(null);
  const mobaSceneRef = useRef<PeripheralSceneMOBA | null>(null);
  const startTimeRef = useRef<number>(0);
  const edgeHitsRef = useRef<number>(0);
  const edgeAppearancesRef = useRef<number>(0);
  const missesRef = useRef<number>(0);
  const maxSimRef = useRef<number>(0);
  const edgeReactionTimesRef = useRef<number[]>([]);
  const [, setVersion] = useState<Version>('fps');
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [difficulty, setDifficulty] = useState(1);
  const [towerHP, setTowerHP] = useState(3);
  const [edgeHits, setEdgeHits] = useState(0);
  const [edgeAppearances, setEdgeAppearances] = useState(0);
  const [maxSim, setMaxSim] = useState(0);
  const [edgeReactionTimes, setEdgeReactionTimes] = useState<number[]>([]);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const s = STR[locale];

  useEffect(() => {
    const handlePointerLockChange = (): void => {
      setPointerLocked(document.pointerLockElement !== null);
    };
    document.addEventListener('pointerlockchange', handlePointerLockChange);

    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      fpsSceneRef.current?.dispose();
      fpsSceneRef.current = null;
      mobaSceneRef.current?.dispose();
      mobaSceneRef.current = null;
    };
  }, []);

  const buildStats = useCallback((): PeripheralStats => {
    return {
      centerHits: score,
      edgeHits,
      edgeAppearances,
      misses,
      maxSimultaneous: maxSim,
      edgeReactionTimes,
    };
  }, [score, edgeHits, edgeAppearances, misses, maxSim, edgeReactionTimes]);

  const handleStart = useCallback(() => {
    if (!containerRef.current || !selectedVersion) return;
    setStarted(true);
    setDone(false);
    setSaving(false);
    setSaved(false);
    setScore(0);
    setMisses(0);
    setDifficulty(1);
    setTowerHP(3);
    setEdgeHits(0);
    setEdgeAppearances(0);
    setMaxSim(0);
    setEdgeReactionTimes([]);
    setPointerLocked(false);
    startTimeRef.current = Date.now();
    edgeHitsRef.current = 0;
    edgeAppearancesRef.current = 0;
    missesRef.current = 0;
    maxSimRef.current = 0;
    edgeReactionTimesRef.current = [];

    fpsSceneRef.current?.dispose();
    fpsSceneRef.current = null;
    mobaSceneRef.current?.dispose();
    mobaSceneRef.current = null;

    const callbacks = {
      onScore: (s: number) => setScore(s),
      onMiss: (m: number) => {
        setMisses(m);
        missesRef.current = m;
      },
      onHit: (kind: TargetKind, reactionTime: number) => {
        if (kind === 'edge') {
          setEdgeHits((h) => h + 1);
          edgeHitsRef.current += 1;
          setEdgeReactionTimes((prev) => [...prev, reactionTime]);
          edgeReactionTimesRef.current = [...edgeReactionTimesRef.current, reactionTime];
        }
      },
      onDifficultyChange: (level: number) => setDifficulty(level),
      onEdgeAppear: (total: number) => {
        setEdgeAppearances(total);
        edgeAppearancesRef.current = total;
      },
      onGameOver: (finalScore: number) => {
        setDone(true);
        const durationMs = Date.now() - startTimeRef.current;
        const eRate =
          edgeAppearancesRef.current > 0
            ? calculateEdgeDetectionRate(edgeHitsRef.current, edgeAppearancesRef.current)
            : 0;
        const avgER =
          edgeReactionTimesRef.current.length > 0
            ? calculateEdgeReactionTime(edgeReactionTimesRef.current)
            : 0;

        setSaving(true);
        saveTrainingSession({
          dimensionId: 4,
          version: selectedVersion ?? 'fps',
          totalScore: finalScore,
          groups: [
            {
              groupIndex: 1,
              score: finalScore,
              subMetrics: {
                edgeDetectionRate: Math.round(eRate * 100),
                avgEdgeReactionTime: avgER,
                maxSimultaneous: maxSimRef.current,
                edgeHits: edgeHitsRef.current,
                misses: missesRef.current,
              },
            },
          ],
          durationMs,
        })
          .then(() => {
            setSaving(false);
            setSaved(true);
          })
          .catch(() => {
            setSaving(false);
          });

        onComplete?.(finalScore);
      },
      onTowerHP: (hp: number) => setTowerHP(hp),
      onMaxSimultaneous: (count: number) => {
        setMaxSim(count);
        maxSimRef.current = Math.max(maxSimRef.current, count);
      },
    };

    if (selectedVersion === 'fps') {
      fpsSceneRef.current = new PeripheralSceneFPS(containerRef.current, callbacks);
      fpsSceneRef.current.start();
    } else {
      mobaSceneRef.current = new PeripheralSceneMOBA(containerRef.current, callbacks);
      mobaSceneRef.current.start();
    }
  }, [onComplete, selectedVersion]);

  const handleVersionSelect = (v: Version): void => {
    setSelectedVersion(v);
    setVersion(v);
  };

  const edgeRate = edgeAppearances > 0 ? calculateEdgeDetectionRate(edgeHits, edgeAppearances) : 0;
  const avgEdgeReact =
    edgeReactionTimes.length > 0 ? calculateEdgeReactionTime(edgeReactionTimes) : 0;
  const finalStats = buildStats();
  const finalScore = done ? calculateScore(finalStats) : null;
  const grade = finalScore !== null ? calculateGrade(finalScore) : null;
  const capacity = done ? calculateCapacityLevel(edgeRate, maxSim) : null;

  const capacityDisplay: Record<string, { en: string; zh: string }> = {
    pro: { en: 'Pro', zh: '职业' },
    expert: { en: 'Expert', zh: '高手' },
    average: { en: 'Average', zh: '普通' },
    beginner: { en: 'Beginner', zh: '新手' },
  };

  return (
    <div className="training-module">
      <div className="training-canvas" ref={containerRef} />

      {started && !done && (
        <div className="training-hud">
          <div className="hud-top">
            <div className="hud-item">
              <span className="hud-label">{s.score}</span>
              <span className="hud-value hud-score">{score}</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.misses}</span>
              <span className="hud-value hud-miss">{misses}/3</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.difficulty}</span>
              <span className="hud-value">{difficulty}</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.edgeRate}</span>
              <span className="hud-value">{Math.round(edgeRate * 100)}%</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.maxSim}</span>
              <span className="hud-value">{maxSim}</span>
            </div>
            {selectedVersion === 'moba' && (
              <div className="hud-item">
                <span className="hud-label">{s.towerHP}</span>
                <span className="hud-value hud-hp">{towerHP}/3</span>
              </div>
            )}
          </div>

          {selectedVersion === 'fps' && !pointerLocked && (
            <div className="hud-center">
              <div className="phase-msg phase-wait">{s.locked}</div>
            </div>
          )}
        </div>
      )}

      {!started && (
        <div className="training-overlay">
          <div className="overlay-content">
            <h2 className="overlay-title">{s.title}</h2>
            {!selectedVersion ? (
              <>
                <p className="overlay-desc">{s.versionSelect}</p>
                <div className="version-selector">
                  <button className="version-btn" onClick={() => handleVersionSelect('fps')}>
                    {s.fps}
                  </button>
                  <button className="version-btn" onClick={() => handleVersionSelect('moba')}>
                    {s.moba}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="version-badge">{selectedVersion === 'fps' ? s.fps : s.moba}</div>
                <p className="overlay-desc">{selectedVersion === 'fps' ? s.fpsDesc : s.mobaDesc}</p>
                <button className="overlay-btn" onClick={handleStart}>
                  {s.start}
                </button>
                <button className="version-change-btn" onClick={() => setSelectedVersion(null)}>
                  {s.versionSelect}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {done && (
        <div className="training-overlay result-overlay">
          <div className="overlay-content">
            <h2 className="overlay-title">{s.complete}</h2>
            {(saving || saved) && (
              <div className={`save-status ${saved ? 'saved' : ''}`}>
                {saving ? s.saving : s.saved}
              </div>
            )}
            <div className="result-grid">
              <div className="result-item">
                <span className="result-label">{s.score}</span>
                <span className="result-value result-score">{finalScore}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.grade}</span>
                <span className="result-value result-grade">{grade}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.edgeRate}</span>
                <span className="result-value">{Math.round(edgeRate * 100)}%</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.maxSim}</span>
                <span className="result-value">{maxSim}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.edgeReact}</span>
                <span className="result-value">{avgEdgeReact > 0 ? `${avgEdgeReact}ms` : '—'}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.misses}</span>
                <span className="result-value">{misses}</span>
              </div>
            </div>
            {capacity && (
              <div className="capacity-badge">
                {s.capacity}: {capacityDisplay[capacity]?.[locale] ?? capacity}
              </div>
            )}
            <button className="overlay-btn" onClick={handleStart}>
              {s.restart}
            </button>
          </div>
        </div>
      )}

      <style>{`
        .training-module {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: #161618;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .training-canvas {
          width: 100%;
          height: 100%;
        }
        .training-canvas canvas {
          display: block;
          width: 100% !important;
          height: 100% !important;
        }
        .training-hud {
          position: absolute;
          inset: 0;
          pointer-events: none;
          display: flex;
          flex-direction: column;
        }
        .hud-top {
          display: flex;
          justify-content: center;
          gap: 28px;
          padding: 16px;
          background: rgba(22,22,24,0.6);
          backdrop-filter: blur(8px);
          flex-wrap: wrap;
        }
        .hud-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .hud-label {
          font-size: 0.7rem;
          color: #7A7A82;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .hud-value {
          font-size: 1.1rem;
          font-weight: 700;
          color: #E8E8E8;
        }
        .hud-score { color: #FFD700; }
        .hud-miss { color: #FF4500; }
        .hud-hp { color: #FF4500; }
        .hud-center {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .phase-msg {
          font-size: 1.4rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .phase-wait { color: #4488ff; }
        .training-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(22,22,24,0.9);
          backdrop-filter: blur(12px);
        }
        .overlay-content {
          text-align: center;
          max-width: 520px;
          padding: 40px;
        }
        .overlay-title {
          font-family: Impact, 'Oswald', sans-serif;
          font-size: 2.5rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: #FF4500;
          margin-bottom: 12px;
        }
        .overlay-desc {
          color: #7A7A82;
          margin-bottom: 28px;
          font-size: 1rem;
          line-height: 1.5;
        }
        .version-selector {
          display: flex;
          gap: 16px;
          justify-content: center;
          margin-bottom: 20px;
        }
        .version-btn {
          padding: 16px 48px;
          border-radius: 4px;
          border: 2px solid #FF4500;
          background: transparent;
          color: #FF4500;
          font-weight: 700;
          font-size: 1.1rem;
          cursor: pointer;
          transition: all 0.2s;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .version-btn:hover {
          background: #FF4500;
          color: #fff;
          box-shadow: 0 0 20px rgba(255,69,0,0.5);
        }
        .version-badge {
          display: inline-block;
          padding: 4px 16px;
          border: 1px solid #FFD700;
          color: #FFD700;
          font-weight: 700;
          font-size: 0.85rem;
          border-radius: 3px;
          margin-bottom: 16px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .version-change-btn {
          display: block;
          margin: 16px auto 0;
          background: transparent;
          border: none;
          color: #7A7A82;
          font-size: 0.8rem;
          cursor: pointer;
          text-decoration: underline;
          transition: color 0.2s;
        }
        .version-change-btn:hover { color: #E8E8E8; }
        .overlay-btn {
          padding: 14px 40px;
          border-radius: 4px;
          border: 2px solid #FF4500;
          background: #FF4500;
          color: #fff;
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.2s;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .overlay-btn:hover {
          box-shadow: 0 0 20px rgba(255,69,0,0.5);
          transform: scale(1.05);
        }
        .result-overlay { cursor: default; }
        .result-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 20px;
        }
        .result-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .result-label {
          font-size: 0.7rem;
          color: #7A7A82;
          text-transform: uppercase;
        }
        .result-value {
          font-size: 1.4rem;
          font-weight: 700;
          color: #E8E8E8;
        }
        .result-score {
          color: #FFD700;
          font-size: 2rem;
        }
        .result-grade {
          color: #FF4500;
          font-size: 2rem;
          font-family: Impact, sans-serif;
        }
        .capacity-badge {
          display: inline-block;
          padding: 6px 20px;
          border: 1px solid #FFD700;
          border-radius: 20px;
          color: #FFD700;
          font-weight: 600;
          font-size: 0.9rem;
          margin-bottom: 24px;
        }
        .save-status {
          font-size: 0.85rem;
          color: #7A7A82;
          margin-bottom: 16px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .save-status.saved {
          color: #4CAF50;
        }
      `}</style>
    </div>
  );
}
