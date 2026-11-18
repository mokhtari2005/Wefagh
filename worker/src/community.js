// انجمن اعضای آکادمی؛ تمام مسیرها به نشست معتبر و عضویت تأییدشده نیاز دارند.
import { json, readJsonBody } from './http.js';
import { currentUser } from './auth/routes.js';

const MANAGERS = ['admin','super_admin','academy_manager'];
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const manager = (u) => u?.roles?.some((r) => MANAGERS.includes(r));
const idOf = (s) => /^\d{1,10}$/.test(s || '') ? Number(s) : 0;

async function membership(db, groupId, userId) {
  return db.prepare('SELECT role FROM community_group_members WHERE group_id=?1 AND user_id=?2').bind(groupId,userId).first();
}
async function visibleGroup(db, groupId, userId) {
  return db.prepare(`SELECT g.*, m.role AS member_role FROM community_groups g
    LEFT JOIN community_group_members m ON m.group_id=g.id AND m.user_id=?2
    WHERE g.id=?1 AND g.status='active' AND (g.visibility='public' OR m.user_id IS NOT NULL)`).bind(groupId,userId).first();
}
export async function handleCommunity(request, env, path) {
  if (!env.DB) return json({ok:false,error:'DB_NOT_CONFIGURED'},503);
  const user = await currentUser(request,env);
  if (!user) return json({ok:false,error:'UNAUTHENTICATED'},401);
  const method=request.method;
  const parts=path.split('/').filter(Boolean).slice(2); // community/...
  const section=parts[0] || '';
  try {
    if (section==='groups' && parts.length===1 && method==='GET') {
      const rows=await env.DB.prepare(`SELECT g.id,g.name,g.description,g.visibility,g.owner_id,g.created_at,
        (SELECT COUNT(*) FROM community_group_members m WHERE m.group_id=g.id) AS member_count,
        (SELECT COUNT(*) FROM community_topics t WHERE t.group_id=g.id AND t.status='active') AS topic_count,
        EXISTS(SELECT 1 FROM community_group_members m WHERE m.group_id=g.id AND m.user_id=?1) AS joined
        FROM community_groups g WHERE g.status='active' AND (g.visibility='public' OR EXISTS
        (SELECT 1 FROM community_group_members m WHERE m.group_id=g.id AND m.user_id=?1))
        ORDER BY g.created_at DESC LIMIT 100`).bind(user.id).all();
      return json({ok:true,groups:rows.results||[]});
    }
    if (section==='groups' && parts.length===1 && method==='POST') {
      const p=await readJsonBody(request); if(p.error)return p.error;
      const name=clean(p.body?.name,80), description=clean(p.body?.description,500), visibility=p.body?.visibility==='private'?'private':'public';
      if(name.length<3)return json({ok:false,error:'VALIDATION_FAILED',message:'نام گروه باید حداقل ۳ نویسه باشد.'},422);
      const result=await env.DB.prepare('INSERT INTO community_groups(name,description,visibility,owner_id) VALUES(?1,?2,?3,?4) RETURNING id')
        .bind(name,description,visibility,user.id).first();
      await env.DB.prepare("INSERT INTO community_group_members(group_id,user_id,role) VALUES(?1,?2,'owner')").bind(result.id,user.id).run();
      return json({ok:true,id:result.id},201);
    }
    if(section==='groups' && parts.length===3 && parts[2]==='join' && method==='POST') {
      const groupId=idOf(parts[1]); if(!groupId)return json({ok:false,error:'NOT_FOUND'},404);
      const g=await env.DB.prepare("SELECT id,visibility FROM community_groups WHERE id=?1 AND status='active'").bind(groupId).first();
      if(!g || g.visibility==='private')return json({ok:false,error:'NOT_FOUND'},404);
      await env.DB.prepare("INSERT OR IGNORE INTO community_group_members(group_id,user_id,role) VALUES(?1,?2,'member')").bind(groupId,user.id).run();
      return json({ok:true});
    }
    if(section==='topics' && parts.length===1 && method==='GET') {
      const groupId=idOf(new URL(request.url).searchParams.get('groupId')||'');
      if(groupId && !(await visibleGroup(env.DB,groupId,user.id)))return json({ok:false,error:'NOT_FOUND'},404);
      const rows=await env.DB.prepare(`SELECT t.id,t.group_id,t.title,t.body,t.created_at,t.updated_at,t.accepted_reply_id,
        u.display_name AS author_name,(SELECT COUNT(*) FROM community_replies r WHERE r.topic_id=t.id AND r.status='active') AS reply_count,
        g.name AS group_name FROM community_topics t JOIN users u ON u.id=t.author_id
        LEFT JOIN community_groups g ON g.id=t.group_id WHERE t.status='active'
        AND (?1=0 OR t.group_id=?1) AND (t.group_id IS NULL OR g.visibility='public' OR EXISTS
        (SELECT 1 FROM community_group_members m WHERE m.group_id=t.group_id AND m.user_id=?2))
        ORDER BY t.created_at DESC LIMIT 100`).bind(groupId,user.id).all();
      return json({ok:true,topics:rows.results||[]});
    }
    if(section==='topics' && parts.length===1 && method==='POST') {
      const p=await readJsonBody(request);if(p.error)return p.error;
      const title=clean(p.body?.title,160),body=String(p.body?.body??'').trim(),groupId=p.body?.groupId?idOf(String(p.body.groupId)):0;
      if(title.length<8||body.length<20||body.length>10000)return json({ok:false,error:'VALIDATION_FAILED',message:'عنوان باید ۸ تا ۱۶۰ و متن پرسش ۲۰ تا ۱۰۰۰۰ نویسه باشد.'},422);
      if(groupId){const g=await visibleGroup(env.DB,groupId,user.id);if(!g||!(await membership(env.DB,groupId,user.id)))return json({ok:false,error:'FORBIDDEN'},403);}
      const r=await env.DB.prepare('INSERT INTO community_topics(group_id,author_id,title,body) VALUES(?1,?2,?3,?4) RETURNING id').bind(groupId||null,user.id,title,body).first();
      return json({ok:true,id:r.id},201);
    }
    if(section==='topics' && parts.length===2 && method==='GET') {
      const topicId=idOf(parts[1]);if(!topicId)return json({ok:false,error:'NOT_FOUND'},404);
      const topic=await env.DB.prepare(`SELECT t.*,u.display_name AS author_name,g.name AS group_name FROM community_topics t
        JOIN users u ON u.id=t.author_id LEFT JOIN community_groups g ON g.id=t.group_id
        WHERE t.id=?1 AND t.status='active' AND (t.group_id IS NULL OR g.visibility='public' OR EXISTS
        (SELECT 1 FROM community_group_members m WHERE m.group_id=t.group_id AND m.user_id=?2))`).bind(topicId,user.id).first();
      if(!topic)return json({ok:false,error:'NOT_FOUND'},404);
      const replies=await env.DB.prepare(`SELECT r.id,r.body,r.created_at,r.author_id,u.display_name AS author_name
        FROM community_replies r JOIN users u ON u.id=r.author_id WHERE r.topic_id=?1 AND r.status='active' ORDER BY r.created_at LIMIT 200`).bind(topicId).all();
      return json({ok:true,topic,replies:replies.results||[]});
    }
    if(section==='topics' && parts.length===3 && parts[2]==='replies' && method==='POST') {
      const topicId=idOf(parts[1]);const p=await readJsonBody(request);if(p.error)return p.error;
      const body=String(p.body?.body??'').trim();
      if(body.length<2||body.length>6000)return json({ok:false,error:'VALIDATION_FAILED',message:'پاسخ باید بین ۲ تا ۶۰۰۰ نویسه باشد.'},422);
      const topic=await env.DB.prepare("SELECT id,group_id FROM community_topics WHERE id=?1 AND status='active'").bind(topicId).first();
      if(!topic)return json({ok:false,error:'NOT_FOUND'},404);
      if(topic.group_id){
        const group=await visibleGroup(env.DB,topic.group_id,user.id);
        if(!group || !(await membership(env.DB,topic.group_id,user.id)))return json({ok:false,error:'NOT_FOUND'},404);
      }
      const r=await env.DB.prepare('INSERT INTO community_replies(topic_id,author_id,body) VALUES(?1,?2,?3) RETURNING id').bind(topicId,user.id,body).first();
      return json({ok:true,id:r.id},201);
    }
    if(section==='topics' && parts.length===3 && parts[2]==='accept' && method==='POST') {
      const topicId=idOf(parts[1]);const p=await readJsonBody(request);if(p.error)return p.error;
      const replyId=idOf(String(p.body?.replyId||''));
      const topic=await env.DB.prepare('SELECT author_id FROM community_topics WHERE id=?1 AND status=\'active\'').bind(topicId).first();
      const reply=await env.DB.prepare("SELECT id FROM community_replies WHERE id=?1 AND topic_id=?2 AND status='active'").bind(replyId,topicId).first();
      if(!topic||topic.author_id!==user.id||!reply)return json({ok:false,error:'FORBIDDEN'},403);
      await env.DB.prepare('UPDATE community_topics SET accepted_reply_id=?1,updated_at=strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id=?2').bind(replyId,topicId).run();
      return json({ok:true});
    }
    if(section==='reports' && parts.length===1 && method==='POST') {
      const p=await readJsonBody(request);if(p.error)return p.error;
      const type=['topic','reply','group'].includes(p.body?.targetType)?p.body.targetType:'';
      const targetId=idOf(String(p.body?.targetId||'')),reason=clean(p.body?.reason,1000);
      if(!type||!targetId||reason.length<5)return json({ok:false,error:'VALIDATION_FAILED'},422);
      await env.DB.prepare('INSERT INTO community_reports(reporter_id,target_type,target_id,reason) VALUES(?1,?2,?3,?4)').bind(user.id,type,targetId,reason).run();
      return json({ok:true},201);
    }
    if(section==='moderation' && manager(user) && method==='GET') {
      const reports=await env.DB.prepare("SELECT id,target_type,target_id,reason,created_at FROM community_reports WHERE status='open' ORDER BY created_at LIMIT 100").all();
      return json({ok:true,reports:reports.results||[]});
    }
    if(section==='moderation' && parts.length===2 && method==='POST' && manager(user)) {
      const reportId=idOf(parts[1]);const p=await readJsonBody(request);if(p.error)return p.error;
      const status=['reviewed','dismissed'].includes(p.body?.status)?p.body.status:'reviewed';
      const report=await env.DB.prepare("SELECT * FROM community_reports WHERE id=?1 AND status='open'").bind(reportId).first();
      if(!report)return json({ok:false,error:'NOT_FOUND'},404);
      if(p.body?.hide===true){
        const table=report.target_type==='topic'?'community_topics':report.target_type==='reply'?'community_replies':'community_groups';
        await env.DB.prepare('UPDATE '+table+" SET status='hidden' WHERE id=?1").bind(report.target_id).run();
      }
      await env.DB.prepare('UPDATE community_reports SET status=?1 WHERE id=?2').bind(status,reportId).run();
      return json({ok:true});
    }
    return json({ok:false,error:'NOT_FOUND'},404);
  } catch(error) {
    console.error(JSON.stringify({where:'community',error:error?.name||'Error'}));
    return json({ok:false,error:'INTERNAL_ERROR'},500);
  }
}
