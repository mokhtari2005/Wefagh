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
      if (provider === 'google_meet' && !validMeetUrl(body.meetingUrl)) {
        return json({ok:false,error:'MEETING_URL_REQUIRED',message:'برای Google Meet باید پیوند معتبر جلسه وارد شود.'},422);
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
        .bind(title,description,provider,roomName,provider==='google_meet'?clean(body.meetingUrl):null,guestEnabled?1:0,guestCodeHash,new Date(timestamp).toISOString(),duration,admin.user.id,instructorId).first();
      return json({ok:true,sessionId:result.id,guestCode,session:{id:result.id,title,provider,startsAt:new Date(timestamp).toISOString(),durationMinutes:duration,guestEnabled}},201);
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
