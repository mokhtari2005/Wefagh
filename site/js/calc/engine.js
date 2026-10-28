// موتور محاسبهٔ قواعد پلکانی/ثابت/درصدی. خالص و بدون DOM.
// هیچ نرخی در این فایل وجود ندارد؛ نرخ‌ها فقط از rates.js و فقط اگر status === 'verified' باشد اعمال می‌شوند.
export const ENGINE_VERSION = '1.0.0';

const ROUND = (n) => Math.round(n);

function validateTiers(tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) return false;
  let prev = -1;
  for (let i = 0; i < tiers.length; i += 1) {
    const t = tiers[i];
    const last = i === tiers.length - 1;
    if (typeof t.percent !== 'number' || !Number.isFinite(t.percent) || t.percent < 0 || t.percent > 100) return false;
    if (last ? t.upTo !== null : typeof t.upTo !== 'number' || t.upTo <= prev) return false;
    if (!last) prev = t.upTo;
  }
  return true;
}

/**
 * نرخ پلکانی.
 * mode 'whole': نرخ بازهٔ مبلغ بر کل مبلغ اعمال می‌شود.
 * mode 'incremental': هر بخش از مبلغ با نرخ همان بازه جداگانه محاسبه و جمع می‌شود.
 * قاعدهٔ شمول مرز (upTo) در این موتور: مبلغ برابر upTo در همان بازه است. قاعدهٔ رسمی باید همین را تأیید کند.
 */
export function tieredFee({ amount, tiers, mode, min = 0, max = null }) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return { ok: false, error: 'INVALID_AMOUNT' };
  if ((mode !== 'whole' && mode !== 'incremental') || !validateTiers(tiers)) return { ok: false, error: 'RULE_UNVERIFIED' };

  const steps = [];
  let raw = 0;
  if (mode === 'whole') {
    const band = tiers.find((t) => t.upTo === null || amount <= t.upTo);
    raw = ROUND((amount * band.percent) / 100);
    steps.push(`مبلغ ${amount} در بازهٔ نرخ ${band.percent}٪ است؛ نرخ بر کل مبلغ ⇒ ${raw}`);
  } else {
    let lower = 0;
    for (const t of tiers) {
      const top = t.upTo === null ? amount : Math.min(amount, t.upTo);
      if (top > lower) {
        const part = top - lower;
        const fee = ROUND((part * t.percent) / 100);
        raw += fee;
        steps.push(`بخش ${lower} تا ${top} با نرخ ${t.percent}٪ ⇒ ${fee}`);
      }
      if (t.upTo === null || amount <= t.upTo) break;
      lower = t.upTo;
    }
  }
  return finish(raw, min, max, steps);
}

function finish(raw, min, max, steps) {
  let fee = Math.max(raw, min);
  if (fee !== raw) steps.push(`اعمال کف ${min} ⇒ ${fee}`);
  if (max !== null && fee > max) {
    steps.push(`اعمال سقف ${max} ⇒ ${max}`);
    fee = max;
  }
  return { ok: true, fee, steps };
}

/** ماشین‌حساب قاعده بر اساس نوع آن. قاعدهٔ تأییدنشده هرگز محاسبه نمی‌شود. */
export function applyRule(rule, { amount }) {
  if (!rule || rule.status !== 'verified') return { ok: false, error: 'RULE_UNVERIFIED' };
  if (rule.kind === 'fixed') {
    if (typeof rule.fixedAmount !== 'number') return { ok: false, error: 'RULE_UNVERIFIED' };
    return finish(rule.fixedAmount, 0, null, [`مبلغ ثابت طبق ${rule.legal.citation} ⇒ ${rule.fixedAmount}`]);
  }
  if (rule.kind === 'tiered') {
    return tieredFee({ amount, tiers: rule.tiers, mode: rule.mode, min: rule.min ?? 0, max: rule.max ?? null });
  }
  return { ok: false, error: 'RULE_UNVERIFIED' };
}
