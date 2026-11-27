import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync(new URL('../site/js/dashboard.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../site/js/app.js', import.meta.url), 'utf8');
const nav = readFileSync(new URL('../site/js/pages.js', import.meta.url), 'utf8');

test('پرونده مهارت‌آموزی فقط از شواهد واقعی داشبورد استفاده می‌کند', () => {
  assert.match(dashboard, /function learningProfile\(data\)/u);
  assert.match(dashboard, /completedLessonCount/u);
  assert.match(dashboard, /mootSessionCount/u);
  assert.match(dashboard, /averageScore/u);
  assert.match(dashboard, /نمره صلاحیت حرفه‌ای یا گواهی رسمی محسوب نمی‌شود/u);
  assert.match(dashboard, /learningProfile\(data\)/u);
});

test('مسیر کارگاه‌ها از ناوبری اصلی و مسیریاب قابل دسترسی است', () => {
  assert.match(app, /\/academy\/workshops/u);
  assert.match(app, /workshopsPage/u);
  assert.match(nav, /کارگاه‌های آموزشی/u);
});
