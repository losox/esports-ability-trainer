import { useRef, useState, useEffect, useCallback } from 'react';
import { ReactionScene } from '../../modules/d1-reaction/scene';
import {
  calculateScore,
  calculateConsistency,
  calculateGrade,
} from '../../modules/d1-reaction/logic';

interface Props {
  locale: 'en' | 'zh';
  onComplete?: (score: number) => void;
}

const STR = {
  en: {
    rounds: 'Round',
    lastTime: 'Last',
    avgTime: 'Average',
    bestTime: 'Best',
    falseStarts: 'False Starts',
    start: 'Click to Start',
    restart: 'Restart',
    score: 'Score',
    consistency: 'Consistency',
    grade: 'Grade',
    ms: 'ms',
    complete: 'Session Complete',
    clickBall: 'Click the ball when it turns gold',
    waitBlue: 'Wait for the ball to turn gold...',
    clickNow: 'CLICK NOW!',
    falseStart: 'False Start! -50',
    exit: 'Exit',
  },
  zh: {
    rounds: '第',
    lastTime: '上次',
    avgTime: '平均',
    bestTime: '最佳',
    falseStarts: '假启动',
    start: '点击开始',
    restart: '重新开始',
    score: '得分',
    consistency: '稳定性',
    grade: '评级',
    ms: 'ms',
    complete: '训练完成',
    clickBall: '金球亮起时点击',
    waitBlue: '等待球体变金...',
    clickNow: '立即点击！',
    falseStart: '假启动！-50',
    exit: '退出',
  },
};

const ROUNDS = 10;

export default function ReactionSpeed({ locale, onComplete }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ReactionScene | null>(null);
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState<string>('idle');
  const [round, setRound] = useState(0);
  const [times, setTimes] = useState<number[]>([]);
  const [lastTime, setLastTime] = useState<number | null>(null);
  const [falseStarts, setFalseStarts] = useState(0);
  const [done, setDone] = useState(false);

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
    setTimes([]);
    setLastTime(null);
    setFalseStarts(0);
    setRound(0);

    sceneRef.current?.dispose();
    sceneRef.current = new ReactionScene(containerRef.current, {
      onStateChange: (state) => {
        setPhase(state);
        if (state === 'waiting') setRound((r) => r + 1);
      },
      onReaction: (time, isFalse) => {
        if (isFalse) {
          setFalseStarts((f) => f + 1);
        } else {
          setLastTime(time);
          setTimes((prev) => [...prev, time]);
        }
      },
      onRoundComplete: (_round, allTimes) => {
        setDone(true);
        const score = calculateScore([...allTimes, ...Array(falseStarts).fill(-1)]);
        onComplete?.(score);
      },
    });
    sceneRef.current.start();
  }, [onComplete, falseStarts]);

  const avg = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  const best = times.length > 0 ? Math.min(...times) : null;
  const score = done ? calculateScore([...times, ...Array(falseStarts).fill(-1)]) : null;
  const consistency = done ? calculateConsistency(times) : null;
  const grade = score !== null ? calculateGrade(score) : null;

  return (
    <div className="training-module">
      <div className="training-canvas" ref={containerRef} />

      {started && !done && (
        <div className="training-hud">
          <div className="hud-top">
            <div className="hud-item">
              <span className="hud-label">{s.rounds}</span>
              <span className="hud-value">
                {round}/{ROUNDS}
              </span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.lastTime}</span>
              <span className="hud-value">{lastTime !== null ? `${lastTime}${s.ms}` : '—'}</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.avgTime}</span>
              <span className="hud-value">{avg !== null ? `${avg}${s.ms}` : '—'}</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.bestTime}</span>
              <span className="hud-value">{best !== null ? `${best}${s.ms}` : '—'}</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.falseStarts}</span>
              <span className="hud-value">{falseStarts}</span>
            </div>
          </div>

          <div className="hud-center">
            {phase === 'waiting' && <div className="phase-msg phase-wait">{s.waitBlue}</div>}
            {phase === 'activated' && <div className="phase-msg phase-go">{s.clickNow}</div>}
          </div>
        </div>
      )}

      {!started && (
        <div className="training-overlay" onClick={handleStart}>
          <div className="overlay-content">
            <h2 className="overlay-title">D1 {locale === 'en' ? 'Reaction Speed' : '反应速度'}</h2>
            <p className="overlay-desc">{s.clickBall}</p>
            <button className="overlay-btn">{s.start}</button>
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
                <span className="result-value result-score">{score}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.avgTime}</span>
                <span className="result-value">
                  {avg}
                  {s.ms}
                </span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.bestTime}</span>
                <span className="result-value">
                  {best}
                  {s.ms}
                </span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.consistency}</span>
                <span className="result-value">
                  ±{consistency}
                  {s.ms}
                </span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.grade}</span>
                <span className="result-value result-grade">{grade}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.falseStarts}</span>
                <span className="result-value">{falseStarts}</span>
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
          gap: 32px;
          padding: 16px;
          background: rgba(22,22,24,0.6);
          backdrop-filter: blur(8px);
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
        .hud-center {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .phase-msg {
          font-size: 1.6rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .phase-wait { color: #4488ff; }
        .phase-go {
          color: #FFD700;
          text-shadow: 0 0 20px rgba(255,215,0,0.6);
          animation: pulse 0.5s infinite alternate;
        }
        @keyframes pulse {
          from { transform: scale(1); }
          to { transform: scale(1.1); }
        }
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
      `}</style>
    </div>
  );
}
