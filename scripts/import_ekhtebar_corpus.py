#!/usr/bin/env python3
"""Import the complete parseable public Iranian legal corpus into Wefagh D1.
All records remain needs_review until source-by-source human verification.
The workflow applies pending D1 migrations before importing and writes an audit artifact.
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
IMPORT_PHASE = os.getenv("LEGAL_IMPORT_PHASE", "laws").strip().lower()
PHASE_TYPES = {
    "laws": {"law", "treaty"},
    "regulations": {"bylaw", "executive_regulation", "executive_circular"},
}
if IMPORT_PHASE not in PHASE_TYPES:
    raise SystemExit("LEGAL_IMPORT_PHASE must be one of: laws, regulations")
DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩","01234567890123456789")
ARTICLE = re.compile(r"^\s*(?:#{1,6}\s*)?(ماده|اصل)\s*[\(（]?\s*([0-9۰-۹٠-٩]+(?:\s*(?:مکرر|الحاقی))?|[آ-ی‌]+(?:\s+و\s+[آ-ی‌]+)?)(?=\s*(?:[ـ\-–—:：]|[\)）]|$))\s*[\)）]?\s*(?:[ـ\-–—:：]\s*)?(.*)$")
SINGLE = re.compile(r"^\s*(?:#{1,6}\s*)?ماده[\s‌ـ\-]*واحده\s*(?:[ـ\-–—:：]\s*)?(.*)$")

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
    text=re.sub(r"\s+"," ",t.replace("\u200c"," ").strip())
    # Specific document families take precedence over generic title words.
    if "دیوان عالی کشور" in text and "اصراری" in text: return "supreme_court_insistence_precedent"
    if "دیوان عالی کشور" in text and "وحدت رویه" in text: return "supreme_court_unified_precedent"
    if "دیوان عدالت اداری" in text and "وحدت رویه" in text: return "administrative_court_unified_precedent"
    if "هیئت عمومی دیوان عدالت اداری" in text: return "administrative_court_general_board"
    if "هیئت تخصصی دیوان عدالت اداری" in text: return "administrative_court_specialized_board"
    if "نظریه مشورتی" in text and ("اداره کل حقوقی" in text or "قوه قضائیه" in text): return "judicial_advisory_opinion"
    if "نظریه مشورتی" in text: return "advisory_opinion"
    if "شورای نگهبان" in text and ("تفسیر" in text or "نظریه" in text): return "guardian_council_opinion"
    if "مرکز پژوهش های مجلس" in text or "مرکز پژوهش‌های مجلس" in text: return "parliamentary_research"
    # A statute approving a treaty is indexed as a treaty, not a bylaw.
    if "کنوانسیون" in text or "معاهده" in text: return "treaty"
    # A title beginning with قانون remains a statute even when it mentions
    # آیین‌نامه داخلی مجلس or another regulation in its title.
    if re.match(r"^(?:قانون|قوانین)\b", text): return "law"
    if "بخشنامه" in text and ("قوه قضائیه" in text or "رئیس قوه" in text): return "judicial_circular"
    if "بخشنامه" in text or "دستورالعمل" in text: return "executive_circular"
    if "آیین نامه" in text or "آیین‌نامه" in text: return "bylaw"
    if "تصویب نامه" in text or "تصویب‌نامه" in text: return "executive_regulation"
    if "قانون" in text or "اساسی" in text: return "law"
    return "other"
def parse_doc(path, index):
    raw=get(RAW+path).text
    lines=raw.replace("\r\n","\n").replace("\r","\n").replace("\u200c"," ").split("\n")
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
    vals=[lit(d["slug"]),lit(d["title"]),lit(d["lawType"]),"NULL","NULL","NULL","NULL","'needs_review'",lit(d["sourceName"]),lit(d["sourceUrl"]),lit(d["notes"]),"NULL"]
    law_sql=("INSERT OR IGNORE INTO legal_laws (slug,title,law_type,issuing_authority,approved_date,publication_date,effective_date,status,source_name,source_url,notes,created_by) VALUES ("+",".join(vals)+");")
    statements=[(law_sql, [])]

    # Keep SQL text short: pass article JSON as bound parameters, not SQL literals.
    chunk=[]
    chunk_bytes=0
    for article in d["articles"]:
        encoded=json.dumps(article,ensure_ascii=False,separators=(",",":"))
        encoded_bytes=len(encoded.encode("utf-8"))
        if chunk and (len(chunk)>=20 or chunk_bytes+encoded_bytes>48_000):
            payload=json.dumps(chunk,ensure_ascii=False,separators=(",",":"))
            statements.append((
                "INSERT OR IGNORE INTO legal_articles (law_id,article_number,heading,body,status) "
                "SELECT l.id,json_extract(j.value,'$.number'),json_extract(j.value,'$.heading'),json_extract(j.value,'$.body'),'needs_review' "
                "FROM legal_laws l,json_each(?) j WHERE l.slug=?;",
                [payload,d["slug"]]
            ))
            chunk=[]
            chunk_bytes=0
        chunk.append(article)
        chunk_bytes+=encoded_bytes
    if chunk:
        payload=json.dumps(chunk,ensure_ascii=False,separators=(",",":"))
        statements.append((
            "INSERT OR IGNORE INTO legal_articles (law_id,article_number,heading,body,status) "
            "SELECT l.id,json_extract(j.value,'$.number'),json_extract(j.value,'$.heading'),json_extract(j.value,'$.body'),'needs_review' "
            "FROM legal_laws l,json_each(?) j WHERE l.slug=?;",
            [payload,d["slug"]]
        ))
    return statements


def send(statements, inserted):
    """Submit a bounded batch and count actual D1 row changes, not attempted inserts."""
    if not statements:
        return
    response=requests.post(
        D1,
        headers={"Authorization":f"Bearer {TOKEN}","Content-Type":"application/json"},
        json={"batch":[{"sql":sql,"params":params} for sql,params in statements]},
        timeout=240,
    )
    if response.status_code!=200:
        raise RuntimeError(f"D1 HTTP {response.status_code}: {response.text[:1000]}")
    result=response.json()
    items=result.get("result") or []
    if not result.get("success") or any(not item.get("success",True) for item in items):
        details=result.get("errors",items)
        raise RuntimeError("D1 import batch failed: "+json.dumps(details,ensure_ascii=False)[:1200])
    if len(items)!=len(statements):
        raise RuntimeError(f"D1 returned {len(items)} batch results for {len(statements)} statements")
    for (sql,_), item in zip(statements,items):
        changes=int((item.get("meta") or {}).get("changes") or 0)
        if sql.startswith("INSERT OR IGNORE INTO legal_laws"):
            inserted["laws"]+=changes
        elif sql.startswith("INSERT OR IGNORE INTO legal_articles"):
            inserted["articles"]+=changes


def d1_query(sql, params=None):
    response=requests.post(
        D1,
        headers={"Authorization":f"Bearer {TOKEN}","Content-Type":"application/json"},
        json={"sql":sql,"params":params or []},
        timeout=120,
    )
    if response.status_code!=200:
        raise RuntimeError(f"D1 audit HTTP {response.status_code}: {response.text[:800]}")
    payload=response.json()
    if not payload.get("success"):
        raise RuntimeError("D1 audit query failed: "+json.dumps(payload.get("errors",[]),ensure_ascii=False)[:800])
    result=payload.get("result") or []
    if isinstance(result,list) and result:
        return result[0].get("results") or []
    if isinstance(result,dict):
        return result.get("results") or []
    return []


def audit_database():
    laws=d1_query("""SELECT COUNT(*) AS total,
        SUM(CASE WHEN status='needs_review' THEN 1 ELSE 0 END) AS needs_review,
        SUM(CASE WHEN status='verified' THEN 1 ELSE 0 END) AS verified,
        SUM(CASE WHEN status='amended' THEN 1 ELSE 0 END) AS amended,
        SUM(CASE WHEN status='repealed' THEN 1 ELSE 0 END) AS repealed,
        SUM(CASE WHEN source_name LIKE 'پایگاه خبری اختبار%' THEN 1 ELSE 0 END) AS ekhtebar_source
        FROM legal_laws""")
    articles=d1_query("""SELECT COUNT(*) AS total,
        SUM(CASE WHEN status='needs_review' THEN 1 ELSE 0 END) AS needs_review,
        SUM(CASE WHEN status='verified' THEN 1 ELSE 0 END) AS verified,
        SUM(CASE WHEN status='amended' THEN 1 ELSE 0 END) AS amended,
        SUM(CASE WHEN status='repealed' THEN 1 ELSE 0 END) AS repealed
        FROM legal_articles""")
    types=d1_query("SELECT law_type AS type,status,COUNT(*) AS count FROM legal_laws GROUP BY law_type,status ORDER BY law_type,status")
    return {"laws":laws[0] if laws else {},"articles":articles[0] if articles else {},"law_type_status":types}

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
    parsed_count = len(docs)
    phase_skipped = [d for d in docs if d["lawType"] not in PHASE_TYPES[IMPORT_PHASE]]
    docs = [d for d in docs if d["lawType"] in PHASE_TYPES[IMPORT_PHASE]]
    docs.sort(key=lambda x:x["slug"])
    print(f"Phase: {IMPORT_PHASE}; parsed {parsed_count}; selected {len(docs)}; excluded by phase {len(phase_skipped)}; parse-skipped {skipped}.")
    batch=[]; size=0; done=0
    inserted={"laws":0,"articles":0}
    for d in docs:
        for statement, params in sql_for(d):
            n=len(statement.encode("utf-8"))+len(json.dumps(params,ensure_ascii=False).encode("utf-8"))
            if batch and (len(batch)>=90 or size+n>3_500_000):
                send(batch,inserted); batch=[]; size=0
            batch.append((statement, params)); size+=n
        done+=1
        if done%25==0: print(f"Prepared: {done}/{len(docs)} documents")
    if batch: send(batch,inserted)
    type_counts={}
    for d in docs: type_counts[d["lawType"]]=type_counts.get(d["lawType"],0)+1
    os.makedirs("artifacts",exist_ok=True)
    try:
        database_audit=audit_database()
    except Exception as e:
        database_audit={"error":str(e)[:500]}
        print("WARNING: database audit failed: "+str(e)[:500])
    from collections import Counter
    skip_reason_counts=dict(Counter(x["reason"] for x in errors))
    with open(os.path.join(os.path.dirname(__file__), "legal_document_sources.json"), encoding="utf-8") as source_file:
        source_registry=json.load(source_file)
    discovery_sources=[{"key":s["key"],"url":s["url"],"mode":s.get("mode"),"authoritative":s.get("authoritative",True)} for s in source_registry.get("sources",[]) if s.get("discovery_only")]
    report={"source":"https://github.com/SaeedAqamiri/laws-mcp","index_source":"https://www.ekhtebar.ir/قوانین/","discovery_sources":discovery_sources,"files_found":len(files),"phase":IMPORT_PHASE,"documents_parsed":parsed_count,"documents_selected":len(docs),"documents_excluded_by_phase":len(phase_skipped),"documents_processed":done,"documents_inserted":inserted["laws"],"articles_inserted":inserted["articles"],"selected_type_counts":type_counts,"documents_skipped":skipped,"skip_reason_counts":skip_reason_counts,"database_audit":database_audit,"status":"needs_review","selected_types":sorted(PHASE_TYPES[IMPORT_PHASE]),"phase_excluded_sample":[{"slug":d["slug"],"title":d["title"],"type":d["lawType"]} for d in phase_skipped[:100]],"skip_sample":errors[:200]}
    with open("artifacts/legal-bank-import-report.json","w",encoding="utf-8") as f: json.dump(report,f,ensure_ascii=False,indent=2)
    print(json.dumps({k:v for k,v in report.items() if k!="skip_sample"},ensure_ascii=False))

if __name__=="__main__": main()
