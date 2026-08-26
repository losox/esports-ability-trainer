import { useRef, useState, useEffect, useCallback } from 'react';
import { MultiTrackScene } from '../../modules/d5-multi-track/scene';
import {
  calculateScore,
  calculateSwitchTime,
  calculateGrade,
  calculateTrackingLevel,
  calculateTrackingCapacity,
  type TrackingStats,
} from '../../modules/d5-multi-track/logic';

interface Props {
  locale: 'en' | 'zh';
  onComplete?: (score: number) => void;
}

const STR = {
  en: {
    title: 'D5 Multi-Target Tracking',
    start: 'Click to Start',
    restart: 'Restart',
    score: 'Score',
    escapes: 'Escapes',
    difficulty: 'Level',
    eliminated: 'Eliminated',
    switchTime: 'Switch Time',
    noEscape: 'No-Escape Waves',
    activeTargets: 'Active',
    complete: 'Game Over',
    grade: 'Grade',
    trackingLevel: 'Tracking Level',
    capacity: 'Capacity',
    desc: 'Multiple enemies move simultaneously. Eliminate them one by one while tracking all positions!',
    exit: 'Exit',
  },
  zh: {
    title: 'D5 多目标追踪',
    start: '点击开始',
    restart: '重新开始',
    score: '得分',
    escapes: '逃脱',
    difficulty: '等级',
    eliminated: '已消灭',
    switchTime: '切换时间',
    noEscape: '无逃脱波次',
    activeTargets: '活跃目标',
    complete: '游戏结束',
    grade: '评级',
    trackingLevel: '追踪等级',
    capacity: '追踪容量',
    desc: '多个敌人同时移动，逐一消灭同时追踪所有目标位置！',
    exit: '退出',
  },
};

export default function MultiTargetTracking({ locale, onComplete }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MultiTrackScene | null>(null);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [score, setScore] = useState(0);
  const [escapes, setEscapes] = useState(0);
  const [difficulty, setDifficulty] = useState(1);
  const [eliminated, setEliminated] = useState(0);
  const [switchTimes, setSwitchTimes] = useState<number[]>([]);
  const [noEscapeWaves, setNoEscapeWaves] = useState(0);
  const [activeTargets, setActiveTargets] = useState(0);

  const s = STR[locale];

  useEffect(() => {
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  const buildStats = useCallback((): TrackingStats => {
    return {
      eliminated,
      escapes,
      noEscapeWaves,
      switchTimes,
    };
  }, [eliminated, escapes, noEscapeWaves, switchTimes]);

  const handleStart = useCallback(() => {
    if (!containerRef.current) return;
    setStarted(true);
    setDone(false);
    setScore(0);
    setEscapes(0);
    setDifficulty(1);
    setEliminated(0);
    setSwitchTimes([]);
    setNoEscapeWaves(0);
    setActiveTargets(0);

    sceneRef.current?.dispose();
    sceneRef.current = new MultiTrackScene(containerRef.current, {
      onScore: (sc) => setScore(sc),
      onEliminate: (st) => {
        if (st > 0) {
          setSwitchTimes((prev) => [...prev, st]);
        }
        setEliminated((e) => e + 1);
      },
      onEscape: (esc) => setEscapes(esc),
      onDifficultyChange: (level) => setDifficulty(level),
      onGameOver: (finalScore) => {
        setDone(true);
        onComplete?.(finalScore);
      },
      onNoEscapeWave: (waves) => setNoEscapeWaves(waves),
      onActiveTargets: (count) => setActiveTargets(count),
    });
    sceneRef.current.start();
  }, [onComplete]);

  const avgSwitch = switchTimes.length > 0 ? calculateSwitchTime(switchTimes) : 0;
  const finalStats = buildStats();
  const finalScore = done ? calculateScore(finalStats) : null;
  const grade = finalScore !== null ? calculateGrade(finalScore) : null;
  const trackingLevel = done ? calculateTrackingLevel(avgSwitch, noEscapeWaves) : null;
  const capacity = done ? calculateTrackingCapacity(eliminated, escapes) : null;

  const levelDisplay: Record<string, { en: string; zh: string }> = {
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
              <span className="hud-label">{s.escapes}</span>
              <span className="hud-value hud-escape">{escapes}/3</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.difficulty}</span>
              <span className="hud-value">{difficulty}</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.eliminated}</span>
              <span className="hud-value">{eliminated}</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.activeTargets}</span>
              <span className="hud-value">{activeTargets}</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.noEscape}</span>
              <span className="hud-value hud-noescape">{noEscapeWaves}</span>
            </div>
          </div>
        </div>
      )}

      {!started && (
        <div className="training-overlay" onClick={handleStart}>
          <div className="overlay-content">
            <h2 className="overlay-title">{s.title}</h2>
            <p className="overlay-desc">{s.desc}</p>
            <button className="overlay-btn" onClick={handleStart}>
              {s.start}
            </button>
          </div>
        </div>
      )}

      {done && (
        <div className="training-overlay result-overlay">
          <div className="overlay-content">
            <h2 className="overlay-title">{s.complete}</h2>
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
                <span className="result-label">{s.eliminated}</span>
                <span className="result-value">{eliminated}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.switchTime}</span>
                <span className="result-value">{avgSwitch > 0 ? `${avgSwitch}ms` : '—'}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.noEscape}</span>
                <span className="result-value">{noEscapeWaves}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.capacity}</span>
                <span className="result-value">{capacity?.toFixed(1) ?? '—'}</span>
              </div>
            </div>
            {trackingLevel && (
              <div className="level-badge">
                {s.trackingLevel}: {levelDisplay[trackingLevel]?.[locale] ?? trackingLevel}
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
        .hud-escape { color: #FF4500; }
        .hud-noescape { color: #FFD700; }
        .training-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(22,22,24,0.9);
          backdrop-filter: blur(12px);
          cursor: pointer;
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
        .level-badge {
          display: inline-block;
          padding: 6px 20px;
          border: 1px solid #FFD700;
          border-radius: 20px;
          color: #FFD700;
          font-weight: 600;
          font-size: 0.9rem;
          margin-bottom: 24px;
        }
      `}</style>
    </div>
  );
}
