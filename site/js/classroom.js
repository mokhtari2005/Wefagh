// رابط کاربری کلاس آنلاین؛ نشست‌ها و حضور و غیاب از API هم‌مبدأ مدیریت می‌شوند.
import { getJson, postJson, sendJson } from './api.js';

function node(tag, attrs = {}, children = []) {
  const item = document.createElement(tag);
  for (const [key,value] of Object.entries(attrs)) {
    if (key === 'text') item.textContent = value;
    else if (key === 'class') item.className = value;
    else item.setAttribute(key,value);
  }
  for (const child of children) item.append(child);
  return item;
}
function dateLabel(value) {
  return new Intl.DateTimeFormat('fa-IR',{dateStyle:'full',timeStyle:'short'}).format(new Date(value));
}
function durationLabel(seconds) {
  const mins=Math.floor((Number(seconds)||0)/60);
  return mins ? mins+' دقیقه' : 'کمتر از یک دقیقه';
}
function meetingUrl(roomName) {
  const config='config.prejoinConfig.enabled=true&config.fileRecordingsEnabled=false&config.liveStreamingEnabled=false&config.transcription.enabled=false&config.disableDeepLinking=true';
  return 'https://meet.jit.si/'+encodeURIComponent(roomName)+'#'+config;
}
function mountMeeting(root, sessionId, data, {guestToken=null, guest=false}={}) {
  root.replaceChildren();
  const expandButton=node('button',{class:'btn secondary classroom-expand-button',type:'button',text:'تمام‌صفحه'});
  const leaveButton=node('button',{class:'btn secondary',type:'button',text:'خروج از کلاس'});
  const actions=node('div',{class:'classroom-meeting-actions'},[expandButton,leaveButton]);
  const header=node('div',{class:'classroom-meeting-heading'},[
    node('div',{},[node('span',{class:'section-kicker',text:'کلاس زنده'}),node('h2',{text:'اتاق کلاس'})]),
    actions,
  ]);
  const notice=node('p',{class:'form-status',role:'status',text:'برای استفاده از تصویر، صدا و اشتراک‌گذاری صفحه، مجوزهای مرورگر را فعال کنید.'});
  root.append(header,notice);
  const leave=leaveButton;
  let heartbeat=null,closed=false,fallbackExpanded=false;
  let leaveFullscreen=async()=>{},syncFullscreen=()=>{};
  const endpoint=guest?'/api/classroom/guest/'+sessionId:'/api/classroom/sessions/'+sessionId;
  const pulse=()=>postJson(endpoint+'/heartbeat',guest?{guestToken}:{}).catch(()=>{});
  const stop=async()=>{
    if(closed)return;closed=true;
    if(heartbeat)clearInterval(heartbeat);
    await leaveFullscreen();
    document.removeEventListener('fullscreenchange',syncFullscreen);
    document.removeEventListener('webkitfullscreenchange',syncFullscreen);
    await postJson(endpoint+'/leave',guest?{guestToken}:{}).catch(()=>{});
    root.replaceChildren(node('p',{class:'form-status',text:'از کلاس خارج شدید. برای ورود دوباره به فهرست کلاس‌ها برگردید.'}));
  };
  leave.addEventListener('click',stop);
  window.addEventListener('pagehide',()=>{if(!closed){closed=true;if(heartbeat)clearInterval(heartbeat);void postJson(endpoint+'/leave',guest?{guestToken}:{});}}, {once:true});
  if(data.provider==='jitsi' && data.roomName){
    const frameWrap=node('div',{class:'classroom-frame-wrap'});
    const frame=node('iframe',{class:'classroom-frame',title:'اتاق تصویری کلاس',src:meetingUrl(data.roomName),allow:'camera; microphone; display-capture; fullscreen; autoplay',allowfullscreen:'true',referrerpolicy:'no-referrer'});
    const exitButton=node('button',{class:'btn classroom-fullscreen-exit',type:'button',text:'خروج از تمام‌صفحه'});
    frameWrap.append(frame,exitButton);
    root.append(frameWrap);
    const setFallbackExpanded=(expanded)=>{
      fallbackExpanded=expanded;
      frameWrap.classList.toggle('is-expanded',expanded);
      document.body.classList.toggle('classroom-fullscreen-fallback',expanded);
      expandButton.textContent=expanded?'خروج از تمام‌صفحه':'تمام‌صفحه';
      expandButton.setAttribute('aria-pressed',String(expanded));
    };
    syncFullscreen=()=>{
      const active=document.fullscreenElement===frameWrap || document.webkitFullscreenElement===frameWrap;
      if(active){expandButton.textContent='خروج از تمام‌صفحه';expandButton.setAttribute('aria-pressed','true');}
      else if(!fallbackExpanded){expandButton.textContent='تمام‌صفحه';expandButton.setAttribute('aria-pressed','false');}
    };
    leaveFullscreen=async()=>{
      if(fallbackExpanded){setFallbackExpanded(false);return;}
      try{
        if(document.exitFullscreen && document.fullscreenElement) await document.exitFullscreen();
        else if(document.webkitExitFullscreen && document.webkitFullscreenElement) document.webkitExitFullscreen();
      }catch{}
    };
    const toggleFullscreen=async()=>{
      if(fallbackExpanded || document.fullscreenElement===frameWrap || document.webkitFullscreenElement===frameWrap){await leaveFullscreen();return;}
      try{
        if(frameWrap.requestFullscreen) await frameWrap.requestFullscreen();
        else if(frameWrap.webkitRequestFullscreen) frameWrap.webkitRequestFullscreen();
      }catch{}
      if(document.fullscreenElement!==frameWrap && document.webkitFullscreenElement!==frameWrap) setFallbackExpanded(true);
    };
    expandButton.addEventListener('click',toggleFullscreen);
    exitButton.addEventListener('click',leaveFullscreen);
    document.addEventListener('fullscreenchange',syncFullscreen);
    document.addEventListener('webkitfullscreenchange',syncFullscreen);
    notice.textContent='کلاس در همین صفحه باز شده است. برای نمایش بزرگ‌تر، دکمهٔ «تمام‌صفحه» را بزنید. این سامانه ضبط خودکار ندارد و ضبط داخلی Jitsi غیرفعال است؛ در صورت بارگذاری فایل توسط مدیر، ویدئو تا ۴۸ ساعت پس از پایان کلاس در همین صفحه در دسترس خواهد بود.';
  } else if(data.provider==='google_meet' && data.meetingUrl) {
    notice.textContent='Google Meet در این مرحله امکان نمایش کامل داخل سایت را نمی‌دهد؛ برای ورود، پیوند زیر در صفحه‌ای جداگانه باز می‌شود.';
    root.append(node('a',{class:'btn',href:data.meetingUrl,target:'_blank',rel:'noopener noreferrer',text:'ورود به جلسه در Google Meet'}));
  } else {
    notice.className='form-status err';notice.textContent='اطلاعات اتاق کلاس دریافت نشد. لطفاً دوباره تلاش کنید.';
  }
  heartbeat=setInterval(pulse,60000);
}
function sessionCard(session, onJoin, onHost) {
  const start=Date.parse(session.startsAt),end=start+session.durationMinutes*60000,now=Date.now();
  const canEnter=session.status==='scheduled'&&now>=start-15*60000&&now<=end+30*60000;
  const card=node('article',{class:'card classroom-session-card'},[
    node('div',{class:'classroom-session-meta'},[
      node('span',{class:'badge',text:session.provider==='jitsi'?'کلاس تعبیه‌شده':'Google Meet'}),
      node('span',{class:'muted',text:session.durationMinutes+' دقیقه'}),
    ]),
    node('h2',{text:session.title}),
    node('p',{class:'muted',text:dateLabel(session.startsAt)}),
    ...(session.description?[node('p',{text:session.description})]:[]),
    ...(session.recordingAvailable?[node('video',{controls:'controls',preload:'metadata',src:'/api/classroom/sessions/'+session.id+'/recording',class:'classroom-recording-player'})]:[]),
    node('p',{class:'muted',text:session.guestEnabled?'امکان ورود مهمان با پیوند دعوت فعال است.':'ویژه اعضای تأییدشده'}),
  ]);
  const button=node('button',{class:'btn',type:'button',text:canEnter?'ورود به کلاس':'هنوز زمان ورود نرسیده است'});
  button.disabled=!canEnter;
  button.addEventListener('click',()=>onJoin(session,button));
  card.append(button);
  if (session.canHost && session.provider === 'jitsi') {
    const hostButton=node('button',{class:'btn secondary',type:'button',text:'شروع جلسه به‌عنوان مدرس'});
    hostButton.addEventListener('click',()=>onHost(session,hostButton));
    card.append(hostButton);
  }
  return card;
}
export async function classroomPage() {
  const root=node('section',{class:'classroom-page'},[
    node('span',{class:'section-kicker',text:'آموزش زنده'}),
    node('h1',{text:'کلاس‌های آنلاین'}),
    node('p',{class:'lead',text:'کلاس‌های برنامه‌ریزی‌شده را مشاهده کنید، در زمان مقرر وارد جلسه شوید و در صورت بارگذاری فایل، ویدئوی ضبط‌شده را تا ۴۸ ساعت پس از پایان کلاس ببینید.'}),
  ]);
  const status=node('p',{class:'form-status',role:'status',text:'در حال دریافت فهرست کلاس‌ها…'});
  const list=node('div',{class:'classroom-session-list'});
  const meeting=node('section',{class:'classroom-meeting'});
  root.append(status,list,meeting);
  const result=await getJson('/api/classroom/sessions');
  if(!result.ok){
    status.className='form-status err';
    status.textContent=result.status===401?'برای مشاهده و شرکت در کلاس‌ها ابتدا وارد حساب کاربری شوید.':'دریافت فهرست کلاس‌ها ممکن نشد؛ دوباره تلاش کنید.';
    return root;
  }
  status.textContent=result.data.sessions.length?'کلاس‌های پیش‌رو':'در حال حاضر کلاسی برای نمایش ثبت نشده است.';
  for(const session of result.data.sessions) {
    list.append(sessionCard(session,async(item,button)=>{
      button.disabled=true;button.textContent='در حال ورود…';
      const joined=await postJson('/api/classroom/sessions/'+item.id+'/join',{});
      if(!joined.ok){button.disabled=false;button.textContent='تلاش دوباره برای ورود';status.className='form-status err';status.textContent='ورود به کلاس ممکن نشد؛ ممکن است زمان جلسه پایان یافته باشد.';return;}
      mountMeeting(meeting,item.id,joined.data);
      meeting.scrollIntoView({behavior:'smooth',block:'start'});
    },async(item,button)=>{
      const hostWindow=window.open('about:blank','_blank');
      button.disabled=true;
      const result=await getJson('/api/classroom/sessions/'+item.id+'/host');
      button.disabled=false;
      if(!result.ok){
        if(hostWindow)hostWindow.close();
        status.className='form-status err';
        status.textContent=result.status===403?'برای این کلاس مجوز میزبانی ندارید.':'شروع اتاق مدرس ممکن نشد؛ زمان کلاس یا دسترسی را بررسی کنید.';
        return;
      }
      if(hostWindow){
        hostWindow.opener=null;
        hostWindow.location.replace(result.data.hostUrl);
      } else {
        const link=node('a',{class:'btn secondary',href:result.data.hostUrl,target:'_blank',rel:'noopener noreferrer',text:'باز کردن اتاق مدرس در Jitsi'});
        status.className='form-status';
        status.textContent='پنجره جدید مسدود شد. از پیوند زیر استفاده کنید:';
        status.append(link);
      }
    }));
  }
  return root;
}
export async function classroomGuestPage(params={}) {
  const sessionId=String(params.session||'');
  const code=String(params.code||'');
  const root=node('section',{class:'classroom-page'},[
    node('span',{class:'section-kicker',text:'دعوت به کلاس'}),
    node('h1',{text:'ورود مهمان به کلاس آنلاین'}),
    node('p',{class:'lead',text:'نام خود را وارد کنید تا دسترسی دعوت بررسی شود.'}),
  ]);
  if(!/^\d{1,10}$/.test(sessionId)||!code){
    root.append(node('p',{class:'form-status err',text:'پیوند دعوت ناقص یا نامعتبر است.'}));return root;
  }
  const form=node('form',{class:'card classroom-guest-form'});
  const name=node('input',{name:'name',type:'text',required:'required',minlength:'2',maxlength:'80',autocomplete:'name',placeholder:'نام و نام خانوادگی'});
  const submit=node('button',{class:'btn',type:'submit',text:'ورود به کلاس'});
  const status=node('p',{class:'form-status',role:'status'});
  form.append(node('label',{class:'admin-field'},[node('span',{text:'نام مهمان'}),name]),submit,status);
  const meeting=node('section',{class:'classroom-meeting'});
  form.addEventListener('submit',async event=>{
    event.preventDefault();submit.disabled=true;status.textContent='در حال بررسی دعوت…';
    const result=await postJson('/api/classroom/guest/'+sessionId+'/join',{code,name:name.value.trim()});
    submit.disabled=false;
    if(!result.ok){status.className='form-status err';status.textContent='کد دعوت معتبر نیست یا زمان ورود به کلاس پایان یافته است.';return;}
    mountMeeting(meeting,sessionId,result.data,{guestToken:result.data.guestToken,guest:true});
    form.hidden=true;
  });
  root.append(form,meeting);return root;
}
