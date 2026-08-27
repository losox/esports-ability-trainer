import { getSupabase } from './supabase';

export interface DeviceCheckResult {
  allowed: boolean;
  current_count: number;
  remaining: number;
}

export interface ResetRequestResult {
  success: boolean;
  reason?: 'rate_limit' | 'email_not_found' | 'generic';
  attempts?: number;
  max_attempts?: number;
  reset_at?: string;
  code?: string;
  attempts_remaining?: number;
}

export interface ResetVerifyResult {
  success: boolean;
  reason?: 'invalid_code' | 'code_mismatch' | 'user_not_found';
}

export async function checkDeviceRegistration(deviceFp: string): Promise<DeviceCheckResult> {
  const sb = getSupabase();
  if (!sb) {
    return { allowed: true, current_count: 0, remaining: 10 };
  }

  const { data, error } = await sb.rpc('check_device_register', {
    p_device_fp: deviceFp,
  });

  if (error) {
    console.error('[auth] check_device_register failed:', error);
    return { allowed: true, current_count: 0, remaining: 10 };
  }

  return {
    allowed: !!data?.allowed,
    current_count: data?.current_count ?? 0,
    remaining: data?.remaining ?? 10,
  };
}

export async function requestPasswordReset(email: string): Promise<ResetRequestResult> {
  const sb = getSupabase();
  if (!sb) {
    return { success: false, reason: 'generic' };
  }

  const { data, error } = await sb.rpc('request_password_reset', {
    p_email: email,
  });

  if (error) {
    console.error('[auth] request_password_reset failed:', error);
    return { success: false, reason: 'generic' };
  }

  return {
    success: !!data?.success,
    reason: data?.reason,
    attempts: data?.attempts,
    max_attempts: data?.max_attempts,
    reset_at: data?.reset_at,
    code: data?.code,
    attempts_remaining: data?.attempts_remaining,
  };
}

export async function verifyAndResetPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<ResetVerifyResult> {
  const sb = getSupabase();
  if (!sb) {
    return { success: false, reason: 'invalid_code' };
  }

  const { data, error } = await sb.rpc('verify_and_reset_password', {
    p_email: email,
    p_code: code,
    p_new_password: newPassword,
  });

  if (error) {
    console.error('[auth] verify_and_reset_password failed:', error);
    return { success: false };
  }

  return {
    success: !!data?.success,
    reason: data?.reason,
  };
}

export interface SendEmailResult {
  success: boolean;
  debugCode?: string;
}

export async function sendResetCodeEmail(email: string, code: string): Promise<SendEmailResult> {
  const sb = getSupabase();
  if (!sb) return { success: false, debugCode: code };

  try {
    const { data, error } = await sb.functions.invoke('send-reset-code', {
      body: { email, code },
    });

    if (error) {
      console.warn('[auth] send-reset-code function failed:', error);
      console.warn('[auth] Reset code for', email, ':', code);
      return { success: false, debugCode: code };
    }

    if (data?.debug_code) {
      return { success: true, debugCode: data.debug_code };
    }
    return { success: true };
  } catch (err) {
    console.warn('[auth] send-reset-code error:', err);
    console.warn('[auth] Reset code for', email, ':', code);
    return { success: false, debugCode: code };
  }
}
