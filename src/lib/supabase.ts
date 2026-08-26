import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase 客户端——懒初始化 + 环境变量缺失时返回 null 兜底。
 *
 * 核心原则：**不要在模块顶层 throw**，否则 React 岛屿在 <client:only> 水合阶段
 * 会直接崩掉整棵子树（白屏）。因为 AGENTS.md 约定"测试免登录免费"，所以训练
 * 模块必须在 Supabase 未配置时仍能独立运行，只是无法保存成绩。
 *
 * 调用方用法（统一判空模式）：
 *   const sb = getSupabase();
 *   if (sb) { await sb.auth.getSession(); }
 */

const supabaseUrl = (import.meta.env?.PUBLIC_SUPABASE_URL as string | undefined)?.trim();
const supabaseAnonKey = (import.meta.env?.PUBLIC_SUPABASE_ANON_KEY as string | undefined)?.trim();

let _client: SupabaseClient | null | undefined = undefined; // undefined = 未初始化
let _warned = false;

export function getSupabase(): SupabaseClient | null {
  if (_client !== undefined) return _client;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (!_warned) {
      console.warn(
        '[supabase] PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY not configured. ' +
          'Guest-test mode enabled: auth & save-score disabled; training runs normally.',
      );
      _warned = true;
    }
    _client = null;
    return null;
  }

  try {
    _client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (err) {
    if (!_warned) {
      console.warn('[supabase] createClient failed, falling back to guest mode:', err);
      _warned = true;
    }
    _client = null;
  }
  return _client;
}

export type AuthSession = Awaited<
  ReturnType<SupabaseClient['auth']['getSession']>
>['data']['session'];
