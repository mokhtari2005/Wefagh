// صفحه‌های رسانه: فهرست مقاله‌ها، متن مقاله، و قسمت‌های پادکست. DOM امن.
import { getJson } from './api.js';
import { messageFor } from './auth-messages.js';
import { formatShamsi } from './shamsi.js';
import { h } from './dom.js';

function shamsi(iso) {
  return formatShamsi(new Date(`${iso}T12:00:00Z`));
}

function errorBox(res) {
  return h('p', { class: 'form-status err', role: 'alert', text: messageFor(res.networkError ? 'NETWORK' : res.data?.error) });
}

export async function mediaHome() {
  const wrap = h('div', {}, [
    h('h1', { text: 'رسانه و اندیشه آکادمی' }),
    h('p', { class: 'lead', text: 'یادداشت‌ها، آموزش‌های کوتاه و پادکست‌های آکادمی و مجموعه‌های صوتی همکار.' }),
  ]);
  const [articles, episodes] = await Promise.all([getJson('/api/media/articles'), getJson('/api/media/episodes')]);

  wrap.append(h('h2', { text: 'یادداشت‌ها' }));
  if (!articles.ok) {
    wrap.append(errorBox(articles));
  } else {
    const grid = h('div', { class: 'cards' });
    for (const a of articles.data.articles) {
      grid.append(
        h('a', { class: 'card', href: `#/media/${a.slug}` }, [
          h('span', { class: 'badge', text: shamsi(a.publishedAt) }),
          h('h3', { text: a.title }),
          h('p', { text: a.summary }),
        ])
      );
    }
    wrap.append(grid);
  }

  wrap.append(
    h('h2', { text: 'پادکست‌های گروه حقوقی وفاق' }),
    h('p', { class: 'muted', text: 'فهرست قسمت‌ها و پخش مستقیم مجموعهٔ منتشرشده در Spotify.' }),
    h('div', { class: 'spotify-embed' }, [
      h('iframe', {
        title: 'پادکست‌های گروه حقوقی وفاق در Spotify',
        src: 'https://open.spotify.com/embed/show/0n717NWBhlcn6MJLBNnEbN?utm_source=generator',
        width: '100%',
        height: '352',
        frameborder: '0',
        allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
        loading: 'lazy',
        allowfullscreen: '',
      }),
    ]),
    h('p', {}, [
      h('a', {
        href: 'https://open.spotify.com/show/0n717NWBhlcn6MJLBNnEbN',
        target: '_blank',
        rel: 'noopener noreferrer',
        text: 'مشاهدهٔ همهٔ قسمت‌ها در Spotify',
      }),
    ]),
    h('h2', { text: 'قسمت‌های ثبت‌شده در آکادمی' })
  );
  if (!episodes.ok) {
    wrap.append(errorBox(episodes));
  } else {
    for (const ep of episodes.data.episodes) {
      wrap.append(episodeCard(ep));
    }
  }
  return wrap;
}

function episodeCard(ep) {
  const body = [
    h('h3', { text: ep.title }),
    h('p', { class: 'muted', text: `${shamsi(ep.publishedAt)}${ep.durationMinutes ? ` · ${ep.durationMinutes} دقیقه` : ''}` }),
    h('p', { text: ep.description }),
  ];
  if (ep.audioUrl) {
    body.push(h('audio', { controls: '', preload: 'none', src: ep.audioUrl, class: 'player' }));
  } else {
    body.push(h('div', { class: 'notice', role: 'note', text: 'فایل صوتی این قسمت هنوز منتشر نشده است.' }));
  }
  return h('article', { class: 'lesson' }, body);
}

export async function articlePage(slug) {
  const wrap = h('div');
  const res = await getJson(`/api/media/articles/${encodeURIComponent(slug)}`);
  if (!res.ok) {
    wrap.append(h('h1', { text: 'مقاله پیدا نشد' }), h('p', {}, [h('a', { href: '#/media', text: 'بازگشت به رسانه' })]));
    return wrap;
  }
  const a = res.data.article;
  wrap.append(
    h('h1', { text: a.title }),
    h('p', { class: 'muted', text: `${a.author} · ${shamsi(a.publishedAt)}` }),
    ...a.body.map((p) => h('p', { text: p })),
    h('p', {}, [h('a', { href: '#/media', text: 'بازگشت به رسانه' })])
  );
  return wrap;
}
