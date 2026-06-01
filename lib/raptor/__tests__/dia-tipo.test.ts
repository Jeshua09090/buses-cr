import assert from 'node:assert/strict';
import test from 'node:test';

import { diaTipoForDate, isCostaRicaHoliday, minutesSinceMidnightCostaRica } from '../dia-tipo';

test('diaTipoForDate uses Costa Rica local weekday', () => {
  assert.equal(diaTipoForDate(new Date('2026-05-09T18:00:00.000Z')), 'sabado');
  assert.equal(diaTipoForDate(new Date('2026-05-10T18:00:00.000Z')), 'domingo');
  assert.equal(diaTipoForDate(new Date('2026-05-11T18:00:00.000Z')), 'habil');
});

test('minutesSinceMidnightCostaRica uses UTC-6 local time', () => {
  assert.equal(minutesSinceMidnightCostaRica(new Date('2026-05-11T15:30:00.000Z')), 570);
});

test('diaTipoForDate treats Costa Rica public holidays as feriado', () => {
  assert.equal(diaTipoForDate(new Date('2026-05-01T18:00:00.000Z')), 'feriado');
  assert.equal(diaTipoForDate(new Date('2026-12-25T18:00:00.000Z')), 'feriado');
});

test('isCostaRicaHoliday includes Holy Thursday and Good Friday', () => {
  assert.equal(isCostaRicaHoliday(new Date('2026-04-02T18:00:00.000Z')), true);
  assert.equal(isCostaRicaHoliday(new Date('2026-04-03T18:00:00.000Z')), true);
  assert.equal(isCostaRicaHoliday(new Date('2026-04-04T18:00:00.000Z')), false);
});
