// Temporary classroom video uploads to Cloudflare R2; files expire 48 hours after class end.
import { json } from './http.js';
import { currentUser } from './auth/routes.js';
import { requireAdmin } from './admin.js';

const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ACTIVE_STORAGE_BYTES = 9 * 1024 * 1024 * 1024;
const PART_BYTES = 8 * 1024 * 1024;
const clean = (value) => typeof value === 'string' ? value.trim() : '';
const iso = (value) => new Date(value).toISOString();
const safeName = (value) => clean(value).replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 180) || 'class-recording';

function classExpiry(session) {
  const end = Date.parse(session.starts_at) + Number(session.duration_minutes) * 60000;
  return { end, expires: end + 48 * 60 * 60 * 1000 };
}

export async function handleClassroomRecording(request, env, path) {
  const method = request.method;
  const isRecordingRoute = new RegExp('^/api/(?:admin/classroom/(?:sessions/[0-9]+/recording|recordings/[0-9]+(?:/parts/[0-9]+|/complete)?)|classroom/sessions/[0-9]+/recording)$').test(path);
  if (!isRecordingRoute) return null;
  if (!env.DB) return json({ok:false,error:'DB_NOT_CONFIGURED'},503);
  if (!env.CLASSROOM_RECORDINGS) return json({ok:false,error:'RECORDING_STORAGE_NOT_CONFIGURED',message:'فضای ذخیره‌سازی کلاس هنوز به Worker متصل نشده است.'},503);

  try {
    const adminUpload = path.match(/^\/api\/admin\/classroom\/sessions\/(\d+)\/recording$/);
    if (adminUpload) {
      const auth = await requireAdmin(request, env);
      if (auth.response) return auth.response;
      const sessionId = Number(adminUpload[1]);
      if (method === 'DELETE') {
        const existing = await env.DB.prepare('SELECT * FROM classroom_recordings WHERE session_id=?1').bind(sessionId).first();
        if (!existing) return json({ok:true});
        if (existing.multipart_upload_id) {
          try { await env.CLASSROOM_RECORDINGS.resumeMultipartUpload(existing.object_key,existing.multipart_upload_id).abort(); } catch {}
        } else {
          await env.CLASSROOM_RECORDINGS.delete(existing.object_key);
        }
        await env.DB.prepare('DELETE FROM classroom_recordings WHERE id=?1').bind(existing.id).run();
        return json({ok:true});
      }
      if (method !== 'POST') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'POST, DELETE'});
      const session = await env.DB.prepare('SELECT * FROM classroom_sessions WHERE id=?1').bind(sessionId).first();
      if (!session) return json({ok:false,error:'NOT_FOUND'},404);
      const { end, expires } = classExpiry(session);
      if (session.status !== 'scheduled') return json({ok:false,error:'CLASS_NOT_AVAILABLE'},409);
      if (Date.now() < end) return json({ok:false,error:'CLASS_NOT_ENDED'},409);
      if (Date.now() >= expires) return json({ok:false,error:'RETENTION_WINDOW_EXPIRED'},410);
      const body = await request.json().catch(() => null);
      const fileName = safeName(body?.fileName);
      const contentType = clean(body?.contentType).toLowerCase();
      const sizeBytes = Number(body?.sizeBytes);
      if (!['video/mp4','video/webm'].includes(contentType) || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_FILE_BYTES) {
        return json({ok:false,error:'INVALID_RECORDING_FILE',message:'فقط فایل MP4 یا WebM تا سقف ۲ گیگابایت پذیرفته می‌شود.'},422);
      }
      const old = await env.DB.prepare('SELECT * FROM classroom_recordings WHERE session_id=?1').bind(sessionId).first();
      if (old?.status === 'available') return json({ok:false,error:'RECORDING_ALREADY_EXISTS'},409);
      const usage = await env.DB.prepare('SELECT COALESCE(SUM(size_bytes),0) AS total FROM classroom_recordings WHERE expires_at>?1 AND session_id<>?2').bind(new Date().toISOString(),sessionId).first();
      if (Number(usage?.total || 0) + sizeBytes > MAX_ACTIVE_STORAGE_BYTES) return json({ok:false,error:'TEMPORARY_STORAGE_LIMIT',message:'ظرفیت موقت ذخیره‌سازی کلاس‌ها پر شده است؛ پس از حذف فایل‌های منقضی‌شده دوباره تلاش کنید.'},413);
      if (old?.multipart_upload_id) {
        try { await env.CLASSROOM_RECORDINGS.resumeMultipartUpload(old.object_key, old.multipart_upload_id).abort(); } catch {}
        await env.DB.prepare('DELETE FROM classroom_recordings WHERE id=?1').bind(old.id).run();
      }
      const objectKey = 'classroom/' + sessionId + '/' + crypto.randomUUID();
      const upload = await env.CLASSROOM_RECORDINGS.createMultipartUpload(objectKey, {
        httpMetadata: { contentType, cacheControl: 'private, no-store' },
        customMetadata: { sessionId: String(sessionId), expiresAt: iso(expires) },
      });
      const inserted = await env.DB.prepare(`INSERT INTO classroom_recordings
        (session_id,object_key,file_name,content_type,size_bytes,status,multipart_upload_id,expires_at)
        VALUES(?1,?2,?3,?4,?5,'uploading',?6,?7) RETURNING id`)
        .bind(sessionId,objectKey,fileName,contentType,sizeBytes,upload.uploadId,iso(expires)).first();
      return json({ok:true,recordingId:inserted.id,partBytes:PART_BYTES,partCount:Math.ceil(sizeBytes/PART_BYTES),expiresAt:iso(expires)});
    }

    const partMatch = path.match(/^\/api\/admin\/classroom\/recordings\/(\d+)\/parts\/(\d+)$/);
    if (partMatch) {
      const auth = await requireAdmin(request, env);
      if (auth.response) return auth.response;
      if (method !== 'PUT') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'PUT'});
      const id = Number(partMatch[1]), partNumber = Number(partMatch[2]);
      const row = await env.DB.prepare("SELECT * FROM classroom_recordings WHERE id=?1 AND status='uploading'").bind(id).first();
      if (!row || !row.multipart_upload_id) return json({ok:false,error:'NOT_FOUND'},404);
      if (Date.now() >= Date.parse(row.expires_at)) return json({ok:false,error:'RETENTION_WINDOW_EXPIRED'},410);
      if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 300) return json({ok:false,error:'INVALID_PART'},422);
      const data = await request.arrayBuffer();
      const bytes = data.byteLength;
      if (!bytes || bytes > PART_BYTES || bytes > row.size_bytes) return json({ok:false,error:'INVALID_PART'},422);
      const uploaded = await env.CLASSROOM_RECORDINGS.resumeMultipartUpload(row.object_key,row.multipart_upload_id)
        .uploadPart(partNumber,data);
      await env.DB.prepare(`INSERT INTO classroom_recording_parts(recording_id,part_number,etag,size_bytes)
        VALUES(?1,?2,?3,?4) ON CONFLICT(recording_id,part_number)
        DO UPDATE SET etag=excluded.etag,size_bytes=excluded.size_bytes`)
        .bind(id,partNumber,uploaded.etag,data.byteLength).run();
      return json({ok:true,partNumber});
    }

    const completeMatch = path.match(/^\/api\/admin\/classroom\/recordings\/(\d+)\/complete$/);
    if (completeMatch) {
      const auth = await requireAdmin(request, env);
      if (auth.response) return auth.response;
      if (method !== 'POST') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'POST'});
      const id = Number(completeMatch[1]);
      const row = await env.DB.prepare("SELECT * FROM classroom_recordings WHERE id=?1 AND status='uploading'").bind(id).first();
      if (!row || !row.multipart_upload_id) return json({ok:false,error:'NOT_FOUND'},404);
      if (Date.now() >= Date.parse(row.expires_at)) return json({ok:false,error:'RETENTION_WINDOW_EXPIRED'},410);
      const parts = await env.DB.prepare('SELECT part_number,etag,size_bytes FROM classroom_recording_parts WHERE recording_id=?1 ORDER BY part_number').bind(id).all();
      const items = parts.results || [];
      const expected = Math.ceil(row.size_bytes / PART_BYTES);
      if (items.length !== expected || items.some((p,i) => p.part_number !== i+1) || items.reduce((sum,p)=>sum+p.size_bytes,0) !== row.size_bytes) {
        return json({ok:false,error:'UPLOAD_INCOMPLETE',message:'بارگذاری همه بخش‌های فایل کامل نشده است.'},409);
      }
      await env.CLASSROOM_RECORDINGS.resumeMultipartUpload(row.object_key,row.multipart_upload_id)
        .complete(items.map(p=>({partNumber:p.part_number,etag:p.etag})));
      await env.DB.prepare("UPDATE classroom_recordings SET status='available',multipart_upload_id=NULL WHERE id=?1").bind(id).run();
      await env.DB.prepare('DELETE FROM classroom_recording_parts WHERE recording_id=?1').bind(id).run();
      return json({ok:true,expiresAt:row.expires_at});
    }

    const deleteMatch = path.match(/^\/api\/admin\/classroom\/recordings\/(\d+)$/);
    if (deleteMatch) {
      const auth = await requireAdmin(request, env);
      if (auth.response) return auth.response;
      if (method !== 'DELETE') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'DELETE'});
      const id = Number(deleteMatch[1]);
      const row = await env.DB.prepare('SELECT * FROM classroom_recordings WHERE id=?1').bind(id).first();
      if (!row) return json({ok:true});
      if (row.multipart_upload_id) {
        try { await env.CLASSROOM_RECORDINGS.resumeMultipartUpload(row.object_key,row.multipart_upload_id).abort(); } catch {}
      } else {
        await env.CLASSROOM_RECORDINGS.delete(row.object_key);
      }
      await env.DB.prepare('DELETE FROM classroom_recordings WHERE id=?1').bind(id).run();
      return json({ok:true});
    }

    const playMatch = path.match(/^\/api\/classroom\/sessions\/(\d+)\/recording$/);
    if (playMatch) {
      if (method !== 'GET' && method !== 'HEAD') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET, HEAD'});
      const user = await currentUser(request,env);
      if (!user) return json({ok:false,error:'UNAUTHENTICATED'},401);
      const id = Number(playMatch[1]);
      const row = await env.DB.prepare("SELECT r.* FROM classroom_recordings r WHERE r.session_id=?1 AND r.status='available' AND r.expires_at>?2")
        .bind(id,new Date().toISOString()).first();
      if (!row) return json({ok:false,error:'RECORDING_NOT_AVAILABLE'},404);
      const object = await env.CLASSROOM_RECORDINGS.get(row.object_key);
      if (!object) return json({ok:false,error:'RECORDING_NOT_AVAILABLE'},404);
      const headers = new Headers({
        'Content-Type': row.content_type,
        'Content-Disposition': 'inline; filename*=UTF-8\'\'' + encodeURIComponent(row.file_name),
        'Content-Length': String(object.size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      if (method === 'HEAD') return new Response(null,{status:200,headers});
      const range = request.headers.get('range');
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match) return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+object.size}});
        const start = match[1] ? Number(match[1]) : Math.max(0,object.size-Number(match[2]));
        const end = match[2] && match[1] ? Math.min(object.size-1,Number(match[2])) : object.size-1;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start<0 || end<start || start>=object.size) {
          return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+object.size}});
        }
        const ranged = await env.CLASSROOM_RECORDINGS.get(row.object_key,{range:{offset:start,length:end-start+1}});
        headers.set('Content-Length',String(end-start+1));
        headers.set('Content-Range',`bytes ${start}-${end}/${object.size}`);
        return new Response(ranged.body,{status:206,headers});
      }
      return new Response(object.body,{status:200,headers});
    }
    return null;
  } catch (error) {
    console.error(JSON.stringify({where:'classroom-recording',error:error?.name||'Error'}));
    return json({ok:false,error:'INTERNAL_ERROR'},500);
  }
}

export async function purgeExpiredClassroomRecordings(env) {
  if (!env.DB || !env.CLASSROOM_RECORDINGS) return;
  const now = new Date().toISOString();
  const rows = await env.DB.prepare('SELECT * FROM classroom_recordings WHERE expires_at<=?1 LIMIT 100').bind(now).all();
  for (const row of rows.results || []) {
    try {
      if (row.multipart_upload_id) {
        await env.CLASSROOM_RECORDINGS.resumeMultipartUpload(row.object_key,row.multipart_upload_id).abort();
      } else {
        await env.CLASSROOM_RECORDINGS.delete(row.object_key);
      }
      await env.DB.prepare('DELETE FROM classroom_recordings WHERE id=?1').bind(row.id).run();
    } catch (error) {
      console.error(JSON.stringify({where:'classroom-recording-expiry',recordingId:row.id,error:error?.name||'Error'}));
    }
  }
}
