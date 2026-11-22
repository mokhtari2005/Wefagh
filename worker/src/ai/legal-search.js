// جست‌وجوی حقوقی برخط با حداقل‌سازی داده: فقط واژگان حقوقیِ ازپیش‌تعریف‌شده به موتور جست‌وجو می‌رسند.
// متن پرونده، نام اشخاص، تاریخ‌ها، شماره پرونده و شرح وقایع هرگز در پرس‌وجوی وب قرار نمی‌گیرند.
import { generateText } from './gemini.js';
import { extractExplicitLegalReferences } from '../legal-bank.js';

const LEGAL_TERMS = Object.freeze([
  'قانون مدنی', 'قانون اجرای احکام مدنی', 'قانون آیین دادرسی مدنی', 'قانون آیین دادرسی کیفری', 'قانون مجازات اسلامی',
  'قانون تجارت', 'قانون مسئولیت مدنی', 'قانون ثبت', 'قانون ثبت اسناد و املاک', 'قانون امور حسبی', 'قانون روابط موجر و مستأجر', 'قانون مالیات‌های مستقیم', 'قانون کار', 'قانون صدور چک',
  'قانون حمایت خانواده', 'قانون دیوان عدالت اداری', 'قانون شوراهای حل اختلاف', 'قانون بیمه اجباری خسارات واردشده به شخص ثالث',
  'توقیف', 'بازداشت', 'بطلان', 'عدم نفوذ', 'معامله فضولی', 'تدلیس', 'خیار عیب',
  'تخلف از شرط', 'تخلف از وصف', 'استرداد ثمن', 'خسارت تأخیر تأدیه', 'رأی وحدت رویه',
  'نظریه مشورتی', 'صلاحیت محلی', 'مرور زمان', 'مهلت تجدیدنظر', 'واخواهی',
  'اعتراض ثالث', 'اعاده دادرسی', 'ضمان درک', 'مستحق‌للغیر', 'وجه التزام',
  'فسخ قرارداد', 'الزام به تنظیم سند', 'مطالبه وجه', 'چک', 'سفته', 'تأمین خواسته',
  'دستور موقت', 'اثبات مالکیت', 'الزام به ایفای تعهد', 'اجاره', 'سرقفلی',
  'خلع ید', 'تصرف عدوانی', 'دستور تخلیه', 'نفقه', 'مهریه', 'حضانت',
]);

export function buildSafeLegalSearchQuery(input) {
  const normalized = String(input || '').normalize('NFKC')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک');
  const matches = LEGAL_TERMS.filter((term) => normalized.includes(term));
  const safeLawTitles = ['قانون اجرای احکام مدنی','قانون مدنی','قانون آیین دادرسی مدنی','قانون آیین دادرسی کیفری','قانون مجازات اسلامی','قانون تجارت','قانون مسئولیت مدنی','قانون ثبت','قانون ثبت اسناد و املاک','قانون امور حسبی','قانون روابط موجر و مستأجر','قانون مالیات‌های مستقیم','قانون کار','قانون صدور چک','قانون حمایت خانواده','قانون دیوان عدالت اداری','قانون شوراهای حل اختلاف'];
  const exactReferences = extractExplicitLegalReferences(normalized)
    .filter((ref) => safeLawTitles.some((title) => normalized.includes(title) && ref.lawTitle.includes(title)))
    .map((ref) => safeLawTitles.find((title) => normalized.includes(title) && ref.lawTitle.includes(title)) + ' ماده ' + ref.articleNumber);
  // پرسش‌های مربوط به چک معمولاً نام قانون را ذکر نمی‌کنند؛ موضوع را به محورهای
  // قانونی لازم برای تحقیق گسترش بده، بی‌آنکه شرح پرونده یا داده شخصی ارسال شود.
  const chequeTopic = /چک|گواهی\s*عدم\s*پرداخت|برگشت\s*چک|صیاد/u.test(normalized);
  const chequeResearchTerms = chequeTopic
    ? ['قانون صدور چک', 'مهلت مراجعه به بانک', 'مهلت شکایت کیفری', 'موارد عدم تعقیب کیفری', 'اجرائیه قضایی چک', 'اجرای ثبت چک', 'خسارت تأخیر تأدیه چک']
    : [];
  const remainingMatches = matches.filter((term) => !exactReferences.some((ref) => ref.startsWith(term + ' ماده ')));
  const unique = [...new Set([...exactReferences, ...chequeResearchTerms, ...remainingMatches])].slice(0, 12);
  return unique.length ? `${unique.join(' ')} حقوق ایران متن رسمی قانون و رأی قضایی «آرای وحدت رویه دیوان عالی کشور» «نظریات مشورتی اداره کل حقوقی قوه قضاییه»` : '';
}

const OFFICIAL_LEGAL_HOSTS = new Set([
  'qavanin.ir', 'www.qavanin.ir', 'rrk.ir', 'www.rrk.ir',
  'ara.jri.ac.ir', 'eadil.com', 'www.eadil.com',
  'edarehoquqy.eadl.ir', 'divan-edalat.ir', 'www.divan-edalat.ir',
]);

function htmlToPlainText(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    })
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * فقط صفحات دامنه‌های رسمیِ ازپیش‌مجاز خوانده می‌شوند؛ تغییرمسیر دنبال نمی‌شود.
 * بازیابی متن صفحه، به‌تنهایی اثبات‌کننده جاری‌بودن قانون یا اعتبار حقوقی سند نیست.
 */
export async function retrieveOfficialPageText(sources) {
  const output = [];
  let totalChars = 0;
  for (const source of (Array.isArray(sources) ? sources : []).slice(0, 8)) {
    let parsed;
    try { parsed = new URL(source.uri); } catch { output.push({ ...source, pageTextStatus: 'invalid_url' }); continue; }
    if (parsed.protocol !== 'https:' || (parsed.port && parsed.port !== '443') || parsed.username || parsed.password || !OFFICIAL_LEGAL_HOSTS.has(parsed.hostname.toLowerCase())) {
      output.push({ ...source, pageTextStatus: 'not_primary_source_domain' });
      continue;
    }
    if (totalChars >= 14_000) {
      output.push({ ...source, pageTextStatus: 'retrieval_limit_reached' });
      continue;
    }
    try {
      const response = await fetch(parsed.href, {
        method: 'GET',
        redirect: 'manual',
        headers: { accept: 'text/html, text/plain;q=0.9' },
        signal: AbortSignal.timeout(7000),
      });
      if (response.status >= 300 && response.status < 400) {
        output.push({ ...source, pageTextStatus: 'redirect_not_followed' });
        continue;
      }
      if (!response.ok) {
        output.push({ ...source, pageTextStatus: 'http_' + response.status });
        continue;
      }
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const length = Number(response.headers.get('content-length') || 0);
      if (length > 1_500_000 || (!contentType.includes('text/html') && !contentType.includes('text/plain'))) {
        output.push({ ...source, pageTextStatus: contentType.includes('pdf') ? 'pdf_text_extraction_unavailable' : 'unsupported_content_type' });
        continue;
      }
      let raw = '';
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let received = 0;
        try {
          while (received < 1_500_000) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
            const allowed = chunk.subarray(0, Math.max(0, 1_500_000 - received));
            raw += decoder.decode(allowed, { stream: true });
            received += allowed.length;
            if (allowed.length < chunk.length) {
              await reader.cancel();
              break;
            }
          }
          raw += decoder.decode();
        } finally {
          try { reader.releaseLock(); } catch {}
        }
      } else {
        raw = (await response.text()).slice(0, 1_500_000);
      }
      const plain = htmlToPlainText(raw);
      if (plain.length < 250) {
        output.push({ ...source, pageTextStatus: 'page_text_too_short' });
        continue;
      }
      const pageText = plain.slice(0, Math.min(5_000, 14_000 - totalChars));
      totalChars += pageText.length;
      output.push({ ...source, pageText, pageTextStatus: 'official_domain_page_text_retrieved' });
    } catch (error) {
      output.push({ ...source, pageTextStatus: error?.name === 'TimeoutError' ? 'retrieval_timeout' : 'retrieval_failed' });
    }
  }
  return output;
}

function safeSources(grounding) {
  const seen = new Set();
  const sources = [];
  for (const item of (Array.isArray(grounding?.sources) ? grounding.sources : [])) {
    if (!item || typeof item.uri !== 'string') continue;
    let parsed;
    try { parsed = new URL(item.uri); } catch { continue; }
    if (parsed.protocol !== 'https:' || seen.has(parsed.href)) continue;
    seen.add(parsed.href);
    sources.push({
      title: String(item.title || parsed.hostname).replace(/[\r\n\[\]()]/g, ' ').slice(0, 180),
      uri: parsed.href,
      domain: parsed.hostname,
      supportedClaim: typeof item.supportedClaim === 'string' ? item.supportedClaim.slice(0, 700) : '',
    });
    if (sources.length >= 8) break;
  }
  return sources;
}

// Google grounding فقط ارتباط یک بخش از پاسخ با نتیجه جست‌وجو را گزارش می‌کند؛ متن صفحه منبع را برنمی‌گرداند.
/**
 * جست‌وجوی برخط برای تحقیق حقوقی فعال است؛ فقط با مقدار صریح false غیرفعال می‌شود.
 * این تابع فقط query ساخته‌شده از واژگان حقوقی whitelist را به Google Search می‌دهد.
 */
export async function searchLegalAuthorities(env, input) {
  if (env.GEMINI_SEARCH_GROUNDING_ENABLED === 'false') return { status: 'disabled', sources: [] };
  const query = buildSafeLegalSearchQuery(input);
  if (!query) return { status: 'no_legal_terms', sources: [] };

  try {
    const result = await generateText(env, {
      system: [
        'شما ابزار جست‌وجوی منابع حقوقی ایران هستید.',
        'فقط درباره پرس‌وجوی حقوقی داده‌شده جست‌وجو کن؛ هیچ نام شخص، شرح پرونده، شماره پرونده، نشانی یا داده خصوصی در اختیار تو قرار نگرفته و نباید چیزی از خود اضافه کنی.',
        'برای هر مسئله، علاوه بر متن قانون، در صورت ارتباط رأی وحدت رویه دیوان عالی کشور و آرای هیأت عمومی دیوان عدالت اداری و نیز نظریات مشورتی اداره کل حقوقی قوه قضاییه را جست‌وجو کن. شماره، تاریخ، مرجع و موضوع هر سند را فقط در صورت مشاهده صریح ثبت کن.',
        'اولویت جست‌وجو: متن رسمی قوانین و مقررات، آرای منتشرشده در پایگاه‌های رسمی قوه قضاییه و دیوان عالی کشور، نظریات منتشرشده از سوی اداره کل حقوقی قوه قضاییه؛ سپس منابع حقوقی معتبر.',
        'خروجی را به‌صورت خلاصه‌ای کوتاه از آنچه در نتایج جست‌وجو دیده‌ای بنویس. میان متن رسمی قانون، رأی وحدت رویه، نظریه مشورتی، مقاله و بازنشر ثانویه تفکیک کن.',
        'شماره، تاریخ، متن ماده یا رأی را فقط وقتی ذکر کن که در نتیجه جست‌وجو صریحاً قابل مشاهده باشد. از حدس‌زدن و نقل‌قول ساختگی خودداری کن.',
        'نتایج جست‌وجو به‌تنهایی اثبات‌کننده اعتبار جاری یا اصالت سند نیستند؛ موارد نامطمئن را صریحاً علامت بزن.',
      ].join('\n'),
      contents: [{ role: 'user', parts: [{ text: `پرس‌وجوی عمومی و غیرشخصی حقوق ایران: ${query}` }] }],
      maxOutputTokens: 1800,
      timeoutMs: 35_000,
      useGoogleSearch: true,
    });
    const discoveredSources = safeSources(result.grounding);
    const sources = await retrieveOfficialPageText(discoveredSources);
    if (!sources.length) return { status: result.grounding?.searchSuggestionHtml ? 'suggestions_only' : 'no_sources', sources: [], summary: result.text || '', searchSuggestionHtml: result.grounding?.searchSuggestionHtml || '' };
    return {
      status: 'searched',
      summary: String(result.text || '').slice(0, 7000),
      sources,
      queries: Array.isArray(result.grounding?.queries) ? result.grounding.queries.slice(0, 5) : [],
      searchSuggestionHtml: typeof result.grounding?.searchSuggestionHtml === 'string' ? result.grounding.searchSuggestionHtml : '',
    };
  } catch (error) {
    // خطا فقط به‌صورت کد امن گزارش می‌شود؛ متن درخواست و پیام خام خطا ثبت نمی‌شود.
    return { status: 'failed', code: /^[A-Z][A-Z0-9_]{1,39}$/.test(String(error?.code || '')) ? error.code : 'SEARCH_FAILED', sources: [] };
  }
}
