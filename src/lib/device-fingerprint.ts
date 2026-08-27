/**
 * 设备指纹生成器——基于浏览器特征的简单哈希，用于限制同设备注册上限。
 *
 * 注意：这不是安全级别的设备标识，仅用于防止简单的多开刷注册。
 * 采用 Canvas 指纹 + UA + 分辨率 + 时区 + 语言 的组合哈希。
 */

const FP_STORAGE_KEY = 'forge_device_fp';

function hash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(36).padStart(8, '0');
}

function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';

    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 200, 50);
    ctx.fillStyle = '#069';
    ctx.fillText('ForgeGaming-DevFP-2024', 2, 2);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('ForgeGaming-DevFP-2024', 4, 4);

    return hash(canvas.toDataURL());
  } catch {
    return 'canvas-error';
  }
}

export function getDeviceFingerprint(): string {
  try {
    const stored = localStorage.getItem(FP_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // ignore storage errors (private mode, etc.)
  }

  const parts = [
    navigator.userAgent,
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    new Date().getTimezoneOffset().toString(),
    getCanvasFingerprint(),
  ];

  const fp = hash(parts.join('|'));

  try {
    localStorage.setItem(FP_STORAGE_KEY, fp);
  } catch {
    // ignore storage errors
  }

  return fp;
}

export function resetDeviceFingerprint(): void {
  try {
    localStorage.removeItem(FP_STORAGE_KEY);
  } catch {
    // ignore
  }
}
