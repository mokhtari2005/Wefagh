import {sendWebPush} from './webpush.js';
export async function sendDuePushReminders(env,now=new Date()){
 if(!env?.DB||!env.VAPID_PRIVATE_JWK||!env.VAPID_PUBLIC_KEY)return {sent:0};
 const ps=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tehran',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now),clock=ps.find(p=>p.type==='hour').value+':'+ps.find(p=>p.type==='minute').value;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const q=await env.DB.prepare(`SELECT d.id,d.user_id,d.title,d.case_no,d.due_date,d.due_time,s.endpoint,s.p256dh,s.auth FROM deadlines d JOIN push_subscriptions s ON s.user_id=d.user_id WHERE d.done=0 AND d.reminder_enabled=1 AND d.due_date=date(?1,'+'||d.reminder_days||' day') AND d.reminder_time<=?2 AND NOT EXISTS(SELECT 1 FROM push_reminders_sent x WHERE x.deadline_id=d.id) ORDER BY d.id LIMIT 100`).bind(today,clock).all();
 let sent=0;
 for(const row of q.results||[]){try{const out=await sendWebPush(env,row,{title:'یادآوری موعد در آکادمی وکالت',body:row.title+(row.case_no?' · پرونده '+row.case_no:'')+' · '+row.due_date+(row.due_time?' ساعت '+row.due_time:''),url:'/#/deadlines'});if(out.stale)await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=?1').bind(row.endpoint).run();else if(out.ok){await env.DB.prepare('INSERT OR IGNORE INTO push_reminders_sent(deadline_id,sent_at) VALUES(?1,?2)').bind(row.id,now.toISOString()).run();sent++;}}catch(e){console.error(JSON.stringify({where:'push.send',error:e?.name||'Error'}));}}
 return {sent};
}