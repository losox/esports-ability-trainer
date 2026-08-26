import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { TrackingScene } from '../../modules/d3-tracking/scene';
import {
  calculateScore,
  calculateOverallAccuracy,
  calculateAvgKillTime,
  calculateOverallSmoothness,
  calculateGrade,
  MAX_FAILS,
  type KillResult,
} from '../../modules/d3-tracking/logic';
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
    clickToLockDesc: 'Click anywhere to lock your mouse and begin tracking',
    kills: 'Kills',
    fails: 'Fails',
    level: 'Level',
    accuracy: 'Accuracy',
    avgKill: 'Avg Kill',
    smoothness: 'Smoothness',
    health: 'Health',
    time: 'Time',
    complete: 'Session Complete',
    gameOver: 'Game Over',
    grade: 'Grade',
    ms: 'ms',
    saving: 'Saving...',
    saved: 'Saved!',
    instruction:
      'Track moving targets and hold fire to deal damage. Kill targets before time runs out. 3 fails ends the session.',
    hold: 'Hold mouse button to fire',
  },
  zh: {
    start: '点击开始',
    restart: '重新开始',
    clickToLock: '点击锁定鼠标',
    clickToLockDesc: '点击任意位置锁定鼠标并开始追踪',
    kills: '击杀',
    fails: '失败',
    level: '难度',
    accuracy: '命中率',
    avgKill: '平均击杀',
    smoothness: '平滑度',
    health: '血量',
    time: '时间',
    complete: '训练完成',
    gameOver: '游戏结束',
    grade: '评级',
    ms: 'ms',
    saving: '保存中...',
    saved: '已保存！',
    instruction: '追踪移动靶并按住开火造成伤害。在时间结束前击杀目标。3次失败结束训练。',
    hold: '按住鼠标键持续开火',
  },
};

export default function TargetTracking({ locale, onComplete }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<TrackingScene | null>(null);
  const startTimeRef = useRef<number>(0);
  const [started, setStarted] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [done, setDone] = useState(false);
  const [kills, setKills] = useState<KillResult[]>([]);
  const [fails, setFails] = useState(0);
  const [difficulty, setDifficulty] = useState(0);
  const [health, setHealth] = useState(100);
  const [maxHealth, setMaxHealth] = useState(100);
  const [remainingMs, setRemainingMs] = useState(8000);
  const [timeLimit, setTimeLimit] = useState(8000);
  const [accuracy, setAccuracy] = useState(0);
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
    setKills([]);
    setFails(0);
    setDifficulty(0);
    setHealth(100);
    setMaxHealth(100);
    setAccuracy(0);
    startTimeRef.current = Date.now();
    sceneRef.current?.dispose();
    sceneRef.current = new TrackingScene(containerRef.current, {
      onHealthUpdate: (hp, max) => {
        setHealth(hp);
        setMaxHealth(max);
      },
      onKill: (kill) => {
        setKills((prev) => [...prev, kill]);
      },
      onFail: (count) => {
        setFails(count);
      },
      onTimeUpdate: (remaining, limit) => {
        setRemainingMs(remaining);
        setTimeLimit(limit);
      },
      onAccuracyUpdate: (acc) => {
        setAccuracy(acc);
      },
      onPointerLockChange: (locked) => {
        setIsLocked(locked);
      },
      onDifficultyChange: (level) => {
        setDifficulty(level);
      },
      onGameOver: (allKills, allFails) => {
        setDone(true);
        setIsOver(allFails >= MAX_FAILS);
        setKills(allKills);
        setFails(allFails);
        const finalScore = calculateScore(allKills);
        const overallAcc = calculateOverallAccuracy(allKills);
        const avgKT = calculateAvgKillTime(allKills);
        const smooth = calculateOverallSmoothness(allKills);
        const durationMs = Date.now() - startTimeRef.current;

        setSaving(true);
        saveTrainingSession({
          dimensionId: 3,
          version: 'fps',
          totalScore: finalScore,
          groups: [
            {
              groupIndex: 1,
              score: finalScore,
              subMetrics: {
                accuracy: overallAcc,
                avgKillTime: avgKT,
                smoothness: smooth,
                kills: allKills.length,
                fails: allFails,
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

  const score = useMemo(() => calculateScore(kills), [kills]);
  const overallAccuracy = useMemo(() => calculateOverallAccuracy(kills), [kills]);
  const avgKillTime = useMemo(() => calculateAvgKillTime(kills), [kills]);
  const smoothness = useMemo(() => calculateOverallSmoothness(kills), [kills]);
  const grade = done ? calculateGrade(score) : null;
  const healthPercent = maxHealth > 0 ? Math.max(0, (health / maxHealth) * 100) : 0;
  const timePercent = timeLimit > 0 ? Math.max(0, (remainingMs / timeLimit) * 100) : 0;

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
                <span className="hud-label">{s.kills}</span>
                <span className="hud-value hud-score">{score}</span>
              </div>
              <div className="hud-item">
                <span className="hud-label">{s.fails}</span>
                <span className="hud-value hud-fails">
                  {fails}/{MAX_FAILS}
                </span>
              </div>
              <div className="hud-item">
                <span className="hud-label">{s.accuracy}</span>
                <span className="hud-value">{accuracy}%</span>
              </div>
              <div className="hud-item">
                <span className="hud-label">{s.level}</span>
                <span className="hud-value">{difficulty}</span>
              </div>
            </div>
            <div className="hud-bars">
              <div className="bar-group">
                <span className="bar-label">{s.health}</span>
                <div className="bar-track">
                  <div className="bar-fill bar-health" style={{ width: `${healthPercent}%` }} />
                </div>
              </div>
              <div className="bar-group">
                <span className="bar-label">{s.time}</span>
                <div className="bar-track">
                  <div className="bar-fill bar-time" style={{ width: `${timePercent}%` }} />
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {!started && (
        <div className="training-overlay" onClick={handleStart}>
          <div className="overlay-content">
            <h2 className="overlay-title">D3 {locale === 'en' ? 'Target Tracking' : '目标追踪'}</h2>
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
                <span className="result-label">{s.kills}</span>
                <span className="result-value result-score">{score}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.grade}</span>
                <span className="result-value result-grade">{grade}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.accuracy}</span>
                <span className="result-value">{overallAccuracy}%</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.avgKill}</span>
                <span className="result-value">
                  {avgKillTime > 0 ? `${avgKillTime}${s.ms}` : '—'}
                </span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.smoothness}</span>
                <span className="result-value">{smoothness}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.fails}</span>
                <span className="result-value">
                  {fails}/{MAX_FAILS}
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
        .ch-top, .ch-bottom { width: 2px; height: 8px; left: -1px; }
        .ch-top { top: -14px; }
        .ch-bottom { top: 6px; }
        .ch-left, .ch-right { width: 8px; height: 2px; top: -1px; }
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
        .hud-bars {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 10px 20%;
          background: rgba(22,22,24,0.4);
        }
        .bar-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .bar-label {
          font-size: 0.7rem;
          color: #7A7A82;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          min-width: 50px;
        }
        .bar-track {
          flex: 1;
          height: 10px;
          background: rgba(255,255,255,0.08);
          border-radius: 2px;
          overflow: hidden;
        }
        .bar-fill {
          height: 100%;
          border-radius: 2px;
          transition: width 0.1s linear;
        }
        .bar-health {
          background: linear-gradient(90deg, #FF4500, #FFD700);
        }
        .bar-time {
          background: linear-gradient(90deg, #FF4500, #FF8844);
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
        .hud-fails { color: #FF4500; }
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
        .click-to-lock { pointer-events: none; }
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
        .result-overlay { cursor: default; }
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
