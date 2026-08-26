import { useRef, useState, useEffect, useCallback } from 'react';
import { MemoryScene } from '../../modules/d6-memory/scene';
import {
  calculateTotalScore,
  calculateAvgDeviation,
  calculateGrade,
  calculateSessionStats,
  getBenchmark,
  MAX_FAILURES,
  type RoundResult,
  type DifficultyConfig,
} from '../../modules/d6-memory/logic';
import { saveTrainingSession } from '../../lib/training';

interface Props {
  locale: 'en' | 'zh';
  onComplete?: (score: number) => void;
}

type Phase = 'idle' | 'observe' | 'silence' | 'recall' | 'reveal' | 'gameover';

const STR = {
  en: {
    title: 'D6 Working Memory',
    subtitle: 'MOBA Map Memory Training',
    description: 'Observe enemy positions, recall them after they enter fog of war',
    start: 'Start Training',
    restart: 'Restart',
    exit: 'Exit',
    round: 'Round',
    phase: 'Phase',
    failures: 'Failures',
    score: 'Score',
    avgDeviation: 'Avg Deviation',
    recallRate: 'Recall Rate',
    grade: 'Grade',
    marked: 'Marked',
    units: 'Units',
    phaseObserve: 'OBSERVE',
    phaseSilence: 'FOG OF WAR',
    phaseRecall: 'RECALL — Click positions',
    phaseReveal: 'REVEAL',
    phaseGameover: 'GAME OVER',
    phaseIdle: 'Ready',
    observeMsg: 'Memorize enemy positions!',
    silenceMsg: 'Enemies entered fog of war...',
    recallMsg: 'Click where each enemy was',
    revealMsg: 'Green = actual | Gold = your marks',
    done: 'Done Marking',
    complete: 'Session Complete',
    difficulty: 'Difficulty',
    unitCount: 'Units',
    silenceTime: 'Silence',
    movement: 'Movement',
    interference: 'Interference',
    movementNone: 'None',
    movementLinear: 'Linear',
    movementDirChange: 'Direction Change',
    interferenceNone: 'None',
    interferenceFlashing: 'Flashing',
    interferenceText: 'Text Prompt',
    benchmark: 'Benchmark',
    rounds: 'Rounds',
    px: 'px',
    yes: 'Yes',
    no: 'No',
    saving: 'Saving...',
    saved: 'Saved!',
  },
  zh: {
    title: 'D6 工作记忆',
    subtitle: 'MOBA地图记忆训练',
    description: '观察敌方位置，在进入战争迷雾后回忆标记',
    start: '开始训练',
    restart: '重新开始',
    exit: '退出',
    round: '回合',
    phase: '阶段',
    failures: '失败',
    score: '得分',
    avgDeviation: '平均偏差',
    recallRate: '完整回忆率',
    grade: '评级',
    marked: '已标记',
    units: '单位',
    phaseObserve: '观察',
    phaseSilence: '战争迷雾',
    phaseRecall: '回忆 — 点击位置',
    phaseReveal: '揭示',
    phaseGameover: '游戏结束',
    phaseIdle: '准备',
    observeMsg: '记住敌方位置！',
    silenceMsg: '敌方进入战争迷雾...',
    recallMsg: '点击每个敌人原来的位置',
    revealMsg: '绿色 = 实际位置 | 金色 = 你的标记',
    done: '完成标记',
    complete: '训练完成',
    difficulty: '难度',
    unitCount: '单位数',
    silenceTime: '沉默时间',
    movement: '移动',
    interference: '干扰',
    movementNone: '无',
    movementLinear: '直线',
    movementDirChange: '变向',
    interferenceNone: '无',
    interferenceFlashing: '闪烁',
    interferenceText: '文字提示',
    benchmark: '基准',
    rounds: '回合',
    px: 'px',
    yes: '是',
    no: '否',
    saving: '保存中...',
    saved: '已保存！',
  },
};

export default function WorkingMemory({ locale, onComplete }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MemoryScene | null>(null);
  const startTimeRef = useRef<number>(0);
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [round, setRound] = useState(0);
  const [failures, setFailures] = useState(0);
  const [marked, setMarked] = useState(0);
  const [totalUnits, setTotalUnits] = useState(0);
  const [difficulty, setDifficulty] = useState<DifficultyConfig | null>(null);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [done, setDone] = useState(false);
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
    setSaving(false);
    setSaved(false);
    setRound(0);
    setFailures(0);
    setRoundResults([]);
    setPhase('idle');
    setMarked(0);
    setTotalUnits(0);
    setDifficulty(null);
    startTimeRef.current = Date.now();

    sceneRef.current?.dispose();
    sceneRef.current = new MemoryScene(containerRef.current, {
      onPhaseChange: (p) => setPhase(p),
      onRoundStart: (r, d) => {
        setRound(r);
        setDifficulty(d);
        setMarked(0);
        setTotalUnits(d.unitCount);
      },
      onMarkingUpdate: (m, total) => {
        setMarked(m);
        setTotalUnits(total);
      },
      onRoundComplete: (result) => {
        setRoundResults((prev) => [...prev, result]);
      },
      onFailuresUpdate: (f) => setFailures(f),
      onSessionComplete: (_rounds) => {
        setDone(true);
        const stats = calculateSessionStats(_rounds);
        const durationMs = Date.now() - startTimeRef.current;

        setSaving(true);
        saveTrainingSession({
          dimensionId: 6,
          version: 'moba',
          totalScore: stats.totalScore,
          groups: [
            {
              groupIndex: 1,
              score: stats.totalScore,
              subMetrics: {
                avgDeviation: stats.avgDeviation,
                completeRecallRate: stats.completeRecallRate,
                roundsCompleted: stats.roundsCompleted,
                failures: stats.failures,
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

        onComplete?.(stats.totalScore);
      },
    });
    sceneRef.current.start();
    sceneRef.current.startTraining();
  }, [onComplete]);

  const handleDoneMarking = useCallback(() => {
    sceneRef.current?.triggerReveal();
  }, []);

  const stats = done ? calculateSessionStats(roundResults) : null;
  const currentScore = calculateTotalScore(roundResults);
  const currentAvgDev = calculateAvgDeviation(roundResults);
  const grade = done ? calculateGrade(stats?.totalScore ?? 0) : null;
  const benchmark = done ? getBenchmark(stats?.avgDeviation ?? 999) : null;

  const phaseMsg = (() => {
    switch (phase) {
      case 'observe':
        return s.observeMsg;
      case 'silence':
        return s.silenceMsg;
      case 'recall':
        return s.recallMsg;
      case 'reveal':
        return s.revealMsg;
      case 'gameover':
        return s.phaseGameover;
      default:
        return '';
    }
  })();

  const movementLabel = difficulty
    ? difficulty.movement === 'none'
      ? s.movementNone
      : difficulty.movement === 'linear'
        ? s.movementLinear
        : s.movementDirChange
    : '';

  const interferenceLabel = difficulty
    ? difficulty.interference === 'none'
      ? s.interferenceNone
      : difficulty.interference === 'flashing'
        ? s.interferenceFlashing
        : s.interferenceText
    : '';

  return (
    <div className="training-module">
      <div className="training-canvas" ref={containerRef} />

      {started && !done && (
        <div className="training-hud">
          <div className="hud-top">
            <div className="hud-item">
              <span className="hud-label">{s.round}</span>
              <span className="hud-value">{round}</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.failures}</span>
              <span className="hud-value">
                {failures}/{MAX_FAILURES}
              </span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.marked}</span>
              <span className="hud-value">
                {marked}/{totalUnits}
              </span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.score}</span>
              <span className="hud-value hud-score">{currentScore}</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.avgDeviation}</span>
              <span className="hud-value">
                {currentAvgDev > 0 ? `${currentAvgDev}${s.px}` : '—'}
              </span>
            </div>
          </div>

          {difficulty && (
            <div className="hud-difficulty">
              <span className="diff-tag">
                {s.unitCount}: {difficulty.unitCount}
              </span>
              <span className="diff-tag">
                {s.silenceTime}: {(difficulty.silenceDurationMs / 1000).toFixed(0)}s
              </span>
              <span className="diff-tag">
                {s.movement}: {movementLabel}
              </span>
              <span className="diff-tag">
                {s.interference}: {interferenceLabel}
              </span>
            </div>
          )}

          <div className="hud-center">
            {phaseMsg && <div className={`phase-msg phase-${phase}`}>{phaseMsg}</div>}
          </div>

          {phase === 'recall' && marked > 0 && marked < totalUnits && (
            <div className="hud-bottom">
              <button className="done-btn" onClick={handleDoneMarking}>
                {s.done}
              </button>
            </div>
          )}
        </div>
      )}

      {!started && (
        <div className="training-overlay" onClick={handleStart}>
          <div className="overlay-content">
            <h2 className="overlay-title">{s.title}</h2>
            <p className="overlay-subtitle">{s.subtitle}</p>
            <p className="overlay-desc">{s.description}</p>
            <button className="overlay-btn">{s.start}</button>
          </div>
        </div>
      )}

      {done && stats && (
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
                <span className="result-value result-score">{stats.totalScore}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.grade}</span>
                <span className="result-value result-grade">{grade}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.rounds}</span>
                <span className="result-value">{stats.roundsCompleted}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.avgDeviation}</span>
                <span className="result-value">
                  {stats.avgDeviation}
                  {s.px}
                </span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.recallRate}</span>
                <span className="result-value">{stats.completeRecallRate}%</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.failures}</span>
                <span className="result-value">{stats.failures}</span>
              </div>
            </div>
            {benchmark && (
              <div className="benchmark-row">
                <span className="benchmark-label">{s.benchmark}:</span>
                <span className="benchmark-value">{benchmark.label}</span>
                <span className="benchmark-detail">
                  ({benchmark.capacity} / {benchmark.deviation})
                </span>
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
          font-size: 0.68rem;
          color: #7A7A82;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .hud-value {
          font-size: 1.05rem;
          font-weight: 700;
          color: #E8E8E8;
        }
        .hud-score {
          color: #FFD700;
        }
        .hud-difficulty {
          display: flex;
          justify-content: center;
          gap: 12px;
          padding: 6px 16px;
        }
        .diff-tag {
          font-size: 0.72rem;
          color: #7A7A82;
          background: rgba(255,69,0,0.1);
          border: 1px solid rgba(255,69,0,0.2);
          padding: 2px 8px;
          border-radius: 3px;
        }
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
          letter-spacing: 0.08em;
          text-shadow: 0 2px 12px rgba(0,0,0,0.8);
        }
        .phase-observe { color: #FF4500; }
        .phase-silence { color: #7A7A82; }
        .phase-recall {
          color: #FFD700;
          text-shadow: 0 0 20px rgba(255,215,0,0.5);
          animation: pulse 1s infinite alternate;
        }
        .phase-reveal { color: #00ff88; }
        .phase-gameover {
          color: #FF4500;
          font-size: 2rem;
          animation: pulse 0.6s infinite alternate;
        }
        @keyframes pulse {
          from { transform: scale(1); }
          to { transform: scale(1.08); }
        }
        .hud-bottom {
          display: flex;
          justify-content: center;
          padding: 20px;
          pointer-events: auto;
        }
        .done-btn {
          padding: 10px 28px;
          border-radius: 4px;
          border: 2px solid #FFD700;
          background: rgba(255,215,0,0.1);
          color: #FFD700;
          font-weight: 700;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .done-btn:hover {
          background: rgba(255,215,0,0.2);
          box-shadow: 0 0 16px rgba(255,215,0,0.4);
        }
        .training-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(22,22,24,0.88);
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
          margin-bottom: 8px;
        }
        .overlay-subtitle {
          color: #FFD700;
          margin-bottom: 12px;
          font-size: 1rem;
          font-weight: 600;
        }
        .overlay-desc {
          color: #7A7A82;
          margin-bottom: 28px;
          font-size: 0.95rem;
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
          margin-bottom: 20px;
        }
        .result-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .result-label {
          font-size: 0.68rem;
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
          font-size: 2rem;
        }
        .result-grade {
          color: #FF4500;
          font-size: 2rem;
          font-family: Impact, sans-serif;
        }
        .benchmark-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 28px;
          padding: 12px;
          background: rgba(255,215,0,0.05);
          border: 1px solid rgba(255,215,0,0.15);
          border-radius: 4px;
        }
        .benchmark-label {
          font-size: 0.8rem;
          color: #7A7A82;
          text-transform: uppercase;
        }
        .benchmark-value {
          font-size: 1.1rem;
          font-weight: 700;
          color: #FFD700;
        }
        .benchmark-detail {
          font-size: 0.85rem;
          color: #7A7A82;
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
