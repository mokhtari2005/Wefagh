#!/usr/bin/env python3
"""Import structured legal texts mirrored from the public ekhtebar corpus into D1.
Every imported record remains needs_review until human verification.
"""
import concurrent.futures, hashlib, json, os, re, time
from urllib.parse import parse_qs, urlparse
import requests

OWNER, REPO, BRANCH = "SaeedAqamiri", "laws-mcp", "main"
API = f"https://api.github.com/repos/{OWNER}/{REPO}"
RAW = f"https://raw.githubusercontent.com/{OWNER}/{REPO}/{BRANCH}/"
ACCOUNT, TOKEN = os.environ["CLOUDFLARE_ACCOUNT_ID"], os.environ["CLOUDFLARE_API_TOKEN"]
DB_ID = "a02aeb28-b6e7-4423-9671-1ce3f9e3038b"
D1 = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/d1/database/{DB_ID}/query"
GH = {"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}
if os.getenv("GITHUB_TOKEN"): GH["Authorization"] = f"Bearer {os.environ['GITHUB_TOKEN']}"
DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩","01234567890123456789")
ARTICLE = re.compile(r"^\s*(?:#{1,6}\s*)?(ماده|اصل)\s*[\(（]?\s*([0-9۰-۹٠-٩]+(?:\s*(?:مکرر|الحاقی))?)\s*[\)）]?\s*(?:[ـ\-–—:：]\s*)?(.*)$")
SINGLE = re.compile(r"^\s*(?:#{1,6}\s*)?ماده\s+واحده\s*(?:[ـ\-–—:：]\s*)?(.*)$")

def get(url, github=False):
    for attempt in range(5):
        r = requests.get(url, headers=GH if github else None, timeout=90)
        if r.status_code == 200: return r
        if r.status_code in (403,429,500,502,503,504):
            time.sleep(min(2**attempt,20)); continue
        r.raise_for_status()
    r.raise_for_status()

def get_index():
    items = get(RAW+"data/index.json").json()
    by_stem = {}
    for x in items:
        u=x.get("url") or ""; p=urlparse(u); q=parse_qs(p.query).get("p",[""])[0]
        if q: by_stem["p"+q]=x
        stem=p.path.rstrip("/").split("/")[-1]
        if stem: by_stem[stem]=x
    return by_stem

def get_files():
    rows=get(f"{API}/contents/data/laws?ref={BRANCH}&per_page=1000",True).json()
    if not isinstance(rows,list): raise RuntimeError("Unexpected source directory response")
    return [x["path"] for x in rows if x.get("type")=="file" and x.get("name","").endswith(".md")]

def classify(t):
    if "وحدت رویه" in t and ("رأی" in t or "رای" in t): return "unified_precedent"
    if "نظریه مشورتی" in t: return "advisory_opinion"
    if "بخشنامه" in t or "دستورالعمل" in t: return "circular"
    if "آیین‌نامه" in t or "آیین نامه" in t: return "bylaw"
    if "تصویب‌نامه" in t or "تصویب نامه" in t: return "regulation"
    if "قانون" in t or "اساسی" in t: return "law"
    return "other"

def parse_doc(path, index):
    raw=get(RAW+path).text
    lines=raw.replace("\r\n","\n").replace("\r","\n").split("\n")
    title=""
    for line in lines[:12]:
        m=re.match(r"^\s*#\s+(.+?)\s*$",line)
        if m: title=m.group(1).strip(); break
    if not title: return None,"missing-title"
    source=""
    for line in lines[:12]:
        m=re.search(r"https://www\.ekhtebar\.ir/[^\s)>]+",line)
        if m: source=m.group(0).rstrip(".,؛)"); break
    stem=path.rsplit("/",1)[-1][:-3]
    item=index.get(stem)
    if not source and item: source=item.get("url") or ""
    if not source: return None,"missing-source-url"
    starts=[]
    for i,line in enumerate(lines):
        m=ARTICLE.match(line)
        if m:
            starts.append((i,m.group(2).translate(DIGITS).replace(" ",""),(m.group(3) or "").strip(" -*#\t"),m.group(1)))
        else:
            m=SINGLE.match(line)
            if m: starts.append((i,"واحده",(m.group(1) or "").strip(),"ماده"))
    if not starts: return None,"no-article-structure"
    articles=[]; seen=set()
    for n,(pos,num,heading,kind) in enumerate(starts):
        end=starts[n+1][0] if n+1<len(starts) else len(lines)
        body="\n".join(lines[pos+1:end]).strip()
        if heading: body=(heading+"\n"+body).strip()
        body=re.sub(r"\n{3,}","\n\n",body)
        if not body or len(body)>100000 or num in seen: continue
        seen.add(num); articles.append({"number":num,"heading":f"{kind} {num}","body":body})
    if not articles: return None,"no-valid-articles"
    slug="ekhtebar-"+hashlib.sha1(source.encode()).hexdigest()[:20]
    return {"slug":slug,"title":title[:240],"lawType":classify(title),"sourceName":"پایگاه خبری اختبار (منبع ثانویه؛ نیازمند مقابله رسمی)","sourceUrl":source[:1000],"notes":"ورود خودکار از پیکره عمومی مبتنی بر اختبار؛ وضعیت اولیه needs_review؛ پیش از استناد باید متن و نسخه جاری با روزنامه رسمی یا سامانه ملی قوانین مقابله شود.","articles":articles},None

def lit(v): return "'"+str(v).replace("'","''")+"'"
def sql_for(d):
    slug=lit(d["slug"])
    vals=[lit(d["slug"]),lit(d["title"]),lit(d["lawType"]),"NULL","NULL","NULL","NULL","'needs_review'",lit(d["sourceName"]),lit(d["sourceUrl"]),lit(d["notes"]),"NULL"]
    a=("INSERT OR IGNORE INTO legal_laws (slug,title,law_type,issuing_authority,approved_date,publication_date,effective_date,status,source_name,source_url,notes,created_by) VALUES ("+",".join(vals)+");")
    payload=lit(json.dumps(d["articles"],ensure_ascii=False,separators=(",",":")))
    b=("INSERT OR IGNORE INTO legal_articles (law_id,article_number,heading,body,status) "
       "SELECT l.id,json_extract(j.value,'$.number'),json_extract(j.value,'$.heading'),json_extract(j.value,'$.body'),'needs_review' "
       f"FROM legal_laws l,json_each({payload}) j WHERE l.slug={slug};")
    return [a,b]

def send(sqls):
    r=requests.post(D1,headers={"Authorization":f"Bearer {TOKEN}","Content-Type":"application/json"},
                    json={"batch":[{"sql":s,"params":[]} for s in sqls]},timeout=240)
    if r.status_code!=200: raise RuntimeError(f"D1 HTTP {r.status_code}: {r.text[:1000]}")
    d=r.json()
    if not d.get("success") or any(not x.get("success",True) for x in d.get("result",[])):
        raise RuntimeError("D1 import batch failed: "+json.dumps(d.get("errors",d.get("result",[])),ensure_ascii=False)[:1200])

def main():
    index=get_index(); files=get_files()
    print(f"Source mirror: {len(files)} Markdown files; parsing...")
    docs=[]; skipped=0; errors=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        futures={pool.submit(parse_doc,p,index):p for p in files}
        for f in concurrent.futures.as_completed(futures):
            p=futures[f]
            try:
                d,reason=f.result()
                if d: docs.append(d)
                else: skipped+=1; errors.append({"file":p,"reason":reason})
            except Exception as e: skipped+=1; errors.append({"file":p,"reason":str(e)[:250]})
    docs.sort(key=lambda x:x["slug"])
    print(f"Parsed {len(docs)} documents; skipped {skipped}.")
    batch=[]; size=0; done=0
    for d in docs:
        statements=sql_for(d)
        n=sum(len(q.encode()) for q in statements)
        if batch and (len(batch)+len(statements)>90 or size+n>3_500_000):
            send(batch); done+=len(batch)//2; print(f"D1 submitted: {done}/{len(docs)}"); batch=[]; size=0
        batch.extend(statements); size+=n
    if batch:
        send(batch); done+=len(batch)//2
    os.makedirs("artifacts",exist_ok=True)
    report={"source":"https://github.com/SaeedAqamiri/laws-mcp","index_source":"https://www.ekhtebar.ir/قوانین/","files_found":len(files),"documents_parsed":len(docs),"documents_submitted":done,"documents_skipped":skipped,"status":"needs_review","skip_sample":errors[:100]}
    with open("artifacts/legal-bank-import-report.json","w",encoding="utf-8") as f: json.dump(report,f,ensure_ascii=False,indent=2)
    print(json.dumps({k:v for k,v in report.items() if k!="skip_sample"},ensure_ascii=False))

if __name__=="__main__": main()
