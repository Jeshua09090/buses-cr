import type { DiaTipo } from './types';

const COSTA_RICA_TIME_ZONE = 'America/Costa_Rica';
const FIXED_COSTA_RICA_HOLIDAYS = new Set([
  '01-01',
  '04-11',
  '05-01',
  '07-25',
  '08-02',
  '08-15',
  '08-31',
  '09-15',
  '12-01',
  '12-25',
]);

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value;
}

function costaRicaParts(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: COSTA_RICA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
}

function easterSundayMonthDay(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return { month, day };
}

function monthDayKey(month: number, day: number) {
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isHolyWeekHoliday(year: number, month: number, day: number) {
  const easter = easterSundayMonthDay(year);
  const easterDate = new Date(Date.UTC(year, easter.month - 1, easter.day));
  const currentDate = new Date(Date.UTC(year, month - 1, day));
  const daysBeforeEaster = Math.round((easterDate.getTime() - currentDate.getTime()) / 86_400_000);

  return daysBeforeEaster === 2 || daysBeforeEaster === 3;
}

export function isCostaRicaHoliday(date = new Date()) {
  const parts = costaRicaParts(date);
  const year = Number(partValue(parts, 'year'));
  const month = Number(partValue(parts, 'month'));
  const day = Number(partValue(parts, 'day'));
  const key = monthDayKey(month, day);

  return FIXED_COSTA_RICA_HOLIDAYS.has(key) || isHolyWeekHoliday(year, month, day);
}

export function diaTipoForDate(date = new Date()): DiaTipo {
  if (isCostaRicaHoliday(date)) {
    return 'feriado';
  }

  const weekday = partValue(costaRicaParts(date), 'weekday');

  if (weekday === 'Sat') {
    return 'sabado';
  }

  if (weekday === 'Sun') {
    return 'domingo';
  }

  return 'habil';
}

export function minutesSinceMidnightCostaRica(date = new Date()) {
  const parts = costaRicaParts(date);
  const hour = Number(partValue(parts, 'hour') ?? 0);
  const minute = Number(partValue(parts, 'minute') ?? 0);

  return hour * 60 + minute;
}
