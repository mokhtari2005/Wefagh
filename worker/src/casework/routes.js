// مدیریت پرونده‌های حرفه‌ای و بایگانی یکپارچه؛ مستقل از بانک پرونده‌های آموزشی و موت‌کورت.
import { json, readJsonBody } from '../http.js';
import { currentUser } from '../auth/routes.js';
import { b2GetObject, b2PutObject } from '../b2-s3.js';

const CASE_STATUSES = new Set(['draft','active','waiting_upload','waiting_analysis','ready_next','completed','archived']);
const SERVICE_STATUSES = new Set(['draft','in_progress','waiting_upload','waiting_analysis','ready_next','completed','archived']);
const DOCUMENT_TYPES = new Set(['attachment','draft','final','evidence','contract','correspondence','report','other']);
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ID_RE = /^[0-9a-f-]{36}$/i;
const clean = (v, max = 500) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
const now = () => new Date().toISOString();
const fail = (error, status = 400, extra = {}) => json({ ok: false, error, ...extra }, status);
const id = () => crypto.randomUUID();

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}
function safeParties(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((p) => ({
    name: clean(p?.name, 180),
    role: clean(p?.role, 80),
    identifier: clean(p?.identifier, 80),
  })).filter((p) => p.name);
}
async function readBody(request) {
  const parsed = await readJsonBody(request);
  if (parsed.error) return parsed;
  if (!parsed.body || typeof parsed.body !== 'object' || Array.isArray(parsed.body)) return { error: fail('INVALID_BODY') };
  return parsed;
}
async function ownCase(env, userId, caseId) {
  if (!ID_RE.test(caseId)) return null;
  return env.DB.prepare('SELECT * FROM case_records WHERE id=?1 AND user_id=?2 AND deleted_at IS NULL').bind(caseId, userId).first();
}
async function ownService(env, userId, serviceId) {
  if (!ID_RE.test(serviceId)) return null;
  return env.DB.prepare('SELECT * FROM case_services WHERE id=?1 AND user_id=?2').bind(serviceId, userId).first();
}
async function ownDocument(env, userId, documentId) {
  if (!ID_RE.test(documentId)) return null;
  return env.DB.prepare('SELECT * FROM case_documents WHERE id=?1 AND user_id=?2').bind(documentId, userId).first();
}
async function event(env, userId, caseId, eventType, title, { serviceId = null, documentId = null, details = {} } = {}) {
  await env.DB.prepare(`INSERT INTO case_timeline(case_id,user_id,service_id,document_id,event_type,title,details_json)
    VALUES(?1,?2,?3,?4,?5,?6,?7)`)
    .bind(caseId,userId,serviceId,documentId,eventType,title,JSON.stringify(details)).run();
  await env.DB.prepare('UPDATE case_records SET last_activity_at=?1,updated_at=?1 WHERE id=?2 AND user_id=?3')
    .bind(now(),caseId,userId).run();
}
function caseDto(row) {
  return {
    id: row.id, name: row.name, caseNumber: row.case_number, parties: parseJson(row.parties_json, []),
    subject: row.subject, description: row.description, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at, lastActivityAt: row.last_activity_at,
    archivedAt: row.archived_at, serviceCount: Number(row.service_count || 0),
    documentCount: Number(row.document_count || 0), uploadCount: Number(row.upload_count || 0),
    generatedCount: Number(row.generated_count || 0),
  };
}
function serviceDto(row) {
  return { id: row.id, caseId: row.case_id, type: row.service_type, title: row.title, status: row.status,
    details: parseJson(row.details_json, {}), createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at };
}
function documentDto(row) {
  return { id: row.id, caseId: row.case_id, serviceId: row.service_id, name: row.display_name,
    originalName: row.original_name, type: row.document_type, source: row.source_kind, mimeType: row.mime_type,
    sizeBytes: row.size_bytes, status: row.status, versionGroupId: row.version_group_id,
    version: row.version_number, parentDocumentId: row.parent_document_id, description: row.description,
    createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at,
    downloadUrl: row.status === 'deleted' ? null : '/api/casework/documents/' + row.id + '/content' };
}
function fileKind(name, declared) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const allowed = {
    pdf: ['application/pdf'], docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    doc: ['application/msword'], jpg: ['image/jpeg'], jpeg: ['image/jpeg'], png: ['image/png'],
    webp: ['image/webp'], txt: ['text/plain'], rtf: ['application/rtf','text/rtf'],
  };
  if (!Object.hasOwn(allowed, ext)) return null;
  const mime = declared && declared !== 'application/octet-stream' ? declared.toLowerCase() : allowed[ext][0];
  if (!allowed[ext].includes(mime)) return null;
  return { ext, mime };
}
function signatureOk(bytes, ext) {
  const starts = (...values) => values.every((v,i) => bytes[i] === v);
  if (ext === 'pdf') return bytes.length > 5 && new TextDecoder().decode(bytes.slice(0,5)) === '%PDF-';
  if (ext === 'png') return starts(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a);
  if (ext === 'jpg' || ext === 'jpeg') return starts(0xff,0xd8,0xff);
  if (ext === 'webp') return bytes.length > 12 && new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP';
  if (ext === 'docx') return starts(0x50,0x4b,0x03,0x04);
  if (ext === 'doc') return starts(0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1);
  return ext === 'txt' || ext === 'rtf';
}
async function listCases(env, userId, url) {
  const q = clean(url.searchParams.get('q'), 120);
  const status = url.searchParams.get('status') || '';
  const sort = url.searchParams.get('sort') || 'activity';
  if (status && !CASE_STATUSES.has(status)) return fail('INVALID_STATUS',422);
  const order = ({ activity:'last_activity_at DESC', newest:'created_at DESC', oldest:'created_at ASC', name:'name COLLATE NOCASE ASC', number:'case_number COLLATE NOCASE ASC', services:'service_count DESC' })[sort];
  if (!order) return fail('INVALID_SORT',422);
  const rows = await env.DB.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM case_services s WHERE s.case_id=c.id) AS service_count,
      (SELECT COUNT(*) FROM case_documents d WHERE d.case_id=c.id AND d.deleted_at IS NULL) AS document_count,
      (SELECT COUNT(*) FROM case_documents d WHERE d.case_id=c.id AND d.deleted_at IS NULL AND d.source_kind='upload') AS upload_count,
      (SELECT COUNT(*) FROM case_documents d WHERE d.case_id=c.id AND d.deleted_at IS NULL AND d.source_kind='generated') AS generated_count
    FROM case_records c WHERE c.user_id=?1 AND c.deleted_at IS NULL
      AND (?2='' OR c.status=?2)
      AND (?3='' OR c.name LIKE '%'||?3||'%' OR c.case_number LIKE '%'||?3||'%' OR c.subject LIKE '%'||?3||'%'
        OR EXISTS (SELECT 1 FROM json_each(c.parties_json) p WHERE json_extract(p.value,'$.name') LIKE '%'||?3||'%'))
    ORDER BY ${order} LIMIT 300`).bind(userId,status,q).all();
  return json({ ok:true, cases:(rows?.results||[]).map(caseDto), total:(rows?.results||[]).length });
}
async function createCase(env,userId,body) {
  const name=clean(body.name,180);
  if(name.length<2) return fail('CASE_NAME_REQUIRED',422);
  const status=CASE_STATUSES.has(body.status) ? body.status : 'draft';
  const caseId=id(), timestamp=now();
  await env.DB.prepare(`INSERT INTO case_records(id,user_id,name,case_number,parties_json,subject,description,status,created_at,updated_at,last_activity_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?9,?9)`)
    .bind(caseId,userId,name,clean(body.caseNumber,120),JSON.stringify(safeParties(body.parties)),
      clean(body.subject,500),clean(body.description,8000),status,timestamp).run();
  await event(env,userId,caseId,'case_created','پرونده ایجاد شد',{details:{name}});
  const row=await env.DB.prepare('SELECT * FROM case_records WHERE id=?1 AND user_id=?2').bind(caseId,userId).first();
  return json({ok:true,case:caseDto(row)},201);
}
async function getCase(env,userId,caseId) {
  const row=await ownCase(env,userId,caseId);
  if(!row) return fail('NOT_FOUND',404);
  const [services,documents,timeline]=await Promise.all([
    env.DB.prepare('SELECT * FROM case_services WHERE case_id=?1 AND user_id=?2 ORDER BY created_at DESC').bind(caseId,userId).all(),
    env.DB.prepare('SELECT * FROM case_documents WHERE case_id=?1 AND user_id=?2 AND deleted_at IS NULL ORDER BY created_at DESC').bind(caseId,userId).all(),
    env.DB.prepare('SELECT id,service_id,document_id,event_type,title,details_json,created_at FROM case_timeline WHERE case_id=?1 AND user_id=?2 ORDER BY id DESC LIMIT 250').bind(caseId,userId).all(),
  ]);
  return json({ok:true,case:caseDto(row),services:(services.results||[]).map(serviceDto),
    documents:(documents.results||[]).map(documentDto),
    timeline:(timeline.results||[]).map(x=>({...x,details:parseJson(x.details_json,{})}))});
}
async function updateCase(env,userId,caseId,body) {
  const row=await ownCase(env,userId,caseId); if(!row) return fail('NOT_FOUND',404);
  const values={
    name:body.name===undefined?row.name:clean(body.name,180),
    caseNumber:body.caseNumber===undefined?row.case_number:clean(body.caseNumber,120),
    parties:body.parties===undefined?parseJson(row.parties_json,[]):safeParties(body.parties),
    subject:body.subject===undefined?row.subject:clean(body.subject,500),
    description:body.description===undefined?row.description:clean(body.description,8000),
    status:body.status===undefined?row.status:body.status,
  };
  if(values.name.length<2||!CASE_STATUSES.has(values.status)) return fail('VALIDATION_FAILED',422);
  const timestamp=now(), archivedAt=values.status==='archived'?(row.archived_at||timestamp):null;
  await env.DB.prepare(`UPDATE case_records SET name=?1,case_number=?2,parties_json=?3,subject=?4,description=?5,status=?6,archived_at=?7,updated_at=?8,last_activity_at=?8 WHERE id=?9 AND user_id=?10`)
    .bind(values.name,values.caseNumber,JSON.stringify(values.parties),values.subject,values.description,values.status,archivedAt,timestamp,caseId,userId).run();
  await event(env,userId,caseId,'case_updated','اطلاعات پرونده به‌روزرسانی شد',{details:{status:values.status}});
  return json({ok:true});
}
async function createService(env,userId,caseId,body) {
  const parent=await ownCase(env,userId,caseId); if(!parent) return fail('NOT_FOUND',404);
  const title=clean(body.title,180), type=clean(body.type,60);
  if(title.length<2||type.length<2) return fail('VALIDATION_FAILED',422);
  const serviceId=id();
  const details=body.details&&typeof body.details==='object'&&!Array.isArray(body.details)?body.details:{};
  await env.DB.prepare(`INSERT INTO case_services(id,case_id,user_id,service_type,title,status,details_json)
    VALUES(?1,?2,?3,?4,?5,'in_progress',?6)`).bind(serviceId,caseId,userId,type,title,JSON.stringify(details).slice(0,10000)).run();
  await event(env,userId,caseId,'service_created','خدمت جدید اضافه شد',{serviceId,details:{title,type}});
  return json({ok:true,service:{id:serviceId,caseId,type,title,status:'in_progress'}},201);
}
async function updateService(env,userId,serviceId,body) {
  const row=await ownService(env,userId,serviceId); if(!row) return fail('NOT_FOUND',404);
  const title=body.title===undefined?row.title:clean(body.title,180);
  const status=body.status===undefined?row.status:body.status;
  const details=body.details===undefined?parseJson(row.details_json,{}):(body.details&&typeof body.details==='object'&&!Array.isArray(body.details)?body.details:{});
  if(title.length<2||!SERVICE_STATUSES.has(status)) return fail('VALIDATION_FAILED',422);
  const timestamp=now();
  await env.DB.prepare('UPDATE case_services SET title=?1,status=?2,details_json=?3,updated_at=?4,completed_at=?5 WHERE id=?6 AND user_id=?7')
    .bind(title,status,JSON.stringify(details).slice(0,10000),timestamp,status==='completed'?(row.completed_at||timestamp):null,serviceId,userId).run();
  await event(env,userId,row.case_id,'service_updated','وضعیت خدمت تغییر کرد',{serviceId,details:{title,status}});
  return json({ok:true});
}
async function uploadDocument(request,env,userId,caseId) {
  const parent=await ownCase(env,userId,caseId); if(!parent) return fail('NOT_FOUND',404);
  if(!env.B2_ENDPOINT||!env.B2_BUCKET||!env.B2_KEY_ID||!env.B2_APPLICATION_KEY) return fail('FILE_STORAGE_NOT_CONFIGURED',503);
  const name=clean(decodeURIComponent(request.headers.get('x-file-name')||'document'),180);
  const kind=fileKind(name,(request.headers.get('content-type')||'').split(';')[0].trim());
  if(!kind) return fail('UNSUPPORTED_FILE_TYPE',422);
  const length=Number(request.headers.get('content-length')||0);
  if(length>MAX_FILE_BYTES) return fail('FILE_TOO_LARGE',413);
  const bytes=new Uint8Array(await request.arrayBuffer());
  if(!bytes.length||bytes.length>MAX_FILE_BYTES||!signatureOk(bytes,kind.ext)) return fail('INVALID_FILE_CONTENT',422);
  const serviceId=request.headers.get('x-service-id')||null;
  if(serviceId){const service=await ownService(env,userId,serviceId);if(!service||service.case_id!==caseId)return fail('SERVICE_NOT_FOUND',404);}
  const documentType=request.headers.get('x-document-type')||'attachment';
  if(!DOCUMENT_TYPES.has(documentType))return fail('INVALID_DOCUMENT_TYPE',422);
  const versionOf=request.headers.get('x-version-of')||'';
  let versionGroup=id(),versionNumber=1,parentId=null;
  if(versionOf){
    const previous=await ownDocument(env,userId,versionOf);
    if(!previous||previous.case_id!==caseId)return fail('PARENT_DOCUMENT_NOT_FOUND',404);
    versionGroup=previous.version_group_id;versionNumber=Number(previous.version_number)+1;parentId=previous.id;
  }
  const documentId=id(),storageKey='case-files/'+userId+'/'+caseId+'/'+documentId;
  const sha=await crypto.subtle.digest('SHA-256',bytes);
  const shaHex=[...new Uint8Array(sha)].map(x=>x.toString(16).padStart(2,'0')).join('');
  const mime=kind.mime;
  try { await b2PutObject(env,storageKey,bytes,mime); }
  catch(error){ console.error(JSON.stringify({where:'casework.upload',error:error?.name||'Error'}));return fail('FILE_STORAGE_FAILED',502); }
  try {
    await env.DB.prepare(`INSERT INTO case_documents(id,case_id,service_id,user_id,display_name,original_name,document_type,source_kind,mime_type,size_bytes,storage_key,sha256,status,version_group_id,version_number,parent_document_id,description)
      VALUES(?1,?2,?3,?4,?5,?6,?7,'upload',?8,?9,?10,?11,'active',?12,?13,?14,?15)`)
      .bind(documentId,caseId,serviceId,userId,name,name,documentType,mime,bytes.length,storageKey,shaHex,versionGroup,versionNumber,parentId,clean(request.headers.get('x-description'),2000)).run();
  } catch(error){
    console.error(JSON.stringify({where:'casework.metadata',error:error?.name||'Error'}));
    return fail('DOCUMENT_REGISTER_FAILED',500);
  }
  await event(env,userId,caseId,'document_uploaded','سند بارگذاری شد',{serviceId,documentId,details:{name,sizeBytes:bytes.length,version:versionNumber}});
  const row=await ownDocument(env,userId,documentId);
  return json({ok:true,document:documentDto(row)},201);
}
async function updateDocument(env,userId,documentId,body) {
  const row=await ownDocument(env,userId,documentId); if(!row)return fail('NOT_FOUND',404);
  const name=body.name===undefined?row.display_name:clean(body.name,180);
  const status=body.status===undefined?row.status:body.status;
  const description=body.description===undefined?row.description:clean(body.description,2000);
  if(!name||!['draft','final','archived','active','deleted'].includes(status))return fail('VALIDATION_FAILED',422);
  const timestamp=now(),deletedAt=status==='deleted'?(row.deleted_at||timestamp):null;
  await env.DB.prepare('UPDATE case_documents SET display_name=?1,status=?2,description=?3,updated_at=?4,deleted_at=?5 WHERE id=?6 AND user_id=?7')
    .bind(name,status,description,timestamp,deletedAt,documentId,userId).run();
  await event(env,userId,row.case_id,'document_updated','اطلاعات سند تغییر کرد',{serviceId:row.service_id,documentId,details:{name,status}});
  return json({ok:true});
}
async function downloadDocument(request,env,userId,documentId) {
  const row=await ownDocument(env,userId,documentId);
  if(!row||row.deleted_at||row.status==='deleted')return fail('NOT_FOUND',404);
  const object=await b2GetObject(env,row.storage_key);
  const headers=new Headers({
    'Content-Type':row.mime_type,
    'Content-Length':String(row.size_bytes),
    'Content-Disposition':(request.method==='HEAD'?'inline':'attachment')+'; filename*=UTF-8\'\''+encodeURIComponent(row.display_name),
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
  });
  if(request.method==='HEAD')return new Response(null,{status:200,headers});
  return new Response(object.body,{status:200,headers});
}
export async function handleCasework(request,env,path) {
  if(!path.startsWith('/api/casework/'))return null;
  if(!env.DB)return fail('DB_NOT_CONFIGURED',503);
  const user=await currentUser(request,env);if(!user)return fail('UNAUTHENTICATED',401);
  const method=request.method;
  if(path==='/api/casework/cases'){
    if(method==='GET')return listCases(env,user.id,new URL(request.url));
    if(method==='POST'){const parsed=await readBody(request);if(parsed.error)return parsed.error;return createCase(env,user.id,parsed.body);}
    return fail('METHOD_NOT_ALLOWED',405);
  }
  const caseDetail=path.match(/^\/api\/casework\/cases\/([0-9a-f-]{36})$/i);
  if(caseDetail){
    if(method==='GET')return getCase(env,user.id,caseDetail[1]);
    if(method==='PATCH'){const parsed=await readBody(request);if(parsed.error)return parsed.error;return updateCase(env,user.id,caseDetail[1],parsed.body);}
    if(method==='DELETE'){const row=await ownCase(env,user.id,caseDetail[1]);if(!row)return fail('NOT_FOUND',404);await env.DB.prepare('UPDATE case_records SET deleted_at=?1,updated_at=?1 WHERE id=?2 AND user_id=?3').bind(now(),row.id,user.id).run();await event(env,user.id,row.id,'case_trashed','پرونده به سطل بازیابی منتقل شد');return json({ok:true});}
    return fail('METHOD_NOT_ALLOWED',405);
  }
  const services=path.match(/^\/api\/casework\/cases\/([0-9a-f-]{36})\/services$/i);
  if(services){
    if(method!=='POST')return fail('METHOD_NOT_ALLOWED',405);
    const parsed=await readBody(request);if(parsed.error)return parsed.error;return createService(env,user.id,services[1],parsed.body);
  }
  const service=path.match(/^\/api\/casework\/services\/([0-9a-f-]{36})$/i);
  if(service){
    if(method!=='PATCH')return fail('METHOD_NOT_ALLOWED',405);
    const parsed=await readBody(request);if(parsed.error)return parsed.error;return updateService(env,user.id,service[1],parsed.body);
  }
  const upload=path.match(/^\/api\/casework\/cases\/([0-9a-f-]{36})\/documents$/i);
  if(upload){
    if(method!=='POST')return fail('METHOD_NOT_ALLOWED',405);
    return uploadDocument(request,env,user.id,upload[1]);
  }
  const document=path.match(/^\/api\/casework\/documents\/([0-9a-f-]{36})(?:\/(content|versions))?$/i);
  if(document){
    const documentId=document[1],action=document[2]||'';
    if(action==='content'){
      if(method!=='GET'&&method!=='HEAD')return fail('METHOD_NOT_ALLOWED',405);
      return downloadDocument(request,env,user.id,documentId);
    }
    if(action==='versions'){
      if(method!=='GET')return fail('METHOD_NOT_ALLOWED',405);
      const row=await ownDocument(env,user.id,documentId);if(!row)return fail('NOT_FOUND',404);
      const rows=await env.DB.prepare('SELECT * FROM case_documents WHERE version_group_id=?1 AND user_id=?2 ORDER BY version_number DESC').bind(row.version_group_id,user.id).all();
      return json({ok:true,versions:(rows.results||[]).map(documentDto)});
    }
    if(method==='PATCH'){const parsed=await readBody(request);if(parsed.error)return parsed.error;return updateDocument(env,user.id,documentId,parsed.body);}
    return fail('METHOD_NOT_ALLOWED',405);
  }
  return fail('NOT_FOUND',404);
}
