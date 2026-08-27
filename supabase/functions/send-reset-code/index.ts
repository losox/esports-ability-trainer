// Supabase Edge Function: send-reset-code
// 部署：supabase functions deploy send-reset-code
// 环境变量：RESEND_API_KEY（或其他邮件服务密钥，在 Supabase Dashboard → Edge Functions 设置）

interface EmailRequest {
  email: string;
  code: string;
}

interface EmailResponse {
  success: boolean;
  error?: string;
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'noreply@forgegaming.com';
const FROM_NAME = Deno.env.get('FROM_NAME') || 'ForgeGaming';

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  try {
    const { email, code } = (await req.json()) as EmailRequest;

    if (!email || !code) {
      return jsonResponse({ success: false, error: 'email and code required' }, 400);
    }

    if (!RESEND_API_KEY) {
      console.log('[send-reset-code] No RESEND_API_KEY set. Code for', email, ':', code);
      return jsonResponse({ success: true, debug_code: code });
    }

    const htmlBody = `
      <h2>密码重置验证码</h2>
      <p>你的验证码是：</p>
      <h1 style="font-size: 32px; letter-spacing: 8px; text-align: center; color: #FF4500;">${code}</h1>
      <p>该验证码将在 10 分钟内有效。</p>
      <p>如果这不是你的操作，请忽略此邮件。</p>
      <hr>
      <p style="color: #888; font-size: 12px;">ForgeGaming — 电竞能力训练平台</p>
    `;

    const textBody = `
      密码重置验证码：${code}
      该验证码将在 10 分钟内有效。
      ForgeGaming
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [email],
        subject: 'ForgeGaming 密码重置验证码',
        html: htmlBody,
        text: textBody,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[send-reset-code] Resend API error:', err);
      return jsonResponse({ success: false, error: 'Failed to send email' }, 500);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('[send-reset-code] Unexpected error:', err);
    return jsonResponse({ success: false, error: 'Internal error' }, 500);
  }
}

function jsonResponse(data: EmailResponse, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
