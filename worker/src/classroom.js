// مدیریت کلاس‌های آنلاین، حضور و غیاب و پیوند به فایل‌های ضبط‌شدهٔ موقت.
import { json, readJsonBody } from './http.js';
import { currentUser } from './auth/routes.js';
import { requireAdmin } from './admin.js';
import { generateToken, hashToken } from './auth/token.js';

const PROVIDERS = new Set(['jitsi', 'google_meet']);
const clean = (value) => typeof value === 'string' ? value.trim() : '';
const nowIso = () => new Date().toISOString();
const roomToken = () => generateToken(32);
const validMeetUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'meet.google.com' && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/i.test(url.pathname);
  } catch { return false; }
};

const GOOGLE_MEET_SCOPE = 'https://www.googleapis.com/auth/meetings.space.created';
const GOOGLE_REDIRECT_URI = 'https://mokhtari.ir/api/admin/classroom/google/callback';
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
async function googleTokenKey(env) {
  if (!env.GOOGLE_TOKEN_ENCRYPTION_KEY) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY_MISSING');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.GOOGLE_TOKEN_ENCRYPTION_KEY));
  return crypto.subtle.importKey('raw', digest, {name:'AES-GCM'}, false, ['encrypt','decrypt']);
}
async function encryptGoogleToken(value, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await googleTokenKey(env);
  const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv}, key, new TextEncoder().encode(value));
  return b64(iv)+'.'+b64(encrypted);
}
async function decryptGoogleToken(value, env) {
  const [iv, encrypted] = String(value || '').split('.');
  if (!iv || !encrypted) throw new Error('GOOGLE_TOKEN_INVALID');
  const key = await googleTokenKey(env);
  const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv)}, key, unb64(encrypted));
  return new TextDecoder().decode(plain);
}
async function googleMeetOAuthCallback(request, env) {
  const url = new URL(request.url);
  const state = clean(url.searchParams.get('state'));
  if (!state) return new Response('درخواست اتصال Google نامعتبر است.', {status:400});
  const stateHash = await hashToken(state);
  const saved = await env.DB.prepare('SELECT admin_user_id FROM google_meet_oauth_states WHERE state_hash=?1 AND expires_at>?2')
    .bind(stateHash, nowIso()).first();
  await env.DB.prepare('DELETE FROM google_meet_oauth_states WHERE state_hash=?1').bind(stateHash).run();
  if (!saved) return new Response('مهلت یا اعتبار درخواست اتصال Google پایان یافته است. دوباره از پنل مدیریت اقدام کنید.', {status:400});
  if (url.searchParams.has('error')) return Response.redirect('https://mokhtari.ir/#/admin', 302);
  const code = clean(url.searchParams.get('code'));
  if (!code || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
    return new Response('تنظیمات اتصال Google کامل نیست یا کد تأیید دریافت نشد.', {status:503});
  }
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:GOOGLE_REDIRECT_URI,grant_type:'authorization_code'})
  });
  const tokens = await tokenResponse.json().catch(()=>({}));
  if (!tokenResponse.ok) {
    console.error(JSON.stringify({where:'google-meet-oauth',status:tokenResponse.status}));
    return new Response('اتصال حساب Google انجام نشد. تنظیمات OAuth را بررسی و دوباره تلاش کنید.', {status:502});
  }
  let refreshToken = clean(tokens.refresh_token);
  if (!refreshToken) {
    const previous = await env.DB.prepare('SELECT refresh_token_encrypted FROM google_meet_credentials WHERE id=1').first();
    if (previous?.refresh_token_encrypted) refreshToken = await decryptGoogleToken(previous.refresh_token_encrypted, env);
  }
  if (!refreshToken) return new Response('Google توکن تمدید صادر نکرد. اتصال را دوباره با دسترسی آفلاین و تأیید مجدد انجام دهید.', {status:502});
  const encrypted = await encryptGoogleToken(refreshToken, env);
  await env.DB.prepare(`INSERT INTO google_meet_credentials(id,refresh_token_encrypted,connected_by,connected_at)
    VALUES(1,?1,?2,?3) ON CONFLICT(id) DO UPDATE SET refresh_token_encrypted=excluded.refresh_token_encrypted,
    connected_by=excluded.connected_by,connected_at=excluded.connected_at`).bind(encrypted,saved.admin_user_id,nowIso()).run();
  return Response.redirect('https://mokhtari.ir/#/admin', 302);
}
async function googleMeetConnection(request, env, path) {
  const admin = await requireAdmin(request,env);
  if (admin.response) return admin.response;
  if (path.endsWith('/status') && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT connected_at FROM google_meet_credentials WHERE id=1').first();
    return json({ok:true,configured:Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_TOKEN_ENCRYPTION_KEY),connected:Boolean(row),connectedAt:row?.connected_at||null});
  }
  if (path.endsWith('/connect') && request.method === 'POST') {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
      return json({ok:false,error:'GOOGLE_OAUTH_NOT_CONFIGURED'},503);
    }
    const state = generateToken(32);
    await env.DB.prepare('INSERT INTO google_meet_oauth_states(state_hash,admin_user_id,expires_at) VALUES(?1,?2,?3)')
      .bind(await hashToken(state),admin.user.id,new Date(Date.now()+10*60000).toISOString()).run();
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.search = new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:GOOGLE_REDIRECT_URI,response_type:'code',scope:GOOGLE_MEET_SCOPE,access_type:'offline',prompt:'consent',include_granted_scopes:'true',state}).toString();
    return json({ok:true,authUrl:authUrl.toString()});
  }
  if (path.endsWith('/disconnect') && request.method === 'POST') {
    await env.DB.prepare('DELETE FROM google_meet_credentials WHERE id=1').run();
    return json({ok:true});
  }
  return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET, POST'});
}
async function createGoogleMeetSpace(env) {
  const stored = await env.DB.prepare('SELECT refresh_token_encrypted FROM google_meet_credentials WHERE id=1').first();
  if (!stored?.refresh_token_encrypted) return {ok:false,error:'GOOGLE_MEET_NOT_CONNECTED'};
  const refreshToken = await decryptGoogleToken(stored.refresh_token_encrypted,env);
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:refreshToken,grant_type:'refresh_token'})
  });
  const tokenData = await tokenResponse.json().catch(()=>({}));
  if (!tokenResponse.ok || !tokenData.access_token) {
    console.error(JSON.stringify({where:'google-meet-refresh',status:tokenResponse.status}));
    return {ok:false,error:'GOOGLE_MEET_REAUTH_REQUIRED'};
  }
  const response = await fetch('https://meet.googleapis.com/v2/spaces', {
    method:'POST',headers:{Authorization:'Bearer '+tokenData.access_token,'Content-Type':'application/json'},body:'{}'
  });
  const space = await response.json().catch(()=>({}));
  if (!response.ok || !validMeetUrl(space.meetingUri)) {
    console.error(JSON.stringify({where:'google-meet-create-space',status:response.status}));
    return {ok:false,error:'GOOGLE_MEET_CREATE_FAILED'};
  }
  return {ok:true,meetingUrl:space.meetingUri};
}

async function providerSetting(env) {
  try {
    const row = await env.DB.prepare("SELECT setting_value FROM app_settings WHERE setting_key='classroom_provider'").first();
    return PROVIDERS.has(row?.setting_value) ? row.setting_value : 'jitsi';
  } catch { return 'jitsi'; }
}
function sessionDto(row) {
  return {
    id: row.id, title: row.title, description: row.description, provider: row.provider,
    startsAt: row.starts_at, durationMinutes: row.duration_minutes,
    endsAt: new Date(Date.parse(row.starts_at) + row.duration_minutes * 60000).toISOString(),
    status: row.status, guestEnabled: Boolean(row.guest_enabled), recordingAvailable: Boolean(row.recording_available),
    instructorName: row.instructor_name || null,
  };
}
function canJoin(row) {
  const start = Date.parse(row.starts_at);
  const end = start + row.duration_minutes * 60000;
  const now = Date.now();
  return row.status === 'scheduled' && now >= start - 15 * 60000 && now <= end + 30 * 60000;
}
function updateAttendanceSql(table, whereColumn) {
  return `UPDATE ${table}
    SET duration_seconds = duration_seconds + CASE WHEN last_seen_at IS NULL THEN 0
      ELSE MIN(180, MAX(0, CAST((julianday(?1)-julianday(last_seen_at))*86400 AS INTEGER))) END,
      last_seen_at=?1, left_at=NULL WHERE ${whereColumn}=?2`;
}
async function recordMemberJoin(env, sessionId, userId) {
  const stamp = nowIso();
  await env.DB.prepare(`INSERT INTO classroom_attendance(session_id,user_id,joined_at,last_seen_at)
    VALUES(?1,?2,?3,?3)
    ON CONFLICT(session_id,user_id) WHERE user_id IS NOT NULL
    DO UPDATE SET last_seen_at=excluded.last_seen_at,left_at=NULL`).bind(sessionId,userId,stamp).run();
}
async function recordMemberHeartbeat(env, sessionId, userId, leave = false) {
  const stamp = nowIso();
  await env.DB.prepare(`UPDATE classroom_attendance SET
    duration_seconds=duration_seconds+MIN(180,MAX(0,CAST((julianday(?1)-julianday(last_seen_at))*86400 AS INTEGER))),
    last_seen_at=?1, left_at=${leave ? '?1' : 'NULL'}
    WHERE session_id=?2 AND user_id=?3`).bind(stamp,sessionId,userId).run();
}
async function recordGuestHeartbeat(env, sessionId, tokenHash, leave = false) {
  const stamp = nowIso();
  await env.DB.prepare(`UPDATE classroom_attendance SET
    duration_seconds=duration_seconds+MIN(180,MAX(0,CAST((julianday(?1)-julianday(last_seen_at))*86400 AS INTEGER))),
    last_seen_at=?1, left_at=${leave ? '?1' : 'NULL'}
    WHERE session_id=?2 AND guest_token_hash=?3`).bind(stamp,sessionId,tokenHash).run();
}

export async function handleClassroom(request, env, path) {
  if (!env.DB) return json({ ok:false,error:'DB_NOT_CONFIGURED' },503);
  const method = request.method;
  try {
    if (path === '/api/admin/classroom/google/callback' && method === 'GET') return await googleMeetOAuthCallback(request,env);
    if (path.startsWith('/api/admin/classroom/google/')) return await googleMeetConnection(request,env,path);
    if (path === '/api/admin/classroom/instructors') {
      const admin = await requireAdmin(request,env);
      if (admin.response) return admin.response;
      if (method === 'GET') {
        const rows = await env.DB.prepare(`SELECT u.id,u.display_name AS displayName,
          CASE WHEN ci.user_id IS NOT NULL AND ci.revoked_at IS NULL THEN 1 ELSE 0 END AS isInstructor
          FROM users u LEFT JOIN classroom_instructors ci ON ci.user_id=u.id
          WHERE u.status='active' AND u.membership_status='approved'
          ORDER BY u.display_name COLLATE NOCASE LIMIT 500`).all();
        return json({ok:true,instructors:rows.results||[]});
      }
      if (method !== 'POST') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET, POST'});
      const parsed = await readJsonBody(request); if (parsed.error) return parsed.error;
      const userId = Number(parsed.body?.userId);
      const enabled = parsed.body?.enabled === true;
      if (!Number.isSafeInteger(userId) || userId < 1) return json({ok:false,error:'VALIDATION_FAILED'},422);
      const target = await env.DB.prepare("SELECT id FROM users WHERE id=?1 AND status='active' AND membership_status='approved'").bind(userId).first();
      if (!target) return json({ok:false,error:'APPROVED_MEMBER_NOT_FOUND'},404);
      if (enabled) {
        await env.DB.prepare(`INSERT INTO classroom_instructors(user_id,granted_by,revoked_at)
          VALUES(?1,?2,NULL) ON CONFLICT(user_id) DO UPDATE SET granted_by=excluded.granted_by,
          granted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),revoked_at=NULL`).bind(userId,admin.user.id).run();
      } else {
        await env.DB.prepare("UPDATE classroom_instructors SET revoked_at=?1 WHERE user_id=?2 AND revoked_at IS NULL").bind(nowIso(),userId).run();
        await env.DB.prepare('UPDATE classroom_sessions SET instructor_id=NULL WHERE instructor_id=?1').bind(userId).run();
      }
      return json({ok:true,userId,enabled});
    }
    if (path === '/api/admin/classroom/sessions') {
      const admin = await requireAdmin(request,env);
      if (admin.response) return admin.response;
      if (method === 'GET') {
        const rows = await env.DB.prepare(`SELECT s.*,u.display_name AS instructor_name,
          EXISTS(SELECT 1 FROM classroom_recordings r WHERE r.session_id=s.id AND r.status='available' AND r.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS recording_available
          FROM classroom_sessions s LEFT JOIN users u ON u.id=s.instructor_id
          ORDER BY s.starts_at DESC LIMIT 100`).all();
        return json({ok:true,provider:await providerSetting(env),sessions:(rows.results||[]).map(sessionDto)});
      }
      if (method !== 'POST') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET, POST'});
      const parsed = await readJsonBody(request); if (parsed.error) return parsed.error;
      const body = parsed.body || {};
      const title = clean(body.title), description = clean(body.description);
      const startsAt = clean(body.startsAt);
      const duration = Number(body.durationMinutes);
      const guestEnabled = body.guestEnabled === true;
      const instructorId = body.instructorId == null || body.instructorId === '' ? null : Number(body.instructorId);
      const timestamp = Date.parse(startsAt);
      if (title.length < 3 || title.length > 120 || description.length > 1500 ||
          !Number.isFinite(timestamp) || timestamp < Date.now() - 5*60000 || timestamp > Date.now() + 90*86400000 ||
          !Number.isInteger(duration) || duration < 15 || duration > 240) {
        return json({ok:false,error:'VALIDATION_FAILED',message:'عنوان، زمان شروع یا مدت کلاس معتبر نیست.'},422);
      }
      const provider = await providerSetting(env);
      let meetingUrl = provider === 'google_meet' ? clean(body.meetingUrl) : null;
      if (provider === 'google_meet' && !validMeetUrl(meetingUrl)) {
        const createdMeeting = await createGoogleMeetSpace(env);
        if (!createdMeeting.ok) return json({ok:false,error:createdMeeting.error}, createdMeeting.error === 'GOOGLE_MEET_NOT_CONNECTED' ? 409 : 502);
        meetingUrl = createdMeeting.meetingUrl;
      }
      if (instructorId !== null) {
        if (!Number.isSafeInteger(instructorId) || instructorId < 1) return json({ok:false,error:'INVALID_INSTRUCTOR'},422);
        const assigned = await env.DB.prepare(`SELECT 1 FROM classroom_instructors ci
          JOIN users u ON u.id=ci.user_id
          WHERE ci.user_id=?1 AND ci.revoked_at IS NULL AND u.status='active' AND u.membership_status='approved'`).bind(instructorId).first();
        if (!assigned) return json({ok:false,error:'INVALID_INSTRUCTOR',message:'مدرس انتخاب‌شده مجوز تدریس فعال ندارد.'},422);
      }
      const roomName = provider === 'jitsi' ? 'wefagh-' + roomToken() : null;
      const guestCode = guestEnabled ? generateToken(18) : null;
      const guestCodeHash = guestCode ? await hashToken(guestCode) : null;
      const result = await env.DB.prepare(`INSERT INTO classroom_sessions
        (title,description,provider,room_name,meeting_url,guest_enabled,guest_code_hash,starts_at,duration_minutes,created_by,instructor_id)
        VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11) RETURNING id`)
        .bind(title,description,provider,roomName,provider==='google_meet'?meetingUrl:null,guestEnabled?1:0,guestCodeHash,new Date(timestamp).toISOString(),duration,admin.user.id,instructorId).first();
      return json({ok:true,sessionId:result.id,guestCode,meetingUrl:provider==='google_meet'?meetingUrl:null,session:{id:result.id,title,provider,startsAt:new Date(timestamp).toISOString(),durationMinutes:duration,guestEnabled}},201);
    }
    const adminMatch = path.match(/^\/api\/admin\/classroom\/sessions\/(\d+)(?:\/(attendance))?$/);
    if (adminMatch) {
      const admin = await requireAdmin(request,env);
      if (admin.response) return admin.response;
      const id = Number(adminMatch[1]);
      const session = await env.DB.prepare('SELECT * FROM classroom_sessions WHERE id=?1').bind(id).first();
      if (!session) return json({ok:false,error:'NOT_FOUND'},404);
      if (adminMatch[2] === 'attendance') {
        if (method !== 'GET') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET'});
        const rows = await env.DB.prepare(`SELECT a.joined_at,a.left_at,a.duration_seconds,
          COALESCE(u.display_name,a.guest_name) AS display_name,
          CASE WHEN a.user_id IS NULL THEN 'مهمان' ELSE 'عضو' END AS attendee_type
          FROM classroom_attendance a LEFT JOIN users u ON u.id=a.user_id
          WHERE a.session_id=?1 ORDER BY a.joined_at`).bind(id).all();
        return json({ok:true,attendance:rows.results||[]});
      }
      if (method !== 'PATCH') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'PATCH'});
      const parsed=await readJsonBody(request); if(parsed.error)return parsed.error;
      if (parsed.body?.status !== 'cancelled') return json({ok:false,error:'VALIDATION_FAILED'},422);
      await env.DB.prepare("UPDATE classroom_sessions SET status='cancelled',updated_at=?1 WHERE id=?2").bind(nowIso(),id).run();
      return json({ok:true});
    }
    if (path === '/api/classroom/sessions') {
      if (method !== 'GET') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET'});
      const user = await currentUser(request,env);
      if (!user) return json({ok:false,error:'UNAUTHENTICATED'},401);
      const rows = await env.DB.prepare(`SELECT s.*,u.display_name AS instructor_name,
        EXISTS(SELECT 1 FROM classroom_recordings r WHERE r.session_id=s.id AND r.status='available' AND r.expires_at>?1) AS recording_available
        FROM classroom_sessions s LEFT JOIN users u ON u.id=s.instructor_id
        WHERE s.starts_at >= ?2 AND s.status='scheduled' ORDER BY s.starts_at ASC LIMIT 100`)
        .bind(new Date().toISOString(),new Date(Date.now()-3*86400000).toISOString()).all();
      return json({ok:true,sessions:(rows.results||[]).map(row=>({...sessionDto(row),canHost:row.instructor_id===user.id}))});
    }
    const hostMatch = path.match(/^\/api\/classroom\/sessions\/(\d+)\/host$/);
    if (hostMatch) {
      if (method !== 'GET') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET'});
      const user = await currentUser(request,env);
      if (!user) return json({ok:false,error:'UNAUTHENTICATED'},401);
      const id = Number(hostMatch[1]);
      const session = await env.DB.prepare('SELECT * FROM classroom_sessions WHERE id=?1').bind(id).first();
      if (!session || !canJoin(session) || session.provider !== 'jitsi' || !session.room_name) return json({ok:false,error:'CLASS_NOT_OPEN'},409);
      const grant = await env.DB.prepare('SELECT 1 FROM classroom_instructors WHERE user_id=?1 AND revoked_at IS NULL').bind(user.id).first();
      if (!grant || session.instructor_id !== user.id) return json({ok:false,error:'FORBIDDEN'},403);
      await recordMemberJoin(env,id,user.id);
      const config='config.prejoinConfig.enabled=true&config.fileRecordingsEnabled=false&config.liveStreamingEnabled=false&config.transcription.enabled=false&config.disableDeepLinking=true';
      return json({ok:true,hostUrl:'https://meet.jit.si/'+encodeURIComponent(session.room_name)+'#'+config,roomName:session.room_name});
    }
    const memberMatch = path.match(/^\/api\/classroom\/sessions\/(\d+)\/(join|heartbeat|leave)$/);
    if (memberMatch) {
      const user = await currentUser(request,env);
      if (!user) return json({ok:false,error:'UNAUTHENTICATED'},401);
      const id=Number(memberMatch[1]), action=memberMatch[2];
      const session=await env.DB.prepare('SELECT * FROM classroom_sessions WHERE id=?1').bind(id).first();
      if (!session || !canJoin(session)) return json({ok:false,error:'CLASS_NOT_OPEN'},409);
      if (action==='join') {
        if (method!=='POST') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'POST'});
        await recordMemberJoin(env,id,user.id);
        return json({ok:true,provider:session.provider,roomName:session.room_name,meetingUrl:session.meeting_url,displayName:user.displayName});
      }
      if (method!=='POST') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'POST'});
      const existing=await env.DB.prepare('SELECT id FROM classroom_attendance WHERE session_id=?1 AND user_id=?2').bind(id,user.id).first();
      if (!existing) return json({ok:false,error:'NOT_FOUND'},404);
      await recordMemberHeartbeat(env,id,user.id,action==='leave');
      return json({ok:true});
    }
    const guestMatch = path.match(/^\/api\/classroom\/guest\/(\d+)\/(join|heartbeat|leave)$/);
    if (guestMatch) {
      const id=Number(guestMatch[1]), action=guestMatch[2];
      if (method!=='POST') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'POST'});
      const parsed=await readJsonBody(request); if(parsed.error)return parsed.error;
      const body=parsed.body||{};
      const session=await env.DB.prepare('SELECT * FROM classroom_sessions WHERE id=?1').bind(id).first();
      if (!session || !session.guest_enabled || !canJoin(session)) return json({ok:false,error:'CLASS_NOT_OPEN'},409);
      if (action==='join') {
        const code=clean(body.code),name=clean(body.name);
        if (name.length<2||name.length>80||!code||(await hashToken(code)) !== session.guest_code_hash) {
          return json({ok:false,error:'INVALID_GUEST_ACCESS'},403);
        }
        const guestToken=generateToken(32),guestHash=await hashToken(guestToken);
        await env.DB.prepare('INSERT INTO classroom_attendance(session_id,guest_name,guest_token_hash) VALUES(?1,?2,?3)')
          .bind(id,name,guestHash).run();
        return json({ok:true,guestToken,provider:session.provider,roomName:session.room_name,meetingUrl:session.meeting_url,displayName:name});
      }
      const token=clean(body.guestToken);
      if (!token) return json({ok:false,error:'UNAUTHENTICATED'},401);
      const tokenHash=await hashToken(token);
      const existing=await env.DB.prepare('SELECT id FROM classroom_attendance WHERE session_id=?1 AND guest_token_hash=?2').bind(id,tokenHash).first();
      if (!existing) return json({ok:false,error:'UNAUTHENTICATED'},401);
      await recordGuestHeartbeat(env,id,tokenHash,action==='leave');
      return json({ok:true});
    }
    return json({ok:false,error:'NOT_FOUND'},404);
  } catch (error) {
    console.error(JSON.stringify({where:'classroom',error:error?.name||'Error'}));
    return json({ok:false,error:'INTERNAL_ERROR'},500);
  }
}
