import { useRef, useState, useEffect, useCallback } from 'react';
import { FlexibilityScene } from '../../modules/d7-flexibility/scene';
import {
  calculateSessionMetrics,
  calculateGrade,
  BOARD_RULES,
  PATTERN_TIME_LIMIT_MS,
  SESSION_DURATION_MS,
  type BoardId,
  type SwitchEvent,
  type PatternCompletion,
} from '../../modules/d7-flexibility/logic';

interface Props {
  locale: 'en' | 'zh';
  onComplete?: (score: number) => void;
}

const STR = {
  en: {
    title: 'D7 Cognitive Flexibility',
    subtitle: 'Magic Chessboard Training',
    description:
      'Switch between boards with different rules. Press A-E to switch, click pieces in the correct order.',
    start: 'Start Training',
    restart: 'Restart',
    exit: 'Exit',
    timeLeft: 'Time',
    patternTime: 'Pattern',
    activeBoard: 'Active Board',
    playerBoard: 'Your Board',
    score: 'Score',
    switchReaction: 'Switch Reaction',
    firstSwitchAcc: 'First Switch Acc',
    errorRate: 'Error Rate',
    grade: 'Grade',
    completions: 'Completed',
    switches: 'Switches',
    complete: 'Session Complete',
    pressKey: 'Press A-E to switch board',
    clickPieces: 'Click pieces in order',
    boardRules: {
      clockwise: 'Clockwise',
      'counter-clockwise': 'Counter-Clockwise',
      cross: 'Cross Pattern',
      'three-of-four': '3 of 4 (skip)',
      diagonal: 'Diagonal Cross',
    },
    keys: 'Keys: A B C D E',
    onBoard: 'On Board',
    none: 'None',
    sec: 's',
    ms: 'ms',
  },
  zh: {
    title: 'D7 认知灵活性',
    subtitle: '魔法棋盘训练',
    description: '在不同规则的棋盘间切换。按 A-E 键切换棋盘，按正确顺序点击棋子。',
    start: '开始训练',
    restart: '重新开始',
    exit: '退出',
    timeLeft: '剩余时间',
    patternTime: '图案时间',
    activeBoard: '激活棋盘',
    playerBoard: '当前棋盘',
    score: '得分',
    switchReaction: '切换反应',
    firstSwitchAcc: '首次切换准确率',
    errorRate: '错误率',
    grade: '评级',
    completions: '完成数',
    switches: '切换次数',
    complete: '训练完成',
    pressKey: '按 A-E 键切换棋盘',
    clickPieces: '按顺序点击棋子',
    boardRules: {
      clockwise: '顺时针',
      'counter-clockwise': '逆时针',
      cross: '十字交叉',
      'three-of-four': '三选四（跳过一个）',
      diagonal: '对角交叉',
    },
    keys: '按键: A B C D E',
    onBoard: '在棋盘',
    none: '无',
    sec: '秒',
    ms: 'ms',
  },
};

const BOARD_NAMES: Record<BoardId, string> = {
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  E: 'E',
};

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}`;
}

export default function CognitiveFlexibility({ locale, onComplete }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<FlexibilityScene | null>(null);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [timeLeft, setTimeLeft] = useState(SESSION_DURATION_MS);
  const [patternTime, setPatternTime] = useState(PATTERN_TIME_LIMIT_MS);
  const [activeBoard, setActiveBoard] = useState<BoardId | null>(null);
  const [playerBoard, setPlayerBoard] = useState<BoardId | null>(null);
  const [switchEvents, setSwitchEvents] = useState<SwitchEvent[]>([]);
  const [completions, setCompletions] = useState<PatternCompletion[]>([]);

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
    setTimeLeft(SESSION_DURATION_MS);
    setPatternTime(PATTERN_TIME_LIMIT_MS);
    setActiveBoard(null);
    setPlayerBoard(null);
    setSwitchEvents([]);
    setCompletions([]);

    sceneRef.current?.dispose();
    sceneRef.current = new FlexibilityScene(containerRef.current, {
      onActiveBoardChange: (board) => setActiveBoard(board),
      onPatternTimerUpdate: (remaining) => setPatternTime(remaining),
      onSessionTimerUpdate: (remaining) => setTimeLeft(remaining),
      onSwitchEvent: (event) => {
        setSwitchEvents((prev) => [...prev, event]);
        setPlayerBoard(event.toBoard);
      },
      onPatternComplete: (completion) => {
        setCompletions((prev) => [...prev, completion]);
      },
      onSessionComplete: (metrics) => {
        setDone(true);
        onComplete?.(metrics.totalScore);
      },
    });
    sceneRef.current.start();
    sceneRef.current.startTraining();
  }, [onComplete]);

  const metrics = done ? calculateSessionMetrics(switchEvents, completions) : null;

  const liveMetrics = started && !done ? calculateSessionMetrics(switchEvents, completions) : null;

  const grade = done ? calculateGrade(metrics?.totalScore ?? 0) : null;

  const activeRule = activeBoard ? BOARD_RULES.find((r) => r.id === activeBoard) : null;

  return (
    <div className="training-module">
      <div className="training-canvas" ref={containerRef} />

      {started && !done && (
        <div className="training-hud">
          <div className="hud-top">
            <div className="hud-item">
              <span className="hud-label">{s.timeLeft}</span>
              <span className="hud-value hud-timer">
                {formatTime(timeLeft)}
                {s.sec}
              </span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.patternTime}</span>
              <span className={`hud-value ${patternTime < 1000 ? 'hud-danger' : ''}`}>
                {formatTime(patternTime)}
                {s.sec}
              </span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.activeBoard}</span>
              <span className="hud-value hud-active">
                {activeBoard ? BOARD_NAMES[activeBoard] : '—'}
              </span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.playerBoard}</span>
              <span className="hud-value">{playerBoard ? BOARD_NAMES[playerBoard] : '—'}</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.score}</span>
              <span className="hud-value hud-score">{liveMetrics?.totalScore ?? 0}</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">{s.completions}</span>
              <span className="hud-value">{liveMetrics?.totalCompletions ?? 0}</span>
            </div>
          </div>

          {activeRule && (
            <div className="hud-rule-bar">
              <div
                className="rule-tag"
                style={{ borderColor: `#${activeRule.color.toString(16).padStart(6, '0')}` }}
              >
                <span className="rule-board">{BOARD_NAMES[activeRule.id]}</span>
                <span className="rule-text">{s.boardRules[activeRule.rule]}</span>
              </div>
            </div>
          )}

          <div className="hud-keys">
            <div className="key-hint">{s.keys}</div>
            <div className="board-keys">
              {BOARD_RULES.map((rule) => (
                <div
                  key={rule.id}
                  className={`board-key ${activeBoard === rule.id ? 'board-key-active' : ''} ${playerBoard === rule.id ? 'board-key-player' : ''}`}
                  style={{
                    borderColor: `#${rule.color.toString(16).padStart(6, '0')}`,
                    boxShadow:
                      activeBoard === rule.id
                        ? `0 0 12px #${rule.color.toString(16).padStart(6, '0')}`
                        : 'none',
                  }}
                >
                  <span className="board-key-label">{BOARD_NAMES[rule.id]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="hud-center">
            {!playerBoard && <div className="phase-msg phase-wait">{s.pressKey}</div>}
            {playerBoard && activeBoard === playerBoard && (
              <div className="phase-msg phase-go">{s.clickPieces}</div>
            )}
          </div>

          <div className="hud-bottom">
            <div className="sub-metrics">
              <span className="sub-metric">
                {s.switchReaction}: {liveMetrics?.avgSwitchReactionMs ?? 0}
                {s.ms}
              </span>
              <span className="sub-metric">
                {s.firstSwitchAcc}: {liveMetrics?.firstSwitchAccuracy ?? 0}%
              </span>
              <span className="sub-metric">
                {s.errorRate}: {liveMetrics?.postSwitchErrorRate ?? 0}%
              </span>
            </div>
          </div>
        </div>
      )}

      {!started && (
        <div className="training-overlay" onClick={handleStart}>
          <div className="overlay-content">
            <h2 className="overlay-title">{s.title}</h2>
            <p className="overlay-subtitle">{s.subtitle}</p>
            <p className="overlay-desc">{s.description}</p>
            <div className="board-preview">
              {BOARD_RULES.map((rule) => (
                <div key={rule.id} className="preview-board">
                  <span
                    className="preview-dot"
                    style={{ background: `#${rule.color.toString(16).padStart(6, '0')}` }}
                  />
                  <span className="preview-name">{BOARD_NAMES[rule.id]}</span>
                  <span className="preview-rule">{s.boardRules[rule.rule]}</span>
                </div>
              ))}
            </div>
            <button className="overlay-btn">{s.start}</button>
          </div>
        </div>
      )}

      {done && metrics && (
        <div className="training-overlay result-overlay">
          <div className="overlay-content">
            <h2 className="overlay-title">{s.complete}</h2>
            <div className="result-grid">
              <div className="result-item">
                <span className="result-label">{s.score}</span>
                <span className="result-value result-score">{metrics.totalScore}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.grade}</span>
                <span className="result-value result-grade">{grade}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.completions}</span>
                <span className="result-value">{metrics.totalCompletions}</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.switchReaction}</span>
                <span className="result-value">
                  {metrics.avgSwitchReactionMs}
                  {s.ms}
                </span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.firstSwitchAcc}</span>
                <span className="result-value">{metrics.firstSwitchAccuracy}%</span>
              </div>
              <div className="result-item">
                <span className="result-label">{s.errorRate}</span>
                <span className="result-value">{metrics.postSwitchErrorRate}%</span>
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
          gap: 24px;
          padding: 12px 16px;
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
          font-size: 1.05rem;
          font-weight: 700;
          color: #E8E8E8;
        }
        .hud-timer { color: #FFD700; }
        .hud-danger {
          color: #FF4500;
          animation: pulse 0.5s infinite alternate;
        }
        .hud-active {
          color: #FF4500;
          text-shadow: 0 0 12px rgba(255,69,0,0.5);
        }
        .hud-score { color: #FFD700; }
        .hud-rule-bar {
          display: flex;
          justify-content: center;
          padding: 6px 16px;
        }
        .rule-tag {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 14px;
          border: 1px solid;
          border-radius: 4px;
          background: rgba(22,22,24,0.6);
        }
        .rule-board {
          font-weight: 700;
          font-size: 1rem;
          color: #E8E8E8;
        }
        .rule-text {
          font-size: 0.85rem;
          color: #7A7A82;
        }
        .hud-keys {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
        }
        .key-hint {
          font-size: 0.72rem;
          color: #7A7A82;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .board-keys {
          display: flex;
          gap: 8px;
        }
        .board-key {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid;
          border-radius: 4px;
          background: rgba(22,22,24,0.5);
          transition: all 0.2s;
        }
        .board-key-active {
          background: rgba(255,69,0,0.15);
          transform: scale(1.1);
        }
        .board-key-player {
          border-width: 3px;
        }
        .board-key-label {
          font-weight: 700;
          font-size: 0.9rem;
          color: #E8E8E8;
        }
        .hud-center {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .phase-msg {
          font-size: 1.3rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          text-shadow: 0 2px 12px rgba(0,0,0,0.8);
        }
        .phase-wait { color: #7A7A82; }
        .phase-go {
          color: #FFD700;
          text-shadow: 0 0 20px rgba(255,215,0,0.5);
          animation: pulse 1s infinite alternate;
        }
        @keyframes pulse {
          from { transform: scale(1); }
          to { transform: scale(1.06); }
        }
        .hud-bottom {
          display: flex;
          justify-content: center;
          padding: 16px;
        }
        .sub-metrics {
          display: flex;
          gap: 24px;
          padding: 8px 20px;
          background: rgba(22,22,24,0.6);
          backdrop-filter: blur(8px);
          border-radius: 4px;
        }
        .sub-metric {
          font-size: 0.8rem;
          color: #7A7A82;
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
          max-width: 560px;
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
          margin-bottom: 24px;
          font-size: 0.95rem;
        }
        .board-preview {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 28px;
          text-align: left;
          padding: 16px;
          background: rgba(255,255,255,0.03);
          border-radius: 4px;
          border: 1px solid rgba(255,69,0,0.1);
        }
        .preview-board {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .preview-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .preview-name {
          font-weight: 700;
          color: #E8E8E8;
          font-size: 0.9rem;
          width: 20px;
        }
        .preview-rule {
          color: #7A7A82;
          font-size: 0.85rem;
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
      `}</style>
    </div>
  );
}
