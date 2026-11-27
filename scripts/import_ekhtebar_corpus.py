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
    "regulations": {"bylaw", "executive_regulation", "executive_circular", "circular", "executive_resolution", "general_policies"},
    "judicial": {
        "supreme_court_unified_precedent", "supreme_court_insistence_precedent",
        "administrative_court_unified_precedent", "administrative_court_general_board",
        "administrative_court_specialized_board", "judicial_advisory_opinion",
        "advisory_opinion", "guardian_council_opinion", "judicial_circular", "judicial_decision", "administrative_court_decision", "judicial_session",
    },
    "parliamentary": {"bill", "parliamentary_review_opinion"},
}
PHASE_TYPES["all"] = PHASE_TYPES["laws"] | PHASE_TYPES["regulations"] | PHASE_TYPES["judicial"] | PHASE_TYPES["parliamentary"]
if IMPORT_PHASE not in PHASE_TYPES:
    raise SystemExit("LEGAL_IMPORT_PHASE must be one of: laws, regulations, judicial, parliamentary, all")
DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩","01234567890123456789")
ARTICLE = re.compile(r"^\s*(?:#{1,6}\s*)?(ماده|اصل)\s*[\(（]?\s*([0-9۰-۹٠-٩]+(?:\s*(?:مکرر|الحاقی))?|[آ-ی‌]+(?:\s+و\s+[آ-ی‌]+)?)(?=\s*(?:[ـ\-–—:：؛،.]|[\)）]|$))\s*[\)）]?\s*(?:[ـ\-–—:：؛،.]\s*)?(.*)$")
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
    # One recursive Git tree call discovers statutes and the full category corpus.
    tree=get(f"{API}/git/trees/{BRANCH}?recursive=1",True).json()
    if tree.get("truncated"):
        raise RuntimeError("Source Git tree was truncated; refusing a partial legal-corpus import")
    rows=tree.get("tree")
    if not isinstance(rows,list):
        raise RuntimeError("Unexpected source Git tree response")
    return sorted(x["path"] for x in rows
                  if x.get("type")=="blob" and x.get("path","").endswith(".md")
                  and (x["path"].startswith("data/laws/") or x["path"].startswith("data/cats/")))


def category_type(path, title):
    parts=path.split("/")
    if len(parts)<3 or parts[1]!="cats":
        return classify(title)
    category=re.sub(r"[\s\u200c]+","",parts[2])
    value=re.sub(r"\s+"," ",title.replace("\u200c"," ").strip())
    if category=="آراوحدترویه":
        return "supreme_court_unified_precedent" if "دیوان عدالت اداری" not in value else "administrative_court_unified_precedent"
    if category=="نظریههایمشورتی":
        return "judicial_advisory_opinion"
    if category=="آییننامهها":
        return "bylaw"
    if category=="بخشنامهها":
        return "judicial_circular" if any(x in value for x in ("قوه قضائیه","رئیس قوه","دادگستری")) else "executive_circular"
    if category=="آرایدیوانعدالتاداری":
        return "administrative_court_general_board" if "هیئت عمومی" in value else "administrative_court_decision"
    if category=="مصوبات":
        return "executive_resolution"
    if category=="طرحولایحه":
        return "bill"
    if category=="نظریههایرئیسمجلس":
        return "parliamentary_review_opinion"
    if category=="نشستهایقضایی":
        return "judicial_session"
    if category=="رویهقضایی":
        return "judicial_decision"
    if category=="سیاستهایکلی":
        return "general_policies"
    return classify(title)

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
def find_official_source_url(raw):
    """Return only a directly embedded official URL; never relabel an Ekhtbar URL as official."""
    # Only inspect the document header, where source citations are declared;
    # links appearing inside the legal body may refer to unrelated authorities.
    header = "\n".join(raw.splitlines()[:12])
    matches = re.findall(r"https?://(?:www[.]?)?(?:qavanin[.]ir|rrk[.]ir|dotic[.]ir|media[.]dotic[.]ir)/[^\s\"'<>)]*", header, flags=re.IGNORECASE)
    for candidate in matches:
        candidate = candidate.rstrip(".,؛،)")
        if candidate.lower().startswith("https://"):
            return candidate[:1200]
    return ""


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
        m=re.search(r"https?://(?:www\.)?ekhtebar\.ir/[^\s)>]+",line)
        if m: source=m.group(0).rstrip(".,؛)"); break
    stem=path.rsplit("/",1)[-1][:-3]
    item=index.get(stem)
    if not source and item: source=item.get("url") or ""
    if not source: return None,"missing-source-url"
    official_source_url = find_official_source_url(raw)
    source_url = official_source_url or source
    content_sha256 = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    starts=[]
    for i,line in enumerate(lines):
        m=ARTICLE.match(line)
        if m:
            starts.append((i,m.group(2).translate(DIGITS).replace(" ",""),(m.group(3) or "").strip(" -*#\t"),m.group(1)))
        else:
            m=SINGLE.match(line)
            if m: starts.append((i,"واحده",(m.group(1) or "").strip(),"ماده"))
    doc_type=category_type(path,title)
    articles=[]; seen=set()
    if starts and doc_type in PHASE_TYPES["laws"] | PHASE_TYPES["regulations"]:
        for n,(pos,num,heading,kind) in enumerate(starts):
            end=starts[n+1][0] if n+1<len(starts) else len(lines)
            body="\n".join(lines[pos+1:end]).strip()
            if heading: body=(heading+"\n"+body).strip()
            body=re.sub(r"\n{3,}","\n\n",body)
            if not body or len(body)>100000 or num in seen: continue
            seen.add(num); articles.append({"number":num,"heading":f"{kind} {num}","body":body})
    else:
        # Judicial decisions and opinions are continuous texts, not statutory articles.
        body_lines=[]
        for line in lines:
            if line.strip()==f"# {title}" or re.match(r"^>\s*(?:منبع|پی.?دی.?اف)\s*:",line.strip(),re.I):
                continue
            body_lines.append(line)
        body="\n".join(body_lines).strip()
        body=re.sub(r"\n{3,}","\n\n",body)
        if len(body)>100000: body=body[:100000]
        if len(body)>=80:
            articles=[{"number":"متن کامل","heading":title[:240],"body":body}]
    if not articles: return None,"no-usable-full-text"
    slug="ekhtebar-"+hashlib.sha1(source.encode()).hexdigest()[:20]
    return {
        "slug":slug,
        "title":title[:240],
        "lawType":doc_type,
        "sourceName":"سامانه ملی قوانین و مقررات / روزنامه رسمی (پیوند مستقیم در سند)" if official_source_url else "پایگاه خبری اختبار (منبع ثانویه؛ نیازمند مقابله رسمی)",
        "sourceUrl":source_url[:1200],
        "officialSourceUrl":official_source_url,
        "discoverySourceUrl":source[:1200],
        "contentSha256":content_sha256,
        "notes":"متن از پیکره عمومی مبتنی بر اختبار استخراج شده است؛ وضعیت اولیه needs_review. پیوند رسمی فقط در صورت وجود مستقیم در سند ثبت شده؛ در غیر این صورت باید متن و نسخه جاری با سامانه ملی قوانین و مقررات یا روزنامه رسمی مقابله شود.",
        "articles":articles
    },None

def lit(v): return "'"+str(v).replace("'","''")+"'"
def sql_for(d):
    vals=[lit(d["slug"]),lit(d["title"]),lit(d["lawType"]),"NULL","NULL","NULL","NULL","'needs_review'",lit(d["sourceName"]),lit(d["sourceUrl"]),lit(d["notes"]),"NULL",lit(d["officialSourceUrl"]) if d.get("officialSourceUrl") else "NULL",lit(d["discoverySourceUrl"]) if d.get("discoverySourceUrl") else "NULL",lit(d["contentSha256"]) if d.get("contentSha256") else "NULL"]
    law_sql=("INSERT OR IGNORE INTO legal_laws (slug,title,law_type,issuing_authority,approved_date,publication_date,effective_date,status,source_name,source_url,notes,created_by,official_source_url,discovery_source_url,content_sha256) VALUES ("+",".join(vals)+");")
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

def normalize_title(value):
    value = value.replace("\u200c", " ").replace("\u200f", " ").translate(DIGITS)
    value = re.sub(r"[\u064b-\u065f\u0670]", "", value)
    value = re.sub(r"[\s\u200c]+", " ", value).strip()
    return value


def priority_coverage(documents, manifest):
    """Report discoverability in parsed source files; never imply legal verification."""
    rows = []
    for required in manifest.get("documents", []):
        aliases = [normalize_title(x) for x in [required.get("title", ""), *required.get("aliases", [])] if x]
        matches = []
        for doc in documents:
            title = normalize_title(doc.get("title", ""))
            if "منسوخ" in title:
                continue
            if any(title == alias or title.startswith(alias + " مصوب") or title.startswith(alias + " با اصلاحات") or title.startswith(alias + " (") for alias in aliases):
                matches.append({"title": doc["title"], "slug": doc["slug"], "type": doc["lawType"]})
        rows.append({
            "key": required["key"],
            "required_title": required["title"],
            "domain": required.get("domain", "general"),
            "priority": required.get("priority", "core"),
            "status": "present_in_source_mirror" if matches else "missing_from_source_mirror",
            "matches": matches[:5],
        })
    present = sum(1 for row in rows if row["status"] == "present_in_source_mirror")
    by_domain = {}
    for row in rows:
        bucket = by_domain.setdefault(row["domain"], {"total": 0, "present_in_source_mirror": 0, "missing_from_source_mirror": 0, "verified": 0})
        bucket["total"] += 1
        if row["status"] == "present_in_source_mirror":
            bucket["present_in_source_mirror"] += 1
        else:
            bucket["missing_from_source_mirror"] += 1
    return {
        "total_required": len(rows),
        "present_in_source_mirror": present,
        "missing_from_source_mirror": len(rows)-present,
        "verified": 0,
        "by_domain": by_domain,
        "documents": rows,
    }


def partition_document_updates(documents, existing_rows):
    """Separate new, unchanged, safely refreshable and protected source documents."""
    existing = {row["slug"]: row for row in existing_rows}
    new_docs, refreshable_docs, protected_docs, unchanged = [], [], [], 0
    for doc in documents:
        row = existing.get(doc["slug"])
        if row is None:
            new_docs.append(doc)
            continue
        old_hash = row.get("content_sha256")
        if old_hash and old_hash == doc.get("contentSha256"):
            unchanged += 1
            continue
        protected_articles = int(row.get("protected_articles") or 0)
        if row.get("status") == "needs_review" and protected_articles == 0:
            refreshable_docs.append((doc, old_hash))
        else:
            protected_docs.append((doc, old_hash))
    return new_docs, refreshable_docs, protected_docs, unchanged


def refresh_statements(doc):
    """Build a guarded replacement for a document whose law and articles remain unverified."""
    slug = doc["slug"]
    protected = "NOT EXISTS (SELECT 1 FROM legal_articles p WHERE p.law_id=legal_laws.id AND p.status IN ('verified','amended','repealed'))"
    statements = [
        (f"""UPDATE legal_laws SET title=?1,law_type=?2,source_name=?3,source_url=?4,notes=?5,
            official_source_url=?6,discovery_source_url=?7,content_sha256=?8,
            updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE slug=?9 AND status='needs_review' AND {protected}""",
         [doc["title"],doc["lawType"],doc["sourceName"],doc["sourceUrl"],doc["notes"],
          doc.get("officialSourceUrl") or None,doc.get("discoverySourceUrl") or None,doc["contentSha256"],slug]),
        (f"""DELETE FROM legal_articles WHERE law_id=(SELECT id FROM legal_laws WHERE slug=?1 AND status='needs_review')
            AND status='needs_review'
            AND NOT EXISTS (SELECT 1 FROM legal_articles p WHERE p.law_id=(SELECT id FROM legal_laws WHERE slug=?1)
              AND p.status IN ('verified','amended','repealed'))""", [slug]),
    ]
    chunk = []
    chunk_bytes = 0
    for article in doc["articles"]:
        encoded = json.dumps(article,ensure_ascii=False,separators=(",",":"))
        encoded_bytes = len(encoded.encode("utf-8"))
        if chunk and (len(chunk) >= 50 or chunk_bytes + encoded_bytes > 48_000):
            payload = json.dumps(chunk,ensure_ascii=False,separators=(",",":"))
            statements.append((
                f"""INSERT INTO legal_articles (law_id,article_number,heading,body,status)
                    SELECT l.id,json_extract(j.value,'$.number'),json_extract(j.value,'$.heading'),
                    json_extract(j.value,'$.body'),'needs_review'
                    FROM legal_laws l,json_each(?1) j WHERE l.slug=?2 AND l.status='needs_review'
                    AND NOT EXISTS (SELECT 1 FROM legal_articles p WHERE p.law_id=l.id
                      AND p.status IN ('verified','amended','repealed'))""",
                [payload,slug]))
            chunk = []
            chunk_bytes = 0
        chunk.append(article)
        chunk_bytes += encoded_bytes
    if chunk:
        payload = json.dumps(chunk,ensure_ascii=False,separators=(",",":"))
        statements.append((
            f"""INSERT INTO legal_articles (law_id,article_number,heading,body,status)
                SELECT l.id,json_extract(j.value,'$.number'),json_extract(j.value,'$.heading'),
                json_extract(j.value,'$.body'),'needs_review'
                FROM legal_laws l,json_each(?1) j WHERE l.slug=?2 AND l.status='needs_review'
                AND NOT EXISTS (SELECT 1 FROM legal_articles p WHERE p.law_id=l.id
                  AND p.status IN ('verified','amended','repealed'))""",
            [payload,slug]))
    statements.append((
        """UPDATE legal_document_update_queue SET review_status='accepted',
            reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
            review_note='به‌روزرسانی خودکار؛ نسخه قبلی و مواد آن تأییدنشده بودند.'
            WHERE slug=?1 AND proposed_sha256=?2 AND review_status='needs_review'
            AND EXISTS (SELECT 1 FROM legal_laws l WHERE l.slug=?1 AND l.status='needs_review'
              AND NOT EXISTS (SELECT 1 FROM legal_articles p WHERE p.law_id=l.id
                AND p.status IN ('verified','amended','repealed')))""",
        [slug,doc["contentSha256"]]))
    return statements


def refresh_unverified_documents(refreshable_docs):
    """Replace only needs_review text; verified/amended/repealed content is never touched."""
    if not refreshable_docs:
        return {"documents_updated":0,"articles_deleted":0,"articles_inserted":0,"queue_accepted":0,"skipped_large":0}
    stats = {"documents_updated":0,"articles_deleted":0,"articles_inserted":0,"queue_accepted":0,"skipped_large":0}
    batch = []
    batch_bytes = 0

    def submit(items):
        if not items:
            return
        response = requests.post(D1,headers={"Authorization":f"Bearer {TOKEN}","Content-Type":"application/json"},
            json={"batch":[{"sql":sql,"params":params} for sql,params in items]},timeout=240)
        if response.status_code != 200:
            raise RuntimeError(f"Legal auto-refresh HTTP {response.status_code}: {response.text[:800]}")
        result = response.json()
        results = result.get("result") or []
        if not result.get("success") or len(results) != len(items) or any(not item.get("success",True) for item in results):
            raise RuntimeError("Legal auto-refresh batch failed: "+json.dumps(result.get("errors",results),ensure_ascii=False)[:1000])
        for (sql,_),item in zip(items,results):
            changes = int((item.get("meta") or {}).get("changes") or 0)
            if sql.startswith("UPDATE legal_laws SET"):
                stats["documents_updated"] += changes
            elif sql.startswith("DELETE FROM legal_articles"):
                stats["articles_deleted"] += changes
            elif sql.startswith("INSERT INTO legal_articles"):
                stats["articles_inserted"] += changes
            elif sql.startswith("UPDATE legal_document_update_queue"):
                stats["queue_accepted"] += changes

    for doc,_previous_hash in refreshable_docs:
        statements = refresh_statements(doc)
        encoded_size = sum(len(sql.encode("utf-8"))+len(json.dumps(params,ensure_ascii=False).encode("utf-8")) for sql,params in statements)
        if len(statements) > 90 or encoded_size > 3_500_000:
            stats["skipped_large"] += 1
            continue
        if batch and (len(batch)+len(statements)>90 or batch_bytes+encoded_size>3_500_000):
            submit(batch)
            batch=[]
            batch_bytes=0
        batch.extend(statements)
        batch_bytes += encoded_size
    if batch:
        submit(batch)
    return stats


def queue_changed_documents(changed_docs):
    """Persist changed source proposals; auto-refreshed unverified records are marked accepted."""
    if not changed_docs:
        return 0
    statements = []
    for doc, previous_hash in changed_docs:
        payload = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
        statements.append({
            "sql": """INSERT OR IGNORE INTO legal_document_update_queue
                (law_id,slug,title,previous_sha256,proposed_sha256,proposed_payload_json,discovery_source_url,official_source_url)
                SELECT id,?1,?2,?3,?4,?5,?6,?7 FROM legal_laws WHERE slug=?1""",
            "params": [doc["slug"], doc["title"], previous_hash, doc["contentSha256"], payload,
                       doc.get("discoverySourceUrl") or doc.get("sourceUrl"), doc.get("officialSourceUrl") or None],
        })
    inserted = 0
    for start in range(0, len(statements), 40):
        batch = statements[start:start+40]
        response=requests.post(D1,headers={"Authorization":f"Bearer {TOKEN}","Content-Type":"application/json"},
            json={"batch":batch},timeout=240)
        if response.status_code != 200:
            raise RuntimeError(f"Legal update queue HTTP {response.status_code}: {response.text[:800]}")
        result=response.json()
        items=result.get("result") or []
        if not result.get("success") or len(items) != len(batch) or any(not item.get("success",True) for item in items):
            raise RuntimeError("Legal update queue batch failed: "+json.dumps(result.get("errors",items),ensure_ascii=False)[:1000])
        inserted += sum(int((item.get("meta") or {}).get("changes") or 0) for item in items)
    return inserted


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
    existing_rows = d1_query("""SELECT l.slug,l.content_sha256,l.status,
        SUM(CASE WHEN a.status IN ('verified','amended','repealed') THEN 1 ELSE 0 END) AS protected_articles
        FROM legal_laws l LEFT JOIN legal_articles a ON a.law_id=l.id GROUP BY l.id""")
    new_docs, refreshable_docs, protected_docs, unchanged_docs = partition_document_updates(docs, existing_rows)
    changed_docs = refreshable_docs + protected_docs
    queued_updates = queue_changed_documents(changed_docs)
    refresh_stats = refresh_unverified_documents(refreshable_docs)
    print(f"Change detection: {len(new_docs)} new; {len(changed_docs)} changed; {unchanged_docs} unchanged; "
          f"{len(refreshable_docs)} unverified auto-refresh candidates; {len(protected_docs)} protected for review.")
    batch=[]; size=0; done=0
    inserted={"laws":0,"articles":0}
    for d in new_docs:
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
    with open(os.path.join(os.path.dirname(__file__), "legal_priority_documents.json"), encoding="utf-8") as priority_file:
        priority_manifest=json.load(priority_file)
    priority_audit=priority_coverage([*docs, *phase_skipped], priority_manifest)
    report={"priority_coverage":priority_audit,"source":"https://github.com/SaeedAqamiri/laws-mcp","index_source":"https://www.ekhtebar.ir/قوانین/","official_sources":["https://qavanin.ir/","https://www.rrk.ir/"],"discovery_sources":discovery_sources,"official_links_found":sum(1 for d in docs if d.get("officialSourceUrl")),"documents_without_direct_official_link":sum(1 for d in docs if not d.get("officialSourceUrl")),"files_found":len(files),"source_families":{"statute_files":sum(1 for p in files if p.startswith("data/laws/")),"category_files":sum(1 for p in files if p.startswith("data/cats/"))},"phase":IMPORT_PHASE,"documents_parsed":parsed_count,"documents_selected":len(docs),"documents_excluded_by_phase":len(phase_skipped),"documents_processed":done,"documents_new":len(new_docs),"documents_unchanged":unchanged_docs,"documents_changed_detected":len(changed_docs),"updates_logged":queued_updates,"documents_auto_refreshed":refresh_stats["documents_updated"],"articles_replaced_deleted":refresh_stats["articles_deleted"],"articles_refreshed_inserted":refresh_stats["articles_inserted"],"updates_auto_accepted":refresh_stats["queue_accepted"],"protected_documents_pending_review":len(protected_docs)+refresh_stats["skipped_large"],"auto_refresh_skipped_large":refresh_stats["skipped_large"],"documents_inserted":inserted["laws"],"articles_inserted":inserted["articles"],"selected_type_counts":type_counts,"documents_skipped":skipped,"skip_reason_counts":skip_reason_counts,"database_audit":database_audit,"status":"needs_review","automation_policy":"new documents remain needs_review; changed unverified documents are refreshed automatically; documents with verified/amended/repealed law or article status are only queued for review","selected_types":sorted(PHASE_TYPES[IMPORT_PHASE]),"phase_excluded_sample":[{"slug":d["slug"],"title":d["title"],"type":d["lawType"]} for d in phase_skipped[:100]],"skip_sample":errors[:200]}
    with open("artifacts/legal-bank-import-report.json","w",encoding="utf-8") as f: json.dump(report,f,ensure_ascii=False,indent=2)
    print(json.dumps({k:v for k,v in report.items() if k!="skip_sample"},ensure_ascii=False))

if __name__=="__main__": main()
