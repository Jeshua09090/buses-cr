import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPgRoutePatterns } from '../src/read-postgres.ts';

describe('read-postgres helpers', () => {
  it('uses route family names from joined rutas rows when pg returns bigint ids as strings', () => {
    const [pattern] = buildPgRoutePatterns([
      {
        id: '757',
        ruta_id: '4695',
        nombre: 'CARTAGO- ICE / IDA',
        nombre_ruta: 'CARTAGO-ICE',
        pattern_code: 'legacy-ida-8aac2ecb9353',
        categoria_operativa: 'interurbana',
        activo: true,
      },
    ]);

    assert.equal(pattern?.pattern_id, 757);
    assert.equal(pattern?.ruta_id, 4695);
    assert.equal(pattern?.route_name, 'CARTAGO-ICE');
    assert.equal(pattern?.pattern_name, 'CARTAGO- ICE / IDA');
  });
});
