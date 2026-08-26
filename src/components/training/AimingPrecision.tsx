import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { AimingScene } from '../../modules/d2-aim/scene';
import {
  calculateScore,
  calculateHeadshotRate,
  calculateAvgAimTime,
  calculateHitMissRatio,
  calculateGrade,
  MAX_MISSES,
  type HitResult,
} from '../../modules/d2-aim/logic';
import { saveTrainingSession } from '../../lib/training';

interface Props {
  locale: 'en' | 'zh';
  onComplete?: (score: number) => void;
}

const STR = {
  en: {
    start: 'Click to Start',
    restart: 'Restart',
    clickToLock: 'Click to Lock Mouse',
    clickToLockDesc: 'Click anywhere to lock your mouse and begin',
    score: 'Score',
    target: 'Target',
    misses: 'Misses',
    level: 'Level',
    headshotRate: 'Headshot',
    avgAim: 'Avg Aim',
    hitMiss: 'H/M Ratio',
    complete: 'Session Complete',
    gameOver: 'Game Over',
    targetsHit: 'Targets Hit',
    grade: 'Grade',
    ms: 'ms',
    saving: 'Saving...',
    saved: 'Saved!',
    paused: 'Paused',
    instruction:
      'Single-shot precision training. Aim for headshots on 3D humanoid targets. 3 misses ends the session.',
  },
  zh: {
    start: '点击开始',
    restart: '重新开始',
    clickToLock: '点击锁定鼠标',
    clickToLockDesc: '点击任意位置锁定鼠标并开始',
    score: '得分',
    target: '目标',
    misses: '脱靶',
    level: '难度',
    headshotRate: '爆头率',
    avgAim: '平均瞄准',
    hitMiss: '命中比',
    complete: '训练完成',
    gameOver: '游戏结束',
    targetsHit: '命中数',
    grade: '评级',
    ms: 'ms',
    saving: '保存中...',
    saved: '已保存！',
    paused: '已暂停',
    instruction: '单发精准训练。瞄准3D人形靶头部。3次脱靶结束训练。',
  },
};

export default function AimingPrecision({ locale, onComplete }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<AimingScene | null>(null);
  const startTimeRef = useRef<number>(0);
  const [started, setStarted] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [done, setDone] = useState(false);
  const [hits, setHits] = useState<HitResult[]>([]);
  const [misses, setMisses] = useState(0);
  const [targetIdx, setTargetIdx] = useState(0);
  const [difficulty, setDifficulty] = useState(0);
  const [isOver, setIsOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const s = STR[locale];

  useEffect(() => {
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  const handleStart = useCallback(() => {
    if (!containerRef.current) return;
    setStarted(true);
    setDone(false);
    setIsOver(false);
    setSaving(false);
    setSaved(false);
    setHits([]);
    setMisses(0);
    setTargetIdx(0);
    setDifficulty(0);
    startTimeRef.current = Date.now();
    sceneRef.current?.dispose();
    sceneRef.current = new AimingScene(containerRef.current, {
      onHit: (hit) => {
        setHits((prev) => [...prev, hit]);
      },
      onMiss: (count) => {
        setMisses(count);
      },
      onTargetSpawn: (idx) => {
        setTargetIdx(idx);
      },
      onPointerLockChange: (locked) => {
        setIsLocked(locked);
      },
      onDifficultyChange: (level) => {
        setDifficulty(level);
      },
      onGameOver: (allHits, allMisses) => {
        setDone(true);
        setIsOver(allMisses >= MAX_MISSES);
        setHits(allHits);
        setMisses(allMisses);
        const finalScore = calculateScore(allHits);
        const hsRate = calculateHeadshotRate(allHits);
        const avgAimTime = calculateAvgAimTime(allHits);
        const hmRatio = calculateHitMissRatio(allHits, allMisses);
        const durationMs = Date.now() - startTimeRef.current;

        setSaving(true);
        saveTrainingSession({
          dimensionId: 2,
          version: 'fps',
          totalScore: finalScore,
          groups: [
            {
              groupIndex: 1,
              score: finalScore,
              subMetrics: {
                headshotRate: hsRate,
                avgAimTime,
                hitMissRatio: Math.round(hmRatio * 100) / 100,
                targetsHit: allHits.length,
                misses: allMisses,
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
    });
    sceneRef.current.start();
  }, [onComplete]);

  const score = useMemo(() => calculateScore(hits), [hits]);
  const headshotRate = useMemo(() => calculateHeadshotRate(hits), [hits]);
  const avgAim = useMemo(() => calculateAvgAimTime(hits), [hits]);
  const hitMissRatio = useMemo(() => calculateHitMissRatio(hits, misses), [hits, misses]);
  const grade = done ? calculateGrade(score) : null;

  return (
    <div className="training-module">
      <div className="training-canvas" ref={containerRef} />

      {started && isLocked && !done && (
        <>
          <div className="crosshair">
            <div className="ch-line ch-top" />
            <div className="ch-line ch-bottom" />
            <div className="ch-line ch-left" />
            <div className="ch-line ch-right" />
            <div className="ch-dot" />
          </div>
          <div className="training-hud">
            <div className="hud-top">
              <div className="hud-item">
                <span className="hud-label">{s.score}</span>
                <span className="hud-value hud-score">{score}</span>
              </div>
              <div className="hud-item">
                <span className="hud-label">{s.target}</span>
                <span className="hud-value">{targetIdx + 1}</span>
              </div>
              <div className="hud-item">
                <span className="hud-label">{s.misses}</span>
                <span className="hud-value hud-misses">
                  {misses}/{MAX_MISSES}
                </span>
              </div>
              <div className="hud-item">
                <span className="hud-label">{s.level}</span>
                <span className="hud-value">{difficulty}</span>
              </div>
            </div>
            <div className="hud-sub">
              <div className="hud-item">
                <span className="hud-label">{s.headshotRate}</span>
                <span className="hud-value">{headshotRate}%</span>
              </div>
              <div className="hud-item">
                <span className="hud-label">{s.avgAim}</span>
                <span className="hud-value">{avgAim > 0 ? `${avgAim}${s.ms}` : '—'}</span>
              </div>
              <div className="hud-item">
                <span className="hud-label">{s.hitMiss}</span>
                <span className="hud-value">
                  {hitMissRatio > 0 ? hitMissRatio.toFixed(2) : '—'}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {!started && (
        <div className="training-overlay" onClick={handleStart}>
          <div className="overlay-content">
            <h2 className="overlay-title">
              D2 {locale === 'en' ? 'Aiming Precision' : '瞄准精度'}
            </h2>
            <p className="overlay-desc">{s.instruction}</p>
            <button className="overlay-btn">{s.start}</button>
          </div>
        </div>
      )}

      {started && !isLocked && !done && (
        <div className="training-overlay click-to-lock">
          <div className="overlay-content">
            <h2 className="overlay-title">{s.clickToLock}</h2>
            <p className="overlay-desc">{s.clickToLockDesc}</p>
          </div>
        </div>
      )}

      {done && (
        <div className="training-overlay result-overlay">
          <div className="overlay-content">
            <h2 className="overlay-title">{isOver ? s.gameOver : s.complete}</h2>
            {(saving || saved) && (
              <div className={`save-status ${saved ? 'saved' : ''}`}>
                {saving ? s.saving : s.saved}
              </div>
            )}
            <div className="result-grid">
              <div className="result-item">
                <span className="result-label">{s.score}</span>
                <span className="result-value result-score">{score}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.grade}</span>
                <span className="result-value result-grade">{grade}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.targetsHit}</span>
                <span className="result-value">{hits.length}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.headshotRate}</span>
                <span className="result-value">{headshotRate}%</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.avgAim}</span>
                <span className="result-value">{avgAim > 0 ? `${avgAim}${s.ms}` : '—'}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.hitMiss}</span>
                <span className="result-value">
                  {hitMissRatio > 0 ? hitMissRatio.toFixed(2) : '—'}
                </span>
              </div>
            </div>
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
        .crosshair {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          pointer-events: none;
          z-index: 100;
        }
        .ch-line {
          position: absolute;
          background: #E8E8E8;
          box-shadow: 0 0 3px rgba(0,0,0,0.9);
        }
        .ch-top, .ch-bottom {
          width: 2px;
          height: 8px;
          left: -1px;
        }
        .ch-top { top: -14px; }
        .ch-bottom { top: 6px; }
        .ch-left, .ch-right {
          width: 8px;
          height: 2px;
          top: -1px;
        }
        .ch-left { left: -14px; }
        .ch-right { left: 6px; }
        .ch-dot {
          position: absolute;
          width: 2px;
          height: 2px;
          background: #FF4500;
          border-radius: 50%;
          top: -1px;
          left: -1px;
          box-shadow: 0 0 4px rgba(255,69,0,0.6);
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
          gap: 36px;
          padding: 16px;
          background: rgba(22,22,24,0.6);
          backdrop-filter: blur(8px);
        }
        .hud-sub {
          display: flex;
          justify-content: center;
          gap: 36px;
          padding: 8px 16px;
          background: rgba(22,22,24,0.4);
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
        .hud-misses { color: #FF4500; }
        .training-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(22,22,24,0.85);
          backdrop-filter: blur(12px);
          cursor: pointer;
        }
        .click-to-lock {
          pointer-events: none;
        }
        .overlay-content {
          text-align: center;
          max-width: 500px;
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
        .result-overlay {
          cursor: default;
        }
        .result-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 28px;
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
