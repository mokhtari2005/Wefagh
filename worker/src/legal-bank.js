// بانک مستندات قانونی؛ ورود و تأیید فقط برای مدیر، جست‌وجو فقط در منابع تأییدشده.
import { json } from './http.js';
import { currentUser } from './auth/routes.js';
import { requireAdmin } from './admin.js';

const clean = (v, max = 500) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const STATUSES = new Set(['needs_review', 'verified', 'amended', 'repealed']);
const TYPES = new Set(['law', 'regulation', 'bylaw', 'circular', 'unified_precedent', 'advisory_opinion', 'other']);

async function readLargeJson(request, maxBytes = 1024 * 1024) {
  if (!(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return { error: json({ ok:false, error:'UNSUPPORTED_MEDIA_TYPE' },415) };
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxBytes) return { error: json({ ok:false, error:'PAYLOAD_TOO_LARGE' },413) };
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > maxBytes) return { error: json({ ok:false, error:'PAYLOAD_TOO_LARGE' },413) };
  try { return { body: JSON.parse(raw) }; } catch { return { error: json({ ok:false, error:'INVALID_JSON' },400) }; }
}

export async function handleLegalBank(request, env, path) {
  if (!env.DB) return json({ ok:false, error:'DB_NOT_CONFIGURED' },503);
  if (path === '/api/admin/legal-bank/list') {
    const access = await requireAdmin(request, env);
    if (access.response) return access.response;
    if (request.method !== 'GET') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET'});
    const result = await env.DB.prepare(`SELECT l.id,l.slug,l.title,l.law_type AS lawType,l.status,l.source_name AS sourceName,l.source_url AS sourceUrl,l.approved_date AS approvedDate,l.publication_date AS publicationDate,l.effective_date AS effectiveDate,COUNT(a.id) AS articleCount,SUM(CASE WHEN a.status='verified' THEN 1 ELSE 0 END) AS verifiedArticles
      FROM legal_laws l LEFT JOIN legal_articles a ON a.law_id=l.id
      GROUP BY l.id ORDER BY l.updated_at DESC,l.id DESC LIMIT 200`).all();
    return json({ok:true,items:result.results||[]});
  }
  if (path === '/api/admin/legal-bank/import' || path === '/api/admin/legal-bank/status') {
    const access = await requireAdmin(request, env);
    if (access.response) return access.response;
    if (path.endsWith('/import')) {
      if (request.method !== 'POST') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'POST'});
      const parsed = await readLargeJson(request);
      if (parsed.error) return parsed.error;
      const b = parsed.body || {};
      const slug = clean(b.slug,100);
      const title = clean(b.title,240);
      const type = clean(b.lawType,40) || 'law';
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !title || !TYPES.has(type) || !Array.isArray(b.articles) || !b.articles.length || b.articles.length > 500) {
        return json({ok:false,error:'VALIDATION_FAILED',message:'شناسه، عنوان، نوع سند یا فهرست مواد معتبر نیست.'},422);
      }
      if (b.articles.some(a => !a || !clean(a.number,40) || !clean(a.body,30000) || typeof a.body !== 'string')) {
        return json({ok:false,error:'VALIDATION_FAILED',message:'هر ماده باید شماره و متن داشته باشد.'},422);
      }
      try {
        const result = await env.DB.prepare(`INSERT INTO legal_laws
          (slug,title,law_type,issuing_authority,approved_date,publication_date,effective_date,status,source_name,source_url,notes,created_by)
          VALUES (?1,?2,?3,?4,?5,?6,?7,'needs_review',?8,?9,?10,?11) RETURNING id`)
          .bind(slug,title,type,clean(b.issuingAuthority,200)||null,clean(b.approvedDate,30)||null,clean(b.publicationDate,30)||null,clean(b.effectiveDate,30)||null,clean(b.sourceName,200)||null,clean(b.sourceUrl,1000)||null,clean(b.notes,2000)||null,access.user.id).first();
        const lawId = result.id;
        const statements = b.articles.map(a => env.DB.prepare(`INSERT INTO legal_articles (law_id,article_number,heading,body,status)
          VALUES (?1,?2,?3,?4,'needs_review')`).bind(lawId,clean(a.number,40),clean(a.heading,300)||null,a.body.trim()));
        for (let i=0;i<statements.length;i+=50) await env.DB.batch(statements.slice(i,i+50));
        return json({ok:true,lawId,articles:statements.length,status:'needs_review'},201);
      } catch (error) {
        if (String(error?.message||'').includes('UNIQUE')) return json({ok:false,error:'DUPLICATE_LAW'},409);
        console.error(JSON.stringify({where:'legal-bank.import',error:error?.name||'Error'}));
        return json({ok:false,error:'IMPORT_FAILED'},500);
      }
    }
    if (request.method !== 'PATCH') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'PATCH'});
    const parsed = await readLargeJson(request,16*1024);
    if (parsed.error) return parsed.error;
    const id = Number(parsed.body?.lawId);
    const status = clean(parsed.body?.status,30);
    if (!Number.isInteger(id) || id < 1 || !STATUSES.has(status)) return json({ok:false,error:'VALIDATION_FAILED'},422);
    const exists = await env.DB.prepare('SELECT id FROM legal_laws WHERE id=?1').bind(id).first();
    if (!exists) return json({ok:false,error:'NOT_FOUND'},404);
    await env.DB.batch([
      env.DB.prepare("UPDATE legal_laws SET status=?1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2").bind(status,id),
      env.DB.prepare("UPDATE legal_articles SET status=?1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE law_id=?2").bind(status,id),
    ]);
    return json({ok:true,lawId:id,status});
  }

  if (path === '/api/legal-bank/search') {
    if (request.method !== 'GET') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET'});
    const user = await currentUser(request,env);
    if (!user) return json({ok:false,error:'UNAUTHENTICATED'},401);
    const url = new URL(request.url);
    const query = clean(url.searchParams.get('q'),300);
    if (query.length < 2) return json({ok:true,items:[]});
    const terms = [...new Set(query.split(/[\s،؛,.()]+/).map(x=>x.trim()).filter(x=>x.length>=2))].slice(0,6);
    if (!terms.length) return json({ok:true,items:[]});
    const where = terms.map((_,i)=>`(a.body LIKE ?${i+1} OR a.article_number LIKE ?${i+1} OR l.title LIKE ?${i+1})`).join(' OR ');
    const bindings = terms.map(t=>`%${t}%`);
    const result = await env.DB.prepare(`SELECT l.title AS lawTitle,l.law_type AS lawType,l.source_name AS sourceName,l.source_url AS sourceUrl,l.status AS lawStatus,a.article_number AS articleNumber,a.heading,a.body,a.status AS articleStatus
      FROM legal_articles a JOIN legal_laws l ON l.id=a.law_id
      WHERE l.status='verified' AND a.status='verified' AND (${where})
      ORDER BY l.title,a.id LIMIT 8`).bind(...bindings).all();
    return json({ok:true,items:(result.results||[]).map(r=>({...r,body:r.body.slice(0,3500)}))});
  }
  return null;
}

// برای تزریق به زمینهٔ مدل فقط مواد تأییدشده برگردانده می‌شوند.
export async function findVerifiedLegalArticles(db, query) {
  const terms = [...new Set(String(query||'').split(/[\s،؛,.()]+/).map(x=>x.trim()).filter(x=>x.length>=2))].slice(0,6);
  if (!terms.length) return [];
  const where = terms.map((_,i)=>`(a.body LIKE ?${i+1} OR a.article_number LIKE ?${i+1} OR l.title LIKE ?${i+1})`).join(' OR ');
  const bindings = terms.map(t=>`%${t}%`);
  const result = await db.prepare(`SELECT l.title AS lawTitle,l.source_name AS sourceName,l.source_url AS sourceUrl,a.article_number AS articleNumber,a.heading,a.body
    FROM legal_articles a JOIN legal_laws l ON l.id=a.law_id
    WHERE l.status='verified' AND a.status='verified' AND (${where}) LIMIT 6`).bind(...bindings).all();
  return result.results || [];
}
