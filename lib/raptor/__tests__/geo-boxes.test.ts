import assert from 'node:assert/strict';
import test from 'node:test';

import {
  destinationInAnyCartagoLocalBox,
  destinationInBox,
  EL_ALTO_BOX,
  EL_CARMEN_QUIRCOT_BOX,
  EL_HUMO_BOX,
  GUADALUPE_BOX,
  LA_CAMPINA_BOX,
  LLANO_GRANDE_SCHOOL_BOX,
  LLANOS_SANTA_LUCIA_BOX,
  LOURDES_BOX,
  LOS_MOLINOS_BOX,
  PALI_TARAS_BOX,
  PEDREGAL_BOX,
  PARQUE_INDUSTRIAL_BOX,
  QUIRCOT_BOX,
  SAN_PEDRO_OUTWARD_BOX,
  SANATORIO_DURAN_BOX,
  SAN_ISIDRO_TEJAR_BOX,
  TEJAR_EAST_BOX,
  TIERRA_BLANCA_LA_PASTORA_BOX,
} from '../ranking/geo-boxes';

test('destinationInAnyCartagoLocalBox detects Cartago-local destinations', () => {
  assert.equal(destinationInAnyCartagoLocalBox([-83.880095, 9.931869]), true);
  assert.equal(destinationInAnyCartagoLocalBox([-83.864618, 9.9476]), true);
  assert.equal(destinationInAnyCartagoLocalBox([-83.945, 9.84]), true);
  assert.equal(destinationInAnyCartagoLocalBox([-83.9364834537593, 9.83770228559147]), true);
  assert.equal(destinationInAnyCartagoLocalBox([-83.8829415, 9.8421571]), true);
  assert.equal(destinationInAnyCartagoLocalBox([-83.9525036531641, 9.82938521411127]), true);
  assert.equal(destinationInAnyCartagoLocalBox([-83.9385643, 9.8439289]), true);
  assert.equal(destinationInAnyCartagoLocalBox([-83.9086919704042, 9.82545597844213]), true);
  assert.equal(destinationInAnyCartagoLocalBox([-83.9244086, 9.8660225]), true);
  assert.equal(destinationInAnyCartagoLocalBox([-83.93022614, 9.85522867]), true);
  assert.equal(destinationInAnyCartagoLocalBox([-83.906791, 9.937464]), true);
  assert.equal(destinationInAnyCartagoLocalBox([-83.92947387695312, 9.888154029846191]), true);
  assert.equal(destinationInAnyCartagoLocalBox([-83.9270248413086, 9.877954483032227]), true);
  assert.equal(destinationInAnyCartagoLocalBox([-83.92220306396484, 9.873766899108887]), true);
  assert.equal(destinationInAnyCartagoLocalBox([-83.89291381835938, 9.867877006530762]), true);
});

test('destinationInAnyCartagoLocalBox rejects Cartago centro and invalid coordinates', () => {
  assert.equal(destinationInAnyCartagoLocalBox([-83.919373, 9.864429]), false);
  assert.equal(destinationInAnyCartagoLocalBox(null), false);
  assert.equal(destinationInAnyCartagoLocalBox([Number.NaN, 9.864429]), false);
  assert.equal(destinationInAnyCartagoLocalBox([-83.919373, Number.NaN]), false);
});

test('destinationInBox remains available for individual corridor checks', () => {
  assert.equal(destinationInBox([-83.880095, 9.931869], SANATORIO_DURAN_BOX), true);
  assert.equal(destinationInBox([-83.864618, 9.9476], TIERRA_BLANCA_LA_PASTORA_BOX), true);
  assert.equal(destinationInBox([-83.9364834537593, 9.83770228559147], LA_CAMPINA_BOX), true);
  assert.equal(destinationInBox([-83.8829415, 9.8421571], LLANOS_SANTA_LUCIA_BOX), true);
  assert.equal(destinationInBox([-83.906791, 9.937464], LLANO_GRANDE_SCHOOL_BOX), true);
  assert.equal(destinationInBox([-83.910782, 9.9412609], LLANO_GRANDE_SCHOOL_BOX), false);
  assert.equal(destinationInBox([-83.934149, 9.8788492], PALI_TARAS_BOX), true);
  assert.equal(destinationInBox([-83.92947387695312, 9.888154029846191], QUIRCOT_BOX), true);
  assert.equal(destinationInBox([-83.9270248413086, 9.877954483032227], QUIRCOT_BOX), false);
  assert.equal(destinationInBox([-83.9270248413086, 9.877954483032227], PEDREGAL_BOX), true);
  assert.equal(destinationInBox([-83.92947387695312, 9.888154029846191], PEDREGAL_BOX), false);
  assert.equal(destinationInBox([-83.92220306396484, 9.873766899108887], EL_CARMEN_QUIRCOT_BOX), true);
  assert.equal(destinationInBox([-83.9270248413086, 9.877954483032227], EL_CARMEN_QUIRCOT_BOX), false);
  assert.equal(destinationInBox([-83.89291381835938, 9.867877006530762], EL_ALTO_BOX), true);
  assert.equal(destinationInBox([-83.9106802132904, 9.87732094323902], EL_ALTO_BOX), false);
  assert.equal(destinationInBox([-83.9525036531641, 9.82938521411127], SAN_ISIDRO_TEJAR_BOX), true);
  assert.equal(destinationInBox([-83.9385643, 9.8439289], TEJAR_EAST_BOX), true);
  assert.equal(destinationInBox([-83.93236670000002, 9.8440063], TEJAR_EAST_BOX), true);
  assert.equal(destinationInBox([-83.9525036531641, 9.82938521411127], TEJAR_EAST_BOX), false);
  assert.equal(destinationInBox([-83.9364834537593, 9.83770228559147], TEJAR_EAST_BOX), false);
  assert.equal(destinationInBox([-83.9086919704042, 9.82545597844213], LOURDES_BOX), true);
  assert.equal(destinationInBox([-83.92, 9.88], LOURDES_BOX), false);
  assert.equal(destinationInBox([-83.9543747, 9.85659988], PARQUE_INDUSTRIAL_BOX), true);
  assert.equal(destinationInBox([-83.9385643, 9.8439289], PARQUE_INDUSTRIAL_BOX), false);
  assert.equal(destinationInBox([-83.71591776, 9.80183743], EL_HUMO_BOX), true);
  assert.equal(destinationInBox([-83.80707509, 9.82731855], EL_HUMO_BOX), false);
  assert.equal(destinationInBox([-84.0557, 9.934], SAN_PEDRO_OUTWARD_BOX), true);
  assert.equal(destinationInBox([-84.0346, 9.9148], SAN_PEDRO_OUTWARD_BOX), false);
  assert.equal(destinationInBox([-83.9244086, 9.8660225], GUADALUPE_BOX), true);
  assert.equal(destinationInBox([-83.93022614, 9.85522867], LOS_MOLINOS_BOX), true);
  assert.equal(destinationInBox([-83.919373, 9.864429], LA_CAMPINA_BOX), false);
});
