import { useRef, useState, useEffect, useCallback } from 'react';
import { DecisionScene } from '../../modules/d8-decision/scene';
import {
  calculateScore,
  calculateGrade,
  calculateFirstDecisionTime,
  calculateTotalDamage,
  evaluateDecisionTime,
  PLAYER_MAX_HP,
  type GameVersion,
  type RoundResult,
} from '../../modules/d8-decision/logic';

interface Props {
  locale: 'en' | 'zh';
  version?: GameVersion;
  onComplete?: (score: number) => void;
}

const STR = {
  en: {
    title: 'D8 Decision Speed',
    start: 'Click to Start',
    restart: 'Restart',
    round: 'Round',
    hp: 'HP',
    score: 'Score',
    firstDecision: 'First Decision',
    avgDecision: 'Avg Decision',
    targetsLeft: 'Targets',
    damageTaken: 'Damage Taken',
    survivedRounds: 'Rounds Survived',
    grade: 'Grade',
    complete: 'Training Complete',
    gameOver: 'Game Over',
    instruction:
      'Eliminate targets before their countdowns expire. Prioritize high-threat targets!',
    versionLabel: 'Mode',
    fps: 'FPS — Shooting Range',
    moba: 'MOBA — Tower Defense',
    normal: 'Normal',
    highAttack: 'High-Attack',
    tank: 'Tank',
    normalDesc: 'Low HP, Low threat',
    highAttackDesc: 'Low HP, High threat',
    tankDesc: 'High HP, Low threat',
    pro: 'PRO',
    expert: 'EXPERT',
    average: 'AVERAGE',
    slow: 'SLOW',
    clickToLock: 'Click to lock mouse',
    locked: 'Locked',
    ms: 'ms',
    exit: 'Exit',
  },
  zh: {
    title: 'D8 决策速度',
    start: '点击开始',
    restart: '重新开始',
    round: '回合',
    hp: '生命',
    score: '得分',
    firstDecision: '首次决策',
    avgDecision: '平均决策',
    targetsLeft: '剩余目标',
    damageTaken: '承受伤害',
    survivedRounds: '存活回合',
    grade: '评级',
    complete: '训练完成',
    gameOver: '游戏结束',
    instruction: '在倒计时归零前消灭目标，优先处理高威胁目标！',
    versionLabel: '模式',
    fps: 'FPS — 射击靶场',
    moba: 'MOBA — 守塔防御',
    normal: '普通',
    highAttack: '高攻',
    tank: '坦克',
    normalDesc: '低血量，低威胁',
    highAttackDesc: '低血量，高威胁',
    tankDesc: '高血量，低威胁',
    pro: '职业',
    expert: '高手',
    average: '普通',
    slow: '缓慢',
    clickToLock: '点击锁定鼠标',
    locked: '已锁定',
    ms: 'ms',
    exit: '退出',
  },
};

export default function DecisionSpeed({ locale, version = 'fps', onComplete }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<DecisionScene | null>(null);
  const [started, setStarted] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<GameVersion>(version);
  const [round, setRound] = useState(0);
  const [hp, setHp] = useState(PLAYER_MAX_HP);
  const [lastDecision, setLastDecision] = useState<number | null>(null);
  const [avgDecision, setAvgDecision] = useState<number | null>(null);
  const [targetsLeft, setTargetsLeft] = useState(0);
  const [done, setDone] = useState(false);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [damageFlash, setDamageFlash] = useState(false);
  const [finalResults, setFinalResults] = useState<RoundResult[]>([]);
  const [survivedRounds, setSurvivedRounds] = useState(0);

  const s = STR[locale];
  const decisionTimesRef = useRef<number[]>([]);

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
    setRound(0);
    setHp(PLAYER_MAX_HP);
    setLastDecision(null);
    setAvgDecision(null);
    setTargetsLeft(0);
    setFinalResults([]);
    setSurvivedRounds(0);
    decisionTimesRef.current = [];

    sceneRef.current?.dispose();
    sceneRef.current = new DecisionScene(containerRef.current, selectedVersion, {
      onHpChange: (newHp) => setHp(newHp),
      onRoundStart: (r) => {
        setRound(r);
        setTargetsLeft(0);
      },
      onFirstDecision: (timeMs) => {
        setLastDecision(timeMs);
        decisionTimesRef.current.push(timeMs);
        const times = decisionTimesRef.current;
        setAvgDecision(Math.round(times.reduce((a, b) => a + b, 0) / times.length));
      },
      onTargetEliminated: (_type, remaining) => {
        setTargetsLeft(remaining);
      },
      onDamageTaken: () => {
        setDamageFlash(true);
        setTimeout(() => setDamageFlash(false), 300);
      },
      onRoundResult: () => {
        // Results are collected at game over
      },
      onGameOver: (survived, results) => {
        setDone(true);
        setFinalResults(results);
        setSurvivedRounds(survived);
        const score = calculateScore(survived, results);
        onComplete?.(score);
      },
      onPointerLockChange: (locked) => {
        setPointerLocked(locked);
      },
    });
    sceneRef.current.start();
  }, [onComplete, selectedVersion]);

  const finalScore = done ? calculateScore(survivedRounds, finalResults) : null;
  const finalGrade = finalScore !== null ? calculateGrade(finalScore) : null;
  const finalAvgDecision = done ? calculateFirstDecisionTime(finalResults) : null;
  const finalTotalDamage = done ? calculateTotalDamage(finalResults) : null;
  const hpPercent = (hp / PLAYER_MAX_HP) * 100;
  const decisionTier = lastDecision !== null ? evaluateDecisionTime(lastDecision) : null;

  return (
    <div className="training-module">
      <div className="training-canvas" ref={containerRef} />

      {damageFlash && <div className="damage-flash" />}

      {started && !done && (
        <div className="training-hud">
          <div className="hud-top">
            <div className="hud-item">
              <span className="hud-label">{s.round}</span>
              <span className="hud-value">{round}</span>
            </div>
            <div className="hud-item hud-hp">
              <span className="hud-label">{s.hp}</span>
              <div className="hp-bar-container">
                <div className="hp-bar-fill" style={{ width: `${hpPercent}%` }} />
                <span className="hp-text">{hp}</span>
              </div>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.targetsLeft}</span>
              <span className="hud-value">{targetsLeft}</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.firstDecision}</span>
              <span className="hud-value">
                {lastDecision !== null ? `${lastDecision}${s.ms}` : '—'}
              </span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.avgDecision}</span>
              <span className="hud-value">
                {avgDecision !== null ? `${avgDecision}${s.ms}` : '—'}
              </span>
            </div>
          </div>

          {selectedVersion === 'fps' && started && !pointerLocked && (
            <div className="hud-center">
              <div className="lock-prompt">{s.clickToLock}</div>
            </div>
          )}

          {lastDecision !== null && decisionTier && (
            <div className="hud-bottom">
              <span className={`tier-badge tier-${decisionTier}`}>{s[decisionTier]}</span>
            </div>
          )}
        </div>
      )}

      {!started && (
        <div className="training-overlay" onClick={handleStart}>
          <div className="overlay-content">
            <h2 className="overlay-title">{s.title}</h2>
            <div className="version-selector">
              <span className="version-label">{s.versionLabel}</span>
              <div className="version-buttons">
                <button
                  className={`version-btn ${selectedVersion === 'fps' ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedVersion('fps');
                  }}
                >
                  {s.fps}
                </button>
                <button
                  className={`version-btn ${selectedVersion === 'moba' ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedVersion('moba');
                  }}
                >
                  {s.moba}
                </button>
              </div>
            </div>
            <div className="target-legend">
              <div className="legend-item">
                <span className="legend-color legend-normal" />
                <div>
                  <span className="legend-name">{s.normal}</span>
                  <span className="legend-desc">{s.normalDesc}</span>
                </div>
              </div>
              <div className="legend-item">
                <span className="legend-color legend-high-attack" />
                <div>
                  <span className="legend-name">{s.highAttack}</span>
                  <span className="legend-desc">{s.highAttackDesc}</span>
                </div>
              </div>
              <div className="legend-item">
                <span className="legend-color legend-tank" />
                <div>
                  <span className="legend-name">{s.tank}</span>
                  <span className="legend-desc">{s.tankDesc}</span>
                </div>
              </div>
            </div>
            <p className="overlay-desc">{s.instruction}</p>
            <button className="overlay-btn">{s.start}</button>
          </div>
        </div>
      )}

      {done && (
        <div className="training-overlay result-overlay">
          <div className="overlay-content">
            <h2 className="overlay-title">{survivedRounds > 0 ? s.complete : s.gameOver}</h2>
            <div className="result-grid">
              <div className="result-item">
                <span className="result-label">{s.score}</span>
                <span className="result-value result-score">{finalScore}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.grade}</span>
                <span className="result-value result-grade">{finalGrade}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.survivedRounds}</span>
                <span className="result-value">{survivedRounds}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.avgDecision}</span>
                <span className="result-value">
                  {finalAvgDecision !== null && finalAvgDecision > 0
                    ? `${finalAvgDecision}${s.ms}`
                    : '—'}
                </span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.damageTaken}</span>
                <span className="result-value">{finalTotalDamage}</span>
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
        .damage-flash {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at center, transparent 40%, rgba(255,69,0,0.35) 100%);
          pointer-events: none;
          z-index: 10;
          animation: damagePulse 0.3s ease-out forwards;
        }
        @keyframes damagePulse {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        .training-hud {
          position: absolute;
          inset: 0;
          pointer-events: none;
          display: flex;
          flex-direction: column;
          z-index: 5;
        }
        .hud-top {
          display: flex;
          justify-content: center;
          gap: 28px;
          padding: 14px 16px;
          background: rgba(22,22,24,0.7);
          backdrop-filter: blur(8px);
        }
        .hud-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .hud-label {
          font-size: 0.65rem;
          color: #7A7A82;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .hud-value {
          font-size: 1.1rem;
          font-weight: 700;
          color: #E8E8E8;
        }
        .hud-hp .hp-bar-container {
          position: relative;
          width: 120px;
          height: 18px;
          background: rgba(0,0,0,0.5);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 2px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .hp-bar-fill {
          position: absolute;
          left: 0;
          top: 0;
          height: 100%;
          background: linear-gradient(90deg, #FF4500, #FFD700, #00ff00);
          transition: width 0.3s ease;
        }
        .hp-text {
          position: relative;
          font-size: 0.75rem;
          font-weight: 700;
          color: #E8E8E8;
          text-shadow: 0 1px 2px rgba(0,0,0,0.8);
        }
        .hud-center {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .lock-prompt {
          font-size: 1.2rem;
          font-weight: 600;
          color: #FFD700;
          background: rgba(22,22,24,0.8);
          padding: 12px 28px;
          border-radius: 4px;
          border: 1px solid rgba(255,215,0,0.3);
        }
        .hud-bottom {
          display: flex;
          justify-content: center;
          padding: 12px;
        }
        .tier-badge {
          font-size: 0.85rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          padding: 4px 16px;
          border-radius: 3px;
        }
        .tier-pro { color: #FFD700; border: 1px solid #FFD700; background: rgba(255,215,0,0.1); }
        .tier-expert { color: #FF4500; border: 1px solid #FF4500; background: rgba(255,69,0,0.1); }
        .tier-average { color: #E8E8E8; border: 1px solid #7A7A82; background: rgba(122,122,130,0.1); }
        .tier-slow { color: #7A7A82; border: 1px solid #7A7A82; background: rgba(122,122,130,0.05); }
        .training-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(22,22,24,0.88);
          backdrop-filter: blur(12px);
          cursor: pointer;
          z-index: 20;
        }
        .overlay-content {
          text-align: center;
          max-width: 520px;
          padding: 36px;
        }
        .overlay-title {
          font-family: Impact, 'Oswald', sans-serif;
          font-size: 2.2rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: #FF4500;
          margin-bottom: 16px;
        }
        .version-selector {
          margin-bottom: 20px;
        }
        .version-label {
          display: block;
          font-size: 0.7rem;
          color: #7A7A82;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 8px;
        }
        .version-buttons {
          display: flex;
          gap: 8px;
          justify-content: center;
        }
        .version-btn {
          padding: 10px 20px;
          border: 1px solid rgba(255,69,0,0.3);
          background: transparent;
          color: #7A7A82;
          font-size: 0.85rem;
          font-weight: 600;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .version-btn.active {
          border-color: #FF4500;
          background: rgba(255,69,0,0.15);
          color: #FF4500;
        }
        .version-btn:hover {
          border-color: rgba(255,69,0,0.6);
          color: #E8E8E8;
        }
        .target-legend {
          display: flex;
          gap: 16px;
          justify-content: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .legend-color {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .legend-normal { background: #888888; }
        .legend-high-attack { background: #FF4500; }
        .legend-tank { background: #4488ff; }
        .legend-name {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          color: #E8E8E8;
        }
        .legend-desc {
          display: block;
          font-size: 0.7rem;
          color: #7A7A82;
        }
        .overlay-desc {
          color: #7A7A82;
          margin-bottom: 24px;
          font-size: 0.9rem;
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
          font-size: 0.65rem;
          color: #7A7A82;
          text-transform: uppercase;
        }
        .result-value {
          font-size: 1.3rem;
          font-weight: 700;
          color: #E8E8E8;
        }
        .result-score {
          color: #FFD700;
          font-size: 1.8rem;
        }
        .result-grade {
          color: #FF4500;
          font-size: 1.8rem;
          font-family: Impact, sans-serif;
        }
      `}</style>
    </div>
  );
}
