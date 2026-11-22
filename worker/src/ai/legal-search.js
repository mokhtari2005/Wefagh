// جست‌وجوی حقوقی برخط با حداقل‌سازی داده: فقط واژگان حقوقیِ ازپیش‌تعریف‌شده به موتور جست‌وجو می‌رسند.
// متن پرونده، نام اشخاص، تاریخ‌ها، شماره پرونده و شرح وقایع هرگز در پرس‌وجوی وب قرار نمی‌گیرند.
import { generateText } from './gemini.js';

const LEGAL_TERMS = Object.freeze([
  'قانون مدنی', 'قانون اجرای احکام مدنی', 'قانون آیین دادرسی مدنی', 'قانون مجازات اسلامی',
  'قانون تجارت', 'قانون مسئولیت مدنی', 'قانون ثبت', 'قانون کار', 'قانون صدور چک',
  'قانون حمایت خانواده', 'قانون دیوان عدالت اداری', 'قانون شوراهای حل اختلاف',
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
  const unique = [...new Set(matches)].slice(0, 8);
  return unique.length ? `${unique.join(' ')} حقوق ایران متن قانون رأی قضایی نظریه مشورتی` : '';
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
      citedText: typeof item.citedText === 'string' ? item.citedText.slice(0, 700) : '',
    });
    if (sources.length >= 8) break;
  }
  return sources;
}

// شماره ماده فقط وقتی از guard عبور می‌کند که همان گزاره در گزیده‌ای از دامنه رسمی آمده باشد.
export function extractOfficialGroundedArticleReferences(sources) {
  const officialDomains = new Set([
    'qavanin.ir','rrk.ir','ara.jri.ac.ir','eadil.com','eadl.ir',
    'edarehoquqy.eadl.ir','divan-edalat.ir','adliran.ir','rc.majlis.ir',
  ]);
  const refs = new Set();
  for (const source of Array.isArray(sources) ? sources : []) {
    if (typeof source?.uri !== 'string' || typeof source?.citedText !== 'string' || !source.citedText.trim()) continue;
    let hostname = '';
    try { hostname = new URL(source.uri).hostname.toLowerCase(); } catch { continue; }
    if (![...officialDomains].some((domain) => hostname === domain || hostname.endsWith('.' + domain))) continue;
    for (const match of source.citedText.matchAll(/(?:ماده|مواد)\s*([۰-۹0-9]+)/gu)) {
      const number = match[1].replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
      refs.add(number);
    }
  }
  return [...refs].map((articleNumber) => ({ articleNumber }));
}

/**
 * جست‌وجوی برخط اختیاری. باید با GEMINI_SEARCH_GROUNDING_ENABLED=true فعال شود.
 * این تابع فقط query ساخته‌شده از واژگان حقوقی whitelist را به Google Search می‌دهد.
 */
export async function searchLegalAuthorities(env, input) {
  if (env.GEMINI_SEARCH_GROUNDING_ENABLED !== 'true') return { status: 'disabled', sources: [] };
  const query = buildSafeLegalSearchQuery(input);
  if (!query) return { status: 'no_legal_terms', sources: [] };

  try {
    const result = await generateText(env, {
      system: [
        'شما ابزار جست‌وجوی منابع حقوقی ایران هستید.',
        'فقط درباره پرس‌وجوی حقوقی داده‌شده جست‌وجو کن؛ هیچ نام شخص، شرح پرونده، شماره پرونده، نشانی یا داده خصوصی در اختیار تو قرار نگرفته و نباید چیزی از خود اضافه کنی.',
        'اولویت جست‌وجو: متن رسمی قوانین و مقررات در پایگاه‌های رسمی جمهوری اسلامی ایران، روزنامه رسمی، مجلس، قوه قضاییه و دیوان عالی کشور؛ سپس منابع حقوقی معتبر.',
        'خروجی را به‌صورت خلاصه‌ای کوتاه از آنچه در نتایج جست‌وجو دیده‌ای بنویس. میان متن رسمی قانون، رأی وحدت رویه، نظریه مشورتی، مقاله و بازنشر ثانویه تفکیک کن.',
        'شماره، تاریخ، متن ماده یا رأی را فقط وقتی ذکر کن که در نتیجه جست‌وجو صریحاً قابل مشاهده باشد. از حدس‌زدن و نقل‌قول ساختگی خودداری کن.',
        'نتایج جست‌وجو به‌تنهایی اثبات‌کننده اعتبار جاری یا اصالت سند نیستند؛ موارد نامطمئن را صریحاً علامت بزن.',
      ].join('\n'),
      contents: [{ role: 'user', parts: [{ text: `پرس‌وجوی عمومی و غیرشخصی حقوق ایران: ${query}` }] }],
      maxOutputTokens: 1800,
      timeoutMs: 35_000,
      useGoogleSearch: true,
    });
    const sources = safeSources(result.grounding);
    if (!sources.length) return { status: 'no_sources', sources: [], summary: result.text || '' };
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
