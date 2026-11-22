// بانک مستندات قانونی؛ ورود و تأیید فقط برای مدیر، جست‌وجو فقط در منابع تأییدشده.
import { json } from './http.js';
import { currentUser } from './auth/routes.js';
import { requireAdmin } from './admin.js';

const clean = (v, max = 500) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const STATUSES = new Set(['needs_review', 'verified', 'amended', 'repealed']);
const TYPES = new Set([
  'law', 'regulation', 'bylaw', 'circular', 'unified_precedent', 'advisory_opinion', 'other',
  'supreme_court_unified_precedent', 'supreme_court_insistence_precedent',
  'administrative_court_unified_precedent', 'administrative_court_general_board',
  'administrative_court_specialized_board', 'judicial_advisory_opinion',
  'judicial_circular', 'executive_circular', 'executive_regulation',
  'treaty', 'guardian_council_opinion', 'parliamentary_research', 'judicial_decision'
]);

const JUDICIAL_TYPES = new Set([
  'unified_precedent', 'supreme_court_unified_precedent', 'supreme_court_insistence_precedent',
  'administrative_court_unified_precedent', 'administrative_court_general_board',
  'administrative_court_specialized_board', 'advisory_opinion', 'judicial_advisory_opinion',
  'judicial_circular',
]);

async function readLargeJson(request, maxBytes = 4 * 1024 * 1024) {
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
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !title || !TYPES.has(type) || !Array.isArray(b.articles) || !b.articles.length || b.articles.length > 2500) {
        return json({ok:false,error:'VALIDATION_FAILED',message:'شناسه، عنوان، نوع سند یا فهرست مواد معتبر نیست؛ سقف هر سند ۲۵۰۰ ماده است.'},422);
      }
      const documentNumber = clean(b.documentNumber,120);
      const documentDate = clean(b.documentDate,40);
      const subject = clean(b.subject,500);
      const sourceUrlInput = clean(b.sourceUrl,1200);
      const officialSourceUrl = clean(b.officialSourceUrl,1200) || sourceUrlInput;
      const sourceUrl = sourceUrlInput || officialSourceUrl;
      const discoverySourceUrl = clean(b.discoverySourceUrl,1200);
      const contentSha256 = clean(b.contentSha256,64).toLowerCase();
      const issuingAuthority = clean(b.issuingAuthority,240);
      if ((sourceUrl && !sourceUrl.toLowerCase().startsWith('https://')) ||
          (officialSourceUrl && !officialSourceUrl.toLowerCase().startsWith('https://')) ||
          (discoverySourceUrl && !discoverySourceUrl.toLowerCase().startsWith('https://')) ||
          (contentSha256 && !/^[a-f0-9]{64}$/.test(contentSha256))) {
        return json({ok:false,error:'INVALID_SOURCE_METADATA',message:'نشانی منبع باید HTTPS و هش محتوا باید SHA-256 معتبر باشد.'},422);
      }
      if (JUDICIAL_TYPES.has(type) && (!documentNumber || !documentDate || !issuingAuthority || !subject || !officialSourceUrl)) {
        return json({ok:false,error:'JUDICIAL_METADATA_REQUIRED',message:'برای سند قضایی، شماره، تاریخ، مرجع صادرکننده، موضوع و پیوند رسمی الزامی است.'},422);
      }
      const articleNumbers = new Set();
      for (const article of b.articles) {
        const number = clean(article?.number,40);
        const body = article?.body;
        if (!number || typeof body !== 'string' || !body.trim() || body.length > 100000 || (article.heading != null && typeof article.heading !== 'string')) {
          return json({ok:false,error:'VALIDATION_FAILED',message:'هر ماده باید شماره و متن معتبر داشته باشد؛ سقف متن هر ماده ۱۰۰ هزار نویسه است.'},422);
        }
        if (articleNumbers.has(number)) {
          return json({ok:false,error:'DUPLICATE_ARTICLE_NUMBER',message:`شماره ماده تکراری است: ${number}`},422);
        }
        articleNumbers.add(number);
      }
      try {
        const result = await env.DB.prepare(`INSERT INTO legal_laws
          (slug,title,law_type,issuing_authority,approved_date,publication_date,effective_date,status,source_name,source_url,notes,created_by,document_number,document_date,subject,official_source_url,discovery_source_url,content_sha256)
          VALUES (?1,?2,?3,?4,?5,?6,?7,'needs_review',?8,?9,?10,?11,?12,?13,?14,?15,?16,?17) RETURNING id`)
          .bind(slug,title,type,issuingAuthority||null,clean(b.approvedDate,30)||null,clean(b.publicationDate,30)||null,clean(b.effectiveDate,30)||null,clean(b.sourceName,200)||null,sourceUrl||null,clean(b.notes,2000)||null,access.user.id,documentNumber||null,documentDate||null,subject||null,officialSourceUrl||null,discoverySourceUrl||null,contentSha256||null).first();
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
    await env.DB.prepare("UPDATE legal_laws SET status=?1, source_checked_at=CASE WHEN ?1='needs_review' THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now') END, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2").bind(status,id).run();
    return json({ok:true,lawId:id,status,articlesUnchanged:true});
  }

  if (path === '/api/admin/legal-bank/metadata') {
    const access = await requireAdmin(request, env);
    if (access.response) return access.response;
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const sourceKey = clean(url.searchParams.get('sourceKey'), 80);
      const type = clean(url.searchParams.get('documentType'), 60);
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
      const conditions = ["review_status='needs_review'"];
      const bindings = [];
      if (sourceKey) { bindings.push(sourceKey); conditions.push(`source_key=?${bindings.length}`); }
      if (type) { bindings.push(type); conditions.push(`document_type=?${bindings.length}`); }
      const result = await env.DB.prepare(`SELECT id,source_key AS sourceKey,source_id AS sourceId,title,document_type AS documentType,document_number AS documentNumber,document_date AS documentDate,issuing_authority AS issuingAuthority,subject,source_url AS sourceUrl,discovery_source_url AS discoverySourceUrl,content_sha256 AS contentSha256,review_status AS reviewStatus,created_at AS createdAt FROM legal_document_index WHERE ${conditions.join(' AND ')} ORDER BY id DESC LIMIT ${limit}`).bind(...bindings).all();
      return json({ok:true,items:result.results||[],count:(result.results||[]).length});
    }
    if (request.method !== 'POST') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET, POST'});
    const parsed = await readLargeJson(request, 16*1024);
    if (parsed.error) return parsed.error;
    const b = parsed.body || {};
    const sourceKey = clean(b.sourceKey,80);
    const sourceId = clean(b.sourceId,120);
    const title = clean(b.title,500);
    const documentType = clean(b.documentType,60);
    const sourceUrl = clean(b.sourceUrl,1200);
    const discoverySourceUrl = clean(b.discoverySourceUrl,1200);
    const documentNumber = clean(b.documentNumber,120);
    const documentDate = clean(b.documentDate,40);
    const issuingAuthority = clean(b.issuingAuthority,240);
    const subject = clean(b.subject,500);
    const contentSha256 = clean(b.contentSha256,64).toLowerCase();
    const metadata = b.metadata == null ? null : JSON.stringify(b.metadata);
    if (!sourceKey || !sourceId || !title || !TYPES.has(documentType) || !sourceUrl ||
        (contentSha256 && !/^[a-f0-9]{64}$/.test(contentSha256)) ||
        (metadata && metadata.length > 8000) ||
        (discoverySourceUrl && !discoverySourceUrl.toLowerCase().startsWith('https://'))) {
      return json({ok:false,error:'VALIDATION_FAILED',message:'فراداده، نوع سند، نشانی منبع یا هش معتبر نیست.'},422);
    }
    let source;
    try {
      source = await env.DB.prepare('SELECT base_url,enabled FROM legal_document_sources WHERE source_key=?1').bind(sourceKey).first();
    } catch {
      return json({ok:false,error:'SOURCE_REGISTRY_UNAVAILABLE'},503);
    }
    if (!source || !source.enabled) return json({ok:false,error:'SOURCE_NOT_ENABLED'},422);
    try {
      const target = new URL(sourceUrl);
      const base = new URL(source.base_url);
      if (target.protocol !== 'https:' || target.origin !== base.origin) return json({ok:false,error:'SOURCE_URL_MISMATCH'},422);
    } catch {
      return json({ok:false,error:'INVALID_SOURCE_URL'},422);
    }
    if (discoverySourceUrl) {
      try { if (new URL(discoverySourceUrl).protocol !== 'https:') return json({ok:false,error:'INVALID_DISCOVERY_URL'},422); }
      catch { return json({ok:false,error:'INVALID_DISCOVERY_URL'},422); }
    }
    try {
      const result = await env.DB.prepare(`INSERT INTO legal_document_index
        (source_key,source_id,title,document_type,document_number,document_date,issuing_authority,subject,source_url,discovery_source_url,content_sha256,metadata_json)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`)
        .bind(sourceKey,sourceId,title,documentType,documentNumber||null,documentDate||null,issuingAuthority||null,subject||null,sourceUrl,discoverySourceUrl||null,contentSha256||null,metadata).run();
      return json({ok:true,id:result.meta?.last_row_id||null,sourceKey,sourceId,reviewStatus:'needs_review'},201);
    } catch (error) {
      if (String(error?.message||'').includes('UNIQUE')) return json({ok:false,error:'DUPLICATE_SOURCE_RECORD'},409);
      console.error(JSON.stringify({where:'legal-bank.metadata',error:error?.name||'Error'}));
      return json({ok:false,error:'METADATA_IMPORT_FAILED'},500);
    }
  }

  if (path === '/api/admin/legal-bank/articles') {
    const access = await requireAdmin(request, env);
    if (access.response) return access.response;
    if (request.method !== 'GET') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET'});
    const url = new URL(request.url);
    const lawId = Number(url.searchParams.get('lawId'));
    if (!Number.isInteger(lawId) || lawId < 1) return json({ok:false,error:'VALIDATION_FAILED'},422);
    const articleIdParam = url.searchParams.get('articleId');
    if (articleIdParam !== null) {
      const articleId = Number(articleIdParam);
      if (!Number.isInteger(articleId) || articleId < 1) return json({ok:false,error:'VALIDATION_FAILED'},422);
      const item = await env.DB.prepare(`SELECT id,law_id AS lawId,article_number AS number,heading,body,status,status_note AS statusNote,status_source_name AS statusSourceName,status_source_url AS statusSourceUrl,status_effective_date AS statusEffectiveDate FROM legal_articles WHERE law_id=?1 AND id=?2`).bind(lawId,articleId).first();
      if (!item) return json({ok:false,error:'NOT_FOUND'},404);
      return json({ok:true,item});
    }
    const result = await env.DB.prepare(`SELECT id,article_number AS number,heading,substr(body,1,420) AS bodyPreview,status,status_note AS statusNote,status_source_name AS statusSourceName,status_source_url AS statusSourceUrl,status_effective_date AS statusEffectiveDate FROM legal_articles WHERE law_id=?1 ORDER BY id`).bind(lawId).all();
    const relations = await env.DB.prepare(`SELECT r.affected_article_id AS affectedArticleId,r.authority_article_id AS authorityArticleId,r.relation_type AS relationType,r.effective_date AS effectiveDate,r.source_note AS sourceNote,aa.article_number AS affectedArticleNumber,ba.article_number AS authorityArticleNumber FROM legal_article_relations r JOIN legal_articles aa ON aa.id=r.affected_article_id JOIN legal_articles ba ON ba.id=r.authority_article_id WHERE aa.law_id=?1 OR ba.law_id=?1 ORDER BY r.id`).bind(lawId).all();
    return json({ok:true,items:result.results||[],relations:relations.results||[]});
  }
  if (path === '/api/admin/legal-bank/article-status') {
    const access = await requireAdmin(request, env);
    if (access.response) return access.response;
    if (request.method !== 'PATCH') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'PATCH'});
    const parsed = await readLargeJson(request,32*1024);
    if (parsed.error) return parsed.error;
    const b=parsed.body||{}, id=Number(b.articleId), status=clean(b.status,30);
    if (!Number.isInteger(id)||id<1||!STATUSES.has(status)) return json({ok:false,error:'VALIDATION_FAILED'},422);
    const exists=await env.DB.prepare('SELECT id FROM legal_articles WHERE id=?1').bind(id).first();
    if(!exists) return json({ok:false,error:'NOT_FOUND'},404);
    const statusNote=clean(b.statusNote,2000), statusSourceName=clean(b.statusSourceName,200), statusSourceUrl=clean(b.statusSourceUrl,1000);
    if (['amended','repealed'].includes(status) && (!statusNote || (!statusSourceName && !statusSourceUrl))) return json({ok:false,error:'STATUS_EVIDENCE_REQUIRED',message:'برای اصلاح یا نسخ، توضیح و مشخصات منبع الزامی است.'},422);
    if (statusSourceUrl && !/^https:\/\//i.test(statusSourceUrl)) return json({ok:false,error:'INVALID_SOURCE_URL'},422);
    await env.DB.prepare(`UPDATE legal_articles SET status=?1,status_note=?2,status_source_name=?3,status_source_url=?4,status_effective_date=?5,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?6`)
      .bind(status,statusNote||null,statusSourceName||null,statusSourceUrl||null,clean(b.statusEffectiveDate,30)||null,id).run();
    return json({ok:true,articleId:id,status});
  }
  if (path === '/api/admin/legal-bank/relations') {
    const access = await requireAdmin(request, env);
    if (access.response) return access.response;
    if (request.method !== 'POST') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'POST'});
    const parsed=await readLargeJson(request,16*1024);
    if(parsed.error) return parsed.error;
    const b=parsed.body||{}, affected=Number(b.affectedArticleId), authority=Number(b.authorityArticleId);
    const relationType=clean(b.relationType,30);
    if(!Number.isInteger(affected)||affected<1||!Number.isInteger(authority)||authority<1||affected===authority||!['amends','repeals','replaces','interprets'].includes(relationType)||!clean(b.sourceNote,2000)) return json({ok:false,error:'VALIDATION_FAILED'},422);
    const rows=await env.DB.prepare('SELECT id FROM legal_articles WHERE id IN (?1,?2)').bind(affected,authority).all();
    if((rows.results||[]).length!==2) return json({ok:false,error:'ARTICLE_NOT_FOUND'},404);
    try {
      await env.DB.prepare(`INSERT INTO legal_article_relations (affected_article_id,authority_article_id,relation_type,effective_date,source_note,created_by) VALUES (?1,?2,?3,?4,?5,?6)`)
        .bind(affected,authority,relationType,clean(b.effectiveDate,30)||null,clean(b.sourceNote,2000)||null,access.user.id).run();
      return json({ok:true});
    } catch(error) {
      if(String(error?.message||'').includes('UNIQUE')) return json({ok:false,error:'DUPLICATE_RELATION'},409);
      throw error;
    }
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
  const legalTypes = ['law','regulation','bylaw','circular','executive_circular','executive_regulation','treaty'];
  const typePlaceholders = legalTypes.map((_,i)=>`?${terms.length+i+1}`).join(',');
  const bindings = [...terms.map(t=>`%${t}%`), ...legalTypes];
  const result = await db.prepare(`SELECT l.title AS lawTitle,l.source_name AS sourceName,l.source_url AS sourceUrl,a.article_number AS articleNumber,a.heading,a.body
    FROM legal_articles a JOIN legal_laws l ON l.id=a.law_id
    WHERE l.status='verified' AND a.status='verified' AND l.law_type IN (${typePlaceholders}) AND (${where}) LIMIT 6`).bind(...bindings).all();
  return result.results || [];
}


export function extractExplicitLegalReferences(query) {
  const text = String(query || '');
  const refs = [];
  const re = /(?:ماده|مواد)\s*([۰-۹0-9]+(?:\s*(?:،|,|و|تا|الی|[-–])\s*[۰-۹0-9]+)*)\s*(?:از\s*)?(قانون\s+[^،؛\n.]{3,100})/gu;
  for (const match of text.matchAll(re)) {
    const numbers = (match[1].match(/[۰-۹0-9]+/g) || []).map((n) =>
      n.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
    const lawTitle = match[2].split(/\s+(?:باید|است|می|مورد|برای|که|را|در|با|به|درباره|راجع|خریدار|فروشنده|خواهان|خوانده|موکل|پرونده|موضوع)(?:\s|$)/u)[0].trim().replace(/\s+/g, ' ');
    for (const articleNumber of numbers) refs.push({ lawTitle, articleNumber });
  }
  const seen = new Set();
  return refs.filter((ref) => {
    const key = ref.lawTitle + '::' + ref.articleNumber;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

const SEARCH_STOP_WORDS = new Set([
  'از','به','در','با','برای','و','یا','که','را','این','آن','یک','های','ها','می','شود','است','هست',
  'آیا','اگر','اما','باید','باشد','شده','کرده','کرد','نسبت','مورد','موارد','مطابق','طبق','قانون',
  'ماده','مواد','قانونی','حقوقی','حقوق','دعوا','پرونده','خواسته','پاسخ','بررسی','تحلیل','مطرح',
  'کن','کنید','همچنین','مربوط','مرتبط','شخص','طرف','طرفین','دادگاه','دادخواست','فروشنده','خریدار',
]);

function legalSearchTerms(query) {
  const normalized = String(query || '').normalize('NFKC')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .toLowerCase();
  const counts = new Map();
  for (const token of normalized.split(/[^\p{L}\p{N}]+/u)) {
    if (token.length < 3 || SEARCH_STOP_WORDS.has(token) || /^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a,b) => b[1]-a[1] || b[0].length-a[0].length)
    .slice(0, 12).map(([token]) => token);
}

const JUDICIAL_AUTHORITY_TYPES = Object.freeze([
  'unified_precedent',
  'supreme_court_unified_precedent',
  'administrative_court_unified_precedent',
  'administrative_court_general_board',
  'administrative_court_specialized_board',
  'supreme_court_insistence_precedent',
  'judicial_circular',
  'advisory_opinion',
  'judicial_advisory_opinion',
]);

/**
 * بازیابی مستقل آرای وحدت رویه و نظریات مشورتی از متن کامل اسناد تأییدشده بانک.
 * رکوردهای صرفاً نمایه‌ای و اسناد نیازمند بررسی عمداً وارد نتایج مستند نمی‌شوند.
 */
export async function findVerifiedJudicialAuthorities(db, query) {
  const text = String(query || '').normalize('NFKC')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const terms = legalSearchTerms(text);
  const numberMatches = [...text.matchAll(/(?:رأی\s*وحدت\s*رویه|نظریه\s*مشورتی)\s*(?:شماره\s*)?([0-9]+(?:\/[0-9]+)*)/gu)]
    .map((m) => m[1]).slice(0, 6);
  if (!terms.length && !numberMatches.length) return [];

  const conditions = [];
  const bindings = [];
  for (const number of numberMatches) {
    const persian = number.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
    bindings.push('%' + number + '%', '%' + persian + '%');
    const n = bindings.length;
    conditions.push(`l.document_number LIKE ?${n-1} OR l.document_number LIKE ?${n}`);
  }
  if (terms.length) {
    const termConditions = terms.map((_, i) =>
      `(l.title LIKE ?${bindings.length + i + 1} OR l.subject LIKE ?${bindings.length + i + 1} OR a.body LIKE ?${bindings.length + i + 1})`);
    conditions.push(termConditions.join(' OR '));
    bindings.push(...terms.map((term) => '%' + term + '%'));
  }
  const scoreStart = bindings.length;
  const score = terms.length
    ? terms.map((_, i) => `(CASE WHEN l.title LIKE ?${scoreStart + i + 1} OR l.subject LIKE ?${scoreStart + i + 1} OR a.body LIKE ?${scoreStart + i + 1} THEN 1 ELSE 0 END)`).join(' + ')
    : '0';
  if (terms.length) bindings.push(...terms.map((term) => '%' + term + '%'));
  const typePlaceholders = JUDICIAL_AUTHORITY_TYPES.map((_, i) => `?${bindings.length + i + 1}`).join(',');
  bindings.push(...JUDICIAL_AUTHORITY_TYPES);

  const result = await db.prepare(`SELECT l.id AS lawId,l.title AS lawTitle,l.law_type AS lawType,CASE l.law_type
      WHEN 'supreme_court_unified_precedent' THEN 'رأی وحدت رویه هیأت عمومی دیوان عالی کشور'
      WHEN 'supreme_court_insistence_precedent' THEN 'رأی اصراری هیأت عمومی دیوان عالی کشور'
      WHEN 'administrative_court_unified_precedent' THEN 'رأی وحدت رویه هیأت عمومی دیوان عدالت اداری'
      WHEN 'administrative_court_general_board' THEN 'رأی هیأت عمومی دیوان عدالت اداری'
      WHEN 'administrative_court_specialized_board' THEN 'رأی هیأت تخصصی دیوان عدالت اداری'
      WHEN 'judicial_advisory_opinion' THEN 'نظریه مشورتی اداره کل حقوقی قوه قضاییه'
      WHEN 'advisory_opinion' THEN 'نظریه مشورتی'
      WHEN 'judicial_circular' THEN 'بخشنامه قضایی'
      WHEN 'unified_precedent' THEN 'رأی وحدت رویه؛ مرجع باید از متن سند احراز شود'
      ELSE 'سند قضایی'
    END AS lawTypeLabel,l.status AS lawStatus,l.document_number AS documentNumber,l.document_date AS documentDate,l.approved_date AS approvedDate,l.publication_date AS publicationDate,l.effective_date AS effectiveDate,l.issuing_authority AS issuingAuthority,l.subject,l.official_source_url AS officialSourceUrl,l.source_checked_at AS sourceCheckedAt,l.source_name AS sourceName,l.source_url AS sourceUrl,a.id AS articleId,a.article_number AS articleNumber,a.status AS articleStatus,a.status_note AS articleStatusNote,a.status_source_name AS articleStatusSourceName,a.status_source_url AS articleStatusSourceUrl,a.status_effective_date AS articleStatusEffectiveDate,a.heading,a.body
    FROM legal_articles a JOIN legal_laws l ON l.id=a.law_id
    WHERE l.status='verified' AND a.status='verified'
      AND l.law_type IN (${typePlaceholders})
      AND (${conditions.map((condition) => `(${condition})`).join(' OR ')})
    ORDER BY (${score}) DESC,l.document_date DESC,l.title,a.id LIMIT 8`).bind(...bindings).all();
  return result.results || [];
}

