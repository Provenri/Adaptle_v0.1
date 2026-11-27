import { corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts';

const CATEGORIES = new Set(['GENERAL', 'SUPPORT', 'PRIVACY', 'COPYRIGHT', 'LEGAL']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY_BYTES = 16_384;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;

type ContactPayload = {
  category: string;
  subject: string;
  message: string;
  name?: string;
  replyEmail?: string;
  anonymousUserId?: string;
  website?: string;
  submittedAt?: number;
  privacyAccepted: boolean;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405);

  let operation = 'process the contact request';
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return errorResponse('Request is too large', 413);
    }
    const payload = parsePayload(rawBody);
    if (!payload) return errorResponse('Invalid contact request', 400);
    if (payload.website) return jsonResponse({ accepted: true });
    if (
      typeof payload.submittedAt === 'number' &&
      Date.now() - payload.submittedAt < 2_000
    ) {
      return errorResponse('Please wait briefly before submitting', 429);
    }

    const userId = await authenticateUser(request);
    if (!userId) return errorResponse('A signed-in session is required', 401);
    const service = serviceConfiguration();
    if (payload.anonymousUserId && payload.anonymousUserId !== userId) {
      return errorResponse('Invalid anonymous user identifier', 400);
    }
    operation = 'check the contact request limit';
    if (await isRateLimited(userId, service)) {
      return errorResponse('Too many contact requests. Please try again later.', 429);
    }

    const requestId = crypto.randomUUID();
    operation = 'store the contact request';
    await insertContactRequest(requestId, userId, payload, service);
    operation = 'send the contact notification';
    const notificationStatus = await sendNotification(requestId, payload, service);
    await updateNotificationStatus(requestId, notificationStatus, service);

    return jsonResponse({
      accepted: true,
      requestId,
      notificationStatus,
    });
  } catch (error) {
    console.error(`Contact submission failed while trying to ${operation}`, error);
    return errorResponse(`Unable to ${operation} right now. Please try email.`, 502);
  }
});

function parsePayload(rawBody: string): ContactPayload | null {
  try {
    const value = JSON.parse(rawBody) as Record<string, unknown>;
    const category = normalizeSingleLine(value.category);
    const subject = normalizeSingleLine(value.subject);
    const message = typeof value.message === 'string' ? value.message.trim() : '';
    const name = normalizeOptionalSingleLine(value.name, 100);
    const replyEmail = normalizeOptionalSingleLine(value.replyEmail, 254).toLowerCase();
    if (!CATEGORIES.has(category) || subject.length < 3 || subject.length > 120) return null;
    if (message.length < 10 || message.length > 5000) return null;
    if (!replyEmail || !EMAIL_PATTERN.test(replyEmail)) return null;
    if (value.privacyAccepted !== true) return null;
    return {
      category,
      subject,
      message,
      name: name || undefined,
      replyEmail,
      anonymousUserId: normalizeOptionalSingleLine(value.anonymousUserId, 36) || undefined,
      website: normalizeOptionalSingleLine(value.website, 200),
      submittedAt: typeof value.submittedAt === 'number' ? value.submittedAt : undefined,
      privacyAccepted: true,
    };
  } catch {
    return null;
  }
}

function normalizeSingleLine(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeOptionalSingleLine(value: unknown, limit: number): string {
  return normalizeSingleLine(value).slice(0, limit);
}

async function authenticateUser(request: Request): Promise<string | null> {
  const { supabaseUrl, serviceKey } = serviceConfiguration();
  const bearer = request.headers.get('Authorization');
  if (!bearer) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: bearer },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === 'string' ? user.id : null;
}

async function isRateLimited(
  userId: string,
  service: ReturnType<typeof serviceConfiguration>,
): Promise<boolean> {
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const url = new URL(`${service.supabaseUrl}/rest/v1/contact_requests`);
  url.searchParams.set('select', 'id');
  url.searchParams.set('anonymous_user_id', `eq.${userId}`);
  url.searchParams.set('created_at', `gte.${since}`);
  url.searchParams.set('limit', RATE_LIMIT.toString());
  const response = await fetch(url, {
    headers: {
      apikey: service.serviceKey,
      Authorization: `Bearer ${service.serviceKey}`,
    },
  });
  if (!response.ok) throw new Error(`Rate-limit query failed: ${response.status}`);
  const requests = await response.json();
  if (!Array.isArray(requests)) throw new Error('Rate-limit query returned an invalid response');
  return requests.length >= RATE_LIMIT;
}

async function insertContactRequest(
  requestId: string,
  userId: string,
  payload: ContactPayload,
  service: ReturnType<typeof serviceConfiguration>,
): Promise<void> {
  const response = await fetch(`${service.supabaseUrl}/rest/v1/contact_requests`, {
    method: 'POST',
    headers: serviceHeaders(service),
    body: JSON.stringify({
      id: requestId,
      anonymous_user_id: userId,
      category: payload.category,
      subject: payload.subject,
      message: payload.message,
      name: payload.name ?? null,
      reply_email: payload.replyEmail ?? null,
    }),
  });
  if (!response.ok) throw new Error(`Contact insert failed: ${response.status}`);
}

async function sendNotification(
  requestId: string,
  payload: ContactPayload,
  service: ReturnType<typeof serviceConfiguration>,
): Promise<'SENT' | 'FAILED' | 'NOT_CONFIGURED'> {
  if (!service.resendKey || !service.fromEmail || !service.toEmail) return 'NOT_CONFIGURED';
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${service.resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: service.fromEmail,
        to: [service.toEmail],
        reply_to: payload.replyEmail,
        subject: `[Adaptle ${payload.category}] ${payload.subject}`,
        text: [
          `Request ID: ${requestId}`,
          `Category: ${payload.category}`,
          `Name: ${payload.name ?? 'Not provided'}`,
          `Reply email: ${payload.replyEmail}`,
          '',
          payload.message,
        ].join('\n'),
      }),
    });
    if (response.ok) return 'SENT';
    const details = (await response.text()).slice(0, 500);
    console.error(`Contact email provider rejected the request: ${response.status}`, details);
    return 'FAILED';
  } catch (error) {
    console.error('Contact email provider request failed', error);
    return 'FAILED';
  }
}

async function updateNotificationStatus(
  requestId: string,
  status: 'SENT' | 'FAILED' | 'NOT_CONFIGURED',
  service: ReturnType<typeof serviceConfiguration>,
): Promise<void> {
  const response = await fetch(
    `${service.supabaseUrl}/rest/v1/contact_requests?id=eq.${requestId}`,
    {
      method: 'PATCH',
      headers: serviceHeaders(service),
      body: JSON.stringify({ notification_status: status }),
    },
  );
  if (!response.ok) console.error(`Failed to update notification status: ${response.status}`);
}

function serviceConfiguration() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) throw new Error('Supabase service configuration is missing');
  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
    serviceKey,
    resendKey: Deno.env.get('RESEND_API_KEY'),
    fromEmail: Deno.env.get('CONTACT_FROM_EMAIL'),
    toEmail: Deno.env.get('CONTACT_TO_EMAIL'),
  };
}

function serviceHeaders(service: ReturnType<typeof serviceConfiguration>) {
  return {
    apikey: service.serviceKey,
    Authorization: `Bearer ${service.serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };
}
