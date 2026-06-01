import type { JourneyContextPenaltyReason, PlannedJourney } from '@/lib/journey-planner';

import { finalWalkMeters, hasAlternativeMatching, includesAny, journeyRouteText } from './_shared';
import {
  CALDERON_GUARDIA_BOX,
  BASILICA_CARTAGO_BOX,
  destinationInBox,
  EL_ALTO_BOX,
  EL_CARMEN_QUIRCOT_BOX,
  GUADALUPE_BOX,
  LLANO_GRANDE_SCHOOL_BOX,
  LLANOS_SANTA_LUCIA_BOX,
  LOAIZA_DEST_BOX,
  LOURDES_BOX,
  LOS_MOLINOS_BOX,
  OCHOMOGO_BOX,
  PALI_TARAS_BOX,
  PARAISO_CENTRO_BOX,
  PEDREGAL_BOX,
  PARQUE_INDUSTRIAL_BOX,
  QUIRCOT_BOX,
  SAN_BLAS_BOX,
  SJ_GUADALUPE_BOX,
  SJ_PARQUE_LA_PAZ_BOX,
  SAN_PEDRO_OUTWARD_BOX,
  SAN_ISIDRO_TEJAR_BOX,
  TEJAR_EAST_BOX,
  TEC_CARTAGO_BOX,
  TERRAMALL_BOX,
  type GeoBox,
} from './geo-boxes';

type AlternativeMode = 'exact' | 'compatible' | 'preferred';

type CorridorPenalty = {
  reason: JourneyContextPenaltyReason;
};

type CorridorConfig = {
  box: GeoBox;
  exactHints: readonly string[];
  compatibleAlternativeHints?: readonly string[];
  preferredAlternativeHints?: readonly string[];
  excludedAlternativeHints?: readonly string[];
  nearAlternativeMaxWalkMeters: number;
  exactBonus?: CorridorPenalty & {
    requiresNearDrop?: boolean;
  };
  farDropPenalty?: CorridorPenalty & {
    alternativeMode?: AlternativeMode;
    minWalkMeters: number;
  };
  overbranchPenalty?: CorridorPenalty & {
    alternativeMode?: AlternativeMode;
    hints: readonly string[];
  };
  secondaryPenalty?: CorridorPenalty & {
    alternativeMode?: AlternativeMode;
    hints: readonly string[];
  };
  originWalkPreferencePenalty?: CorridorPenalty & {
    alternativeMode?: AlternativeMode;
    maxFinalWalkDeltaMeters: number;
    maxScoreDelta: number;
    minOriginWalkSavingsMeters: number;
  };
  nonMatchingPenalty?: CorridorPenalty;
  excludedWhenDestinationInBoxes?: readonly GeoBox[];
};

const CORRIDOR_CONFIGS: readonly CorridorConfig[] = [
  {
    box: SAN_BLAS_BOX,
    exactHints: ['CARTAGO - SAN BLAS'],
    nearAlternativeMaxWalkMeters: 600,
    exactBonus: {
      reason: {
        id: 'raptor-san-blas-local-corridor-bonus',
        label: 'Usa el corredor local de San Blas con bajada cercana.',
        penalty: -8,
      },
      requiresNearDrop: true,
    },
    farDropPenalty: {
      minWalkMeters: 800,
      reason: {
        id: 'raptor-san-blas-far-drop-when-local-available',
        label: 'Deja lejos de San Blas aunque hay una ruta local cercana.',
        penalty: 35,
      },
    },
    overbranchPenalty: {
      hints: ['EL ALTO - SAN BLAS - CARTAGO - PARQUE INDUSTRIAL', 'SAN RAFAEL DE OREAMUNO'],
      reason: {
        id: 'raptor-san-blas-return-overbranch-penalty',
        label: 'Usa una continuacion de retorno aunque hay corredor local directo a San Blas.',
        penalty: 35,
      },
    },
  },
  {
    box: SAN_PEDRO_OUTWARD_BOX,
    exactHints: ['SAN PEDRO'],
    compatibleAlternativeHints: ['SAN JOSE - SAN PEDRO'],
    nearAlternativeMaxWalkMeters: 900,
    exactBonus: {
      reason: {
        id: 'raptor-san-pedro-outward-corridor-bonus',
        label: 'Usa el corredor de San Pedro con bajada cercana.',
        penalty: -8,
      },
      requiresNearDrop: true,
    },
    farDropPenalty: {
      minWalkMeters: 1500,
      alternativeMode: 'compatible',
      reason: {
        id: 'raptor-san-pedro-outward-far-drop-penalty',
        label: 'Deja lejos de San Pedro aunque hay una alternativa cercana.',
        penalty: 35,
      },
    },
  },
  {
    box: TERRAMALL_BOX,
    exactHints: ['SAN JOSE - SAN PEDRO', 'SAN JOSE - ZAPOTE', 'CARTAGO - TRES RIOS'],
    nearAlternativeMaxWalkMeters: 450,
    secondaryPenalty: {
      hints: ['SAN JOSE-TEJAR', 'TURRIALBA', 'ITCR - SAN JOSE', 'SAN JOSE - ITCR'],
      reason: {
        id: 'raptor-terramall-tejar-secondary-penalty',
        label: 'Para Terramall hay alternativas San Pedro/Tres Rios respaldadas por Moovit.',
        penalty: 12,
      },
    },
  },
  {
    box: BASILICA_CARTAGO_BOX,
    exactHints: ['DULCE NOMBRE', 'CABALLO BLANCO'],
    compatibleAlternativeHints: ['BLANQUILLO', 'SAN RAFAEL OREAMUNO', 'TIERRA BLANCA'],
    nearAlternativeMaxWalkMeters: 450,
    originWalkPreferencePenalty: {
      alternativeMode: 'compatible',
      maxFinalWalkDeltaMeters: 80,
      maxScoreDelta: 6,
      minOriginWalkSavingsMeters: 120,
      reason: {
        id: 'raptor-basilica-farther-board-penalty',
        label: 'Hay una subida cercana equivalente hacia Basilica/Los Angeles.',
        penalty: 8,
      },
    },
  },
  {
    box: PARAISO_CENTRO_BOX,
    exactHints: ['CARTAGO - PARAISO'],
    compatibleAlternativeHints: [
      'PARAISO',
      'BIRRISITO',
      'CERVANTES',
      'SANTIAGO',
      'BAJO CERVANTES',
      'SAN FRANCISCO',
    ],
    excludedAlternativeHints: ['OROSI', 'RIO MACHO', 'TURRIALBA'],
    nearAlternativeMaxWalkMeters: 300,
    overbranchPenalty: {
      alternativeMode: 'compatible',
      hints: ['OROSI', 'RIO MACHO', 'TURRIALBA'],
      reason: {
        id: 'raptor-paraiso-local-overbranch-penalty',
        label: 'Para Paraiso hay una alternativa local cercana; la rama larga queda como respaldo.',
        penalty: 12,
      },
    },
    originWalkPreferencePenalty: {
      alternativeMode: 'compatible',
      maxFinalWalkDeltaMeters: 80,
      maxScoreDelta: 2,
      minOriginWalkSavingsMeters: 80,
      reason: {
        id: 'raptor-paraiso-farther-board-penalty',
        label: 'Hay una subida cercana equivalente hacia Paraiso.',
        penalty: 4,
      },
    },
  },
  {
    box: CALDERON_GUARDIA_BOX,
    exactHints: ['SAN JOSE - SAN PEDRO', 'CORONADO POR HOSPITAL CALDERON GUARDIA'],
    compatibleAlternativeHints: ['SAN JOSE - ZAPOTE', 'BARRIO ESCALANTE', 'GUADALUPE'],
    nearAlternativeMaxWalkMeters: 300,
    exactBonus: {
      reason: {
        id: 'raptor-calderon-guardia-corridor-bonus',
        label: 'Usa una bajada cercana para Calderon Guardia.',
        penalty: -8,
      },
      requiresNearDrop: true,
    },
    farDropPenalty: {
      minWalkMeters: 900,
      alternativeMode: 'compatible',
      reason: {
        id: 'raptor-calderon-guardia-far-drop-penalty',
        label: 'Deja lejos de Calderon Guardia aunque hay una bajada cercana.',
        penalty: 25,
      },
    },
  },
  {
    box: SJ_PARQUE_LA_PAZ_BOX,
    exactHints: ['MONTE AZUL', 'SEMINARIO', 'PASO ANCHO', 'LOMA LINDA', 'MADEIRAS'],
    nearAlternativeMaxWalkMeters: 350,
    exactBonus: {
      reason: {
        id: 'raptor-sj-parque-la-paz-corridor-bonus',
        label: 'Usa el conector de Paso Ancho/Seminario con bajada cercana a Parque La Paz.',
        penalty: -8,
      },
      requiresNearDrop: true,
    },
    farDropPenalty: {
      minWalkMeters: 1000,
      reason: {
        id: 'raptor-sj-parque-la-paz-far-drop-penalty',
        label: 'Deja lejos de Parque La Paz aunque hay conector local cercano.',
        penalty: 45,
      },
    },
  },
  {
    box: SJ_GUADALUPE_BOX,
    exactHints: ['SAN JOSE - GUADALUPE', 'GUADALUPE - BARRIO PILAR', 'BARRIO PILAR'],
    compatibleAlternativeHints: ['SAN JOSE - MORAVIA'],
    nearAlternativeMaxWalkMeters: 250,
    exactBonus: {
      reason: {
        id: 'raptor-sj-guadalupe-corridor-bonus',
        label: 'Usa el conector San Jose-Guadalupe con bajada cercana.',
        penalty: -8,
      },
      requiresNearDrop: true,
    },
    farDropPenalty: {
      minWalkMeters: 1000,
      alternativeMode: 'compatible',
      reason: {
        id: 'raptor-sj-guadalupe-far-drop-penalty',
        label: 'Deja lejos de Guadalupe aunque hay conector local cercano.',
        penalty: 65,
      },
    },
    secondaryPenalty: {
      hints: ['SAN JOSE - MORAVIA'],
      reason: {
        id: 'raptor-sj-guadalupe-moravia-secondary-penalty',
        label: 'Usa Moravia como aproximacion aunque Barrio Pilar deja mas cerca de Guadalupe.',
        penalty: 12,
      },
    },
  },
  {
    box: GUADALUPE_BOX,
    exactHints: ['CARTAGO - GUADALUPE'],
    nearAlternativeMaxWalkMeters: 250,
    exactBonus: {
      reason: {
        id: 'raptor-guadalupe-local-corridor-bonus',
        label: 'Usa el corredor local de Guadalupe con bajada cercana.',
        penalty: -8,
      },
      requiresNearDrop: true,
    },
    overbranchPenalty: {
      hints: ['SAN BLAS', 'LA ESTRELLA'],
      reason: {
        id: 'raptor-guadalupe-adjacent-overbranch-penalty',
        label: 'Usa una rama vecina aunque hay corredor directo a Guadalupe.',
        penalty: 35,
      },
    },
  },
  {
    box: OCHOMOGO_BOX,
    exactHints: [
      'OCHOMOGO',
      'SAN JOSE - SAN PEDRO',
      'SAN JOSE - ZAPOTE',
      'CARTAGO - TRES RIOS',
      'CARTAGO-ICE',
      'CARTAGO - ICE',
    ],
    nearAlternativeMaxWalkMeters: 350,
    exactBonus: {
      reason: {
        id: 'raptor-ochomogo-corridor-bonus',
        label: 'Usa un corredor Moovit-backed de Ochomogo con bajada cercana.',
        penalty: -8,
      },
      requiresNearDrop: true,
    },
    nonMatchingPenalty: {
      reason: {
        id: 'raptor-ochomogo-nonmatching-penalty',
        label: 'Usa una ruta vecina aunque hay corredor cercano hacia Ochomogo.',
        penalty: 35,
      },
    },
  },
  {
    box: LOS_MOLINOS_BOX,
    exactHints: ['RESIDENCIAL LOS MOLINOS'],
    nearAlternativeMaxWalkMeters: 250,
    exactBonus: {
      reason: {
        id: 'raptor-los-molinos-local-corridor-bonus',
        label: 'Usa el corredor local de Residencial Los Molinos.',
        penalty: -8,
      },
      requiresNearDrop: true,
    },
    overbranchPenalty: {
      hints: ['SAN ISIDRO - EL MOLINO'],
      reason: {
        id: 'raptor-los-molinos-adjacent-overbranch-penalty',
        label: 'No confunde San Isidro-El Molino con Residencial Los Molinos.',
        penalty: 35,
      },
    },
  },
  {
    box: TEC_CARTAGO_BOX,
    exactHints: ['SAN JOSE - ITCR', 'ITCR - SAN JOSE'],
    nearAlternativeMaxWalkMeters: 300,
    exactBonus: {
      reason: {
        id: 'raptor-tec-itcr-campus-bonus',
        label: 'Usa la bajada ITCR cercana al campus TEC.',
        penalty: -8,
      },
      requiresNearDrop: true,
    },
    farDropPenalty: {
      minWalkMeters: 700,
      reason: {
        id: 'raptor-tec-itcr-far-drop-penalty',
        label: 'Deja lejos del TEC aunque hay bajada ITCR cercana.',
        penalty: 55,
      },
    },
    originWalkPreferencePenalty: {
      maxFinalWalkDeltaMeters: 80,
      maxScoreDelta: 12,
      minOriginWalkSavingsMeters: 500,
      reason: {
        id: 'raptor-tec-itcr-farther-board-penalty',
        label: 'Hay una subida cercana equivalente hacia el TEC.',
        penalty: 12,
      },
    },
  },
  {
    box: SAN_ISIDRO_TEJAR_BOX,
    exactHints: ['SAN ISIDRO', 'HIGUITO', 'GUATUSO', 'EL MOLINO'],
    nearAlternativeMaxWalkMeters: 250,
    exactBonus: {
      reason: {
        id: 'raptor-san-isidro-tejar-corridor-bonus',
        label: 'Usa el corredor San Isidro/El Guarco con bajada cercana.',
        penalty: -8,
      },
      requiresNearDrop: true,
    },
    overbranchPenalty: {
      hints: ['SAN RAFAEL DE OREAMUNO', 'EL ALTO', 'SAN BLAS', 'PARQUE INDUSTRIAL'],
      reason: {
        id: 'raptor-san-isidro-tejar-adjacent-overbranch-penalty',
        label: 'Usa una rama vecina aunque hay corredor directo a San Isidro.',
        penalty: 55,
      },
    },
  },
  {
    box: TEJAR_EAST_BOX,
    exactHints: ['SAN ISIDRO', 'EL MOLINO'],
    nearAlternativeMaxWalkMeters: 300,
    exactBonus: {
      reason: {
        id: 'raptor-tejar-east-corridor-bonus',
        label: 'Usa el corredor San Isidro/Tejar hacia Tejar este.',
        penalty: -8,
      },
      requiresNearDrop: true,
    },
    overbranchPenalty: {
      hints: ['SAN RAFAEL DE OREAMUNO', 'PARQUE INDUSTRIAL', 'SANTA ELENA ABAJO', 'LA CAMPINA'],
      reason: {
        id: 'raptor-tejar-east-overbranch-penalty',
        label: 'Usa una rama vecina aunque hay corredor directo a Tejar este.',
        penalty: 35,
      },
    },
  },
  {
    box: PALI_TARAS_BOX,
    exactHints: ['CARTAGO - TARAS - SAN NICOLAS'],
    excludedWhenDestinationInBoxes: [QUIRCOT_BOX, PEDREGAL_BOX, EL_CARMEN_QUIRCOT_BOX],
    nearAlternativeMaxWalkMeters: 200,
    exactBonus: {
      reason: {
        id: 'raptor-taras-san-nicolas-local-bonus',
        label: 'Usa el bus local Cartago-Taras-San Nicolas hacia Taras.',
        penalty: -10,
      },
    },
    secondaryPenalty: {
      hints: ['CARTAGO - TARAS - OCHOMOGO'],
      reason: {
        id: 'raptor-pali-taras-secondary-taras-route-penalty',
        label: 'Usa otra variante de Taras aunque San Nicolas es la opcion directa.',
        penalty: 18,
      },
    },
    originWalkPreferencePenalty: {
      maxFinalWalkDeltaMeters: 80,
      maxScoreDelta: 4,
      minOriginWalkSavingsMeters: 80,
      reason: {
        id: 'raptor-pali-taras-farther-board-penalty',
        label: 'Hay una subida cercana equivalente en la misma ruta local.',
        penalty: 5,
      },
    },
    nonMatchingPenalty: {
      reason: {
        id: 'raptor-pali-taras-non-taras-route-penalty',
        label: 'Usa una ruta local vecina aunque existe Cartago-Taras-San Nicolas.',
        penalty: 35,
      },
    },
  },
  {
    box: QUIRCOT_BOX,
    exactHints: ['QUIRCOT'],
    nearAlternativeMaxWalkMeters: 250,
    exactBonus: {
      reason: {
        id: 'raptor-quircot-corridor-bonus',
        label: 'Usa el corredor local de Quircot con bajada cercana.',
        penalty: -8,
      },
      requiresNearDrop: true,
    },
    farDropPenalty: {
      minWalkMeters: 500,
      reason: {
        id: 'raptor-quircot-far-drop-penalty',
        label: 'Deja lejos de Quircot aunque hay una bajada local cercana.',
        penalty: 35,
      },
    },
    nonMatchingPenalty: {
      reason: {
        id: 'raptor-quircot-nonmatching-penalty',
        label: 'Usa una ruta de paso aunque hay corredor local de Quircot cercano.',
        penalty: 35,
      },
    },
  },
  {
    box: PEDREGAL_BOX,
    exactHints: ['PEDREGAL', 'LOYOLA'],
    compatibleAlternativeHints: ['EL CARMEN', 'QUIRCOT'],
    nearAlternativeMaxWalkMeters: 250,
    exactBonus: {
      reason: {
        id: 'raptor-pedregal-corridor-bonus',
        label: 'Usa el corredor Pedregal/Loyola con bajada cercana.',
        penalty: -8,
      },
      requiresNearDrop: true,
    },
    farDropPenalty: {
      alternativeMode: 'compatible',
      minWalkMeters: 650,
      reason: {
        id: 'raptor-pedregal-far-drop-penalty',
        label: 'Deja lejos de Pedregal aunque hay una bajada local cercana.',
        penalty: 35,
      },
    },
    nonMatchingPenalty: {
      reason: {
        id: 'raptor-pedregal-nonmatching-penalty',
        label: 'Usa una ruta de paso aunque hay corredor Pedregal/Quircot cercano.',
        penalty: 35,
      },
    },
  },
  {
    box: EL_CARMEN_QUIRCOT_BOX,
    exactHints: ['EL CARMEN', 'QUIRCOT'],
    compatibleAlternativeHints: ['TARAS', 'SAN NICOLAS'],
    nearAlternativeMaxWalkMeters: 350,
    exactBonus: {
      reason: {
        id: 'raptor-el-carmen-quircot-corridor-bonus',
        label: 'Usa el corredor El Carmen/Quircot con bajada cercana.',
        penalty: -8,
      },
      requiresNearDrop: true,
    },
    farDropPenalty: {
      alternativeMode: 'compatible',
      minWalkMeters: 500,
      reason: {
        id: 'raptor-el-carmen-quircot-far-drop-penalty',
        label: 'Deja lejos de El Carmen aunque hay una bajada local cercana.',
        penalty: 35,
      },
    },
    nonMatchingPenalty: {
      reason: {
        id: 'raptor-el-carmen-quircot-nonmatching-penalty',
        label: 'Usa una ruta de paso aunque hay corredor El Carmen/Quircot cercano.',
        penalty: 35,
      },
    },
  },
  {
    box: EL_ALTO_BOX,
    exactHints: ['EL ALTO', 'LA CRUZ'],
    compatibleAlternativeHints: ['SAN BLAS'],
    nearAlternativeMaxWalkMeters: 250,
    exactBonus: {
      reason: {
        id: 'raptor-el-alto-corridor-bonus',
        label: 'Usa el corredor El Alto/La Cruz con bajada cercana.',
        penalty: -8,
      },
      requiresNearDrop: true,
    },
    farDropPenalty: {
      alternativeMode: 'compatible',
      minWalkMeters: 650,
      reason: {
        id: 'raptor-el-alto-far-drop-penalty',
        label: 'Deja lejos de El Alto aunque hay una bajada local cercana.',
        penalty: 35,
      },
    },
    nonMatchingPenalty: {
      reason: {
        id: 'raptor-el-alto-nonmatching-penalty',
        label: 'Usa una ruta vecina aunque hay corredor El Alto/La Cruz cercano.',
        penalty: 35,
      },
    },
  },
  {
    box: LOURDES_BOX,
    exactHints: ['CARTAGO - LOURDES', 'CARTAGO - AGUA CALIENTE - LOURDES'],
    nearAlternativeMaxWalkMeters: 300,
    exactBonus: {
      reason: {
        id: 'raptor-lourdes-corridor-bonus',
        label: 'Usa el corredor directo Cartago/Lourdes con bajada cercana.',
        penalty: -8,
      },
      requiresNearDrop: true,
    },
    overbranchPenalty: {
      hints: ['EL COVAO', 'CABALLO BLANCO', 'DULCE NOMBRE', 'PIEDRA AZUL', 'BLANQUILLO'],
      reason: {
        id: 'raptor-lourdes-overbranch-penalty',
        label: 'Usa una rama vecina aunque hay corredor directo a Lourdes.',
        penalty: 35,
      },
    },
  },
  {
    box: PARQUE_INDUSTRIAL_BOX,
    exactHints: ['PARQUE INDUSTRIAL'],
    nearAlternativeMaxWalkMeters: 150,
    exactBonus: {
      reason: {
        id: 'raptor-parque-industrial-corridor-bonus',
        label: 'Usa el corredor de Parque Industrial con bajada cercana.',
        penalty: -8,
      },
      requiresNearDrop: true,
    },
    farDropPenalty: {
      minWalkMeters: 800,
      reason: {
        id: 'raptor-parque-industrial-far-drop-penalty',
        label: 'Deja lejos de Parque Industrial aunque hay una ruta con bajada cercana.',
        penalty: 70,
      },
    },
    nonMatchingPenalty: {
      reason: {
        id: 'raptor-parque-industrial-nonmatching-penalty',
        label: 'Ignora Parque Industrial aunque hay una bajada cercana en ese corredor.',
        penalty: 35,
      },
    },
  },
  {
    box: LOAIZA_DEST_BOX,
    exactHints: ['CARTAGO - LOAIZA'],
    nearAlternativeMaxWalkMeters: 250,
    exactBonus: {
      reason: {
        id: 'raptor-loaiza-corridor-bonus',
        label: 'Usa el corredor directo Cartago-Loaiza con bajada cercana.',
        penalty: -8,
      },
      requiresNearDrop: true,
    },
    overbranchPenalty: {
      hints: ['PIEDRA AZUL', 'PARAISO', 'BIRRISITO', 'TUCURRIQUE', 'EL HUMO'],
      reason: {
        id: 'raptor-loaiza-overbranch-penalty',
        label: 'Usa una rama vecina aunque hay corredor directo a Loaiza.',
        penalty: 35,
      },
    },
  },
  {
    box: LLANO_GRANDE_SCHOOL_BOX,
    exactHints: ['LLANO GRANDE'],
    compatibleAlternativeHints: ['LAS PAVAS'],
    nearAlternativeMaxWalkMeters: 300,
    exactBonus: {
      reason: {
        id: 'raptor-llano-grande-school-corridor-bonus',
        label: 'Usa Llano Grande/Las Pavas con bajada cercana a la escuela.',
        penalty: -8,
      },
      requiresNearDrop: true,
    },
    farDropPenalty: {
      alternativeMode: 'compatible',
      minWalkMeters: 650,
      reason: {
        id: 'raptor-llano-grande-school-far-drop-penalty',
        label: 'Deja lejos de Escuela Llano Grande aunque hay una bajada local cercana.',
        penalty: 35,
      },
    },
    nonMatchingPenalty: {
      reason: {
        id: 'raptor-llano-grande-school-nonmatching-penalty',
        label: 'Usa una ruta vecina aunque Llano Grande/Las Pavas deja mas cerca de la escuela.',
        penalty: 35,
      },
    },
  },
  {
    box: LLANOS_SANTA_LUCIA_BOX,
    exactHints: ['LLANOS DE SANTA LUCIA'],
    compatibleAlternativeHints: [
      'PARAISO',
      'BAJO CERVANTES',
      'SANTIAGO',
      'SAN FRANCISCO',
      'TURRIALBA',
      'JUAN VINAS',
    ],
    preferredAlternativeHints: [
      'LLANOS DE SANTA LUCIA',
      'PARAISO',
      'BAJO CERVANTES',
      'SANTIAGO',
      'SAN FRANCISCO',
      'JUAN VINAS',
    ],
    excludedAlternativeHints: ['OROSI', 'RIO MACHO'],
    nearAlternativeMaxWalkMeters: 400,
    exactBonus: {
      reason: {
        id: 'raptor-llanos-santa-lucia-exact-corridor-bonus',
        label: 'Usa la rama local de Llanos de Santa Lucia.',
        penalty: -8,
      },
    },
    overbranchPenalty: {
      alternativeMode: 'compatible',
      hints: ['OROSI', 'RIO MACHO'],
      reason: {
        id: 'raptor-llanos-santa-lucia-overbranch-penalty',
        label: 'Para Llanos/INA hay una alternativa mas directa que Orosi/Rio Macho.',
        penalty: 12,
      },
    },
    originWalkPreferencePenalty: {
      alternativeMode: 'compatible',
      maxFinalWalkDeltaMeters: 80,
      maxScoreDelta: 1,
      minOriginWalkSavingsMeters: 80,
      reason: {
        id: 'raptor-llanos-santa-lucia-farther-board-penalty',
        label: 'Hay una subida cercana equivalente hacia Llanos/Santa Lucia.',
        penalty: 2,
      },
    },
    secondaryPenalty: {
      alternativeMode: 'preferred',
      hints: ['TURRIALBA'],
      reason: {
        id: 'raptor-llanos-santa-lucia-interurban-fallback-penalty',
        label: 'Hay una opcion local hacia Llanos/Santa Lucia; Turrialba queda como respaldo.',
        penalty: 12,
      },
    },
  },
];

function hasExactHint(routeText: string, config: CorridorConfig) {
  return includesAny(routeText, config.exactHints);
}

function hasSecondaryHint(routeText: string, config: CorridorConfig) {
  return config.secondaryPenalty ? includesAny(routeText, config.secondaryPenalty.hints) : false;
}

function isNearExactAlternative(journey: PlannedJourney, config: CorridorConfig) {
  return hasExactHint(journeyRouteText(journey), config) &&
    finalWalkMeters(journey) <= config.nearAlternativeMaxWalkMeters;
}

function isNearCompatibleAlternative(journey: PlannedJourney, config: CorridorConfig) {
  const text = journeyRouteText(journey);
  const compatibleHints = config.compatibleAlternativeHints ?? [];
  const excludedHints = config.excludedAlternativeHints ?? [];

  return (
    finalWalkMeters(journey) <= config.nearAlternativeMaxWalkMeters &&
    !includesAny(text, excludedHints) &&
    (hasExactHint(text, config) || includesAny(text, compatibleHints))
  );
}

function isNearPreferredAlternative(journey: PlannedJourney, config: CorridorConfig) {
  const text = journeyRouteText(journey);
  const preferredHints = config.preferredAlternativeHints ?? config.exactHints;
  const excludedHints = config.excludedAlternativeHints ?? [];

  return (
    finalWalkMeters(journey) <= config.nearAlternativeMaxWalkMeters &&
    !includesAny(text, excludedHints) &&
    includesAny(text, preferredHints)
  );
}

function hasNearAlternative(params: {
  journey: PlannedJourney;
  ranked: PlannedJourney[];
  config: CorridorConfig;
  mode?: AlternativeMode;
}) {
  const predicate =
    params.mode === 'preferred'
      ? (candidate: PlannedJourney) => isNearPreferredAlternative(candidate, params.config)
      : params.mode === 'compatible'
        ? (candidate: PlannedJourney) => isNearCompatibleAlternative(candidate, params.config)
        : (candidate: PlannedJourney) => isNearExactAlternative(candidate, params.config);

  return hasAlternativeMatching(params.journey, params.ranked, predicate);
}

function hasCloserOriginWalkAlternative(params: {
  journey: PlannedJourney;
  ranked: PlannedJourney[];
  config: CorridorConfig;
  preference: NonNullable<CorridorConfig['originWalkPreferencePenalty']>;
}) {
  return hasAlternativeMatching(params.journey, params.ranked, (candidate) => {
    const candidateMatches =
      params.preference.alternativeMode === 'compatible'
        ? isNearCompatibleAlternative(candidate, params.config)
        : hasExactHint(journeyRouteText(candidate), params.config);
    if (!candidateMatches) return false;
    if (
      candidate.originWalkMeters + params.preference.minOriginWalkSavingsMeters >=
      params.journey.originWalkMeters
    ) {
      return false;
    }
    if (candidate.score > params.journey.score + params.preference.maxScoreDelta) {
      return false;
    }
    if (
      finalWalkMeters(candidate) >
      finalWalkMeters(params.journey) + params.preference.maxFinalWalkDeltaMeters
    ) {
      return false;
    }

    return true;
  });
}

export function buildDestinationCorridorPreferenceReasons(params: {
  journey: PlannedJourney;
  destination: [number, number] | null;
  ranked?: PlannedJourney[];
}): JourneyContextPenaltyReason[] {
  const reasons: JourneyContextPenaltyReason[] = [];
  const ranked = params.ranked ?? [];

  for (const config of CORRIDOR_CONFIGS) {
    if (!destinationInBox(params.destination, config.box)) continue;
    if (config.excludedWhenDestinationInBoxes?.some((box) => destinationInBox(params.destination, box))) {
      continue;
    }

    const text = journeyRouteText(params.journey);
    const exact = hasExactHint(text, config);
    const secondary = hasSecondaryHint(text, config);
    const matchesOriginWalkPreference =
      config.originWalkPreferencePenalty?.alternativeMode === 'compatible'
        ? isNearCompatibleAlternative(params.journey, config)
        : exact;

    if (
      config.exactBonus &&
      exact &&
      (!config.exactBonus.requiresNearDrop ||
        finalWalkMeters(params.journey) <= config.nearAlternativeMaxWalkMeters)
    ) {
      reasons.push(config.exactBonus.reason);
    }

    if (
      config.farDropPenalty &&
      finalWalkMeters(params.journey) >= config.farDropPenalty.minWalkMeters &&
      hasNearAlternative({
        journey: params.journey,
        ranked,
        config,
        mode: config.farDropPenalty.alternativeMode,
      })
    ) {
      reasons.push(config.farDropPenalty.reason);
    }

    if (
      config.overbranchPenalty &&
      includesAny(text, config.overbranchPenalty.hints) &&
      hasNearAlternative({
        journey: params.journey,
        ranked,
        config,
        mode: config.overbranchPenalty.alternativeMode,
      })
    ) {
      reasons.push(config.overbranchPenalty.reason);
    }

    if (
      config.secondaryPenalty &&
      !exact &&
      secondary &&
      hasNearAlternative({
        journey: params.journey,
        ranked,
        config,
        mode: config.secondaryPenalty.alternativeMode,
      })
    ) {
      reasons.push(config.secondaryPenalty.reason);
    }

    if (
      config.originWalkPreferencePenalty &&
      matchesOriginWalkPreference &&
      hasCloserOriginWalkAlternative({
        journey: params.journey,
        ranked,
        config,
        preference: config.originWalkPreferencePenalty,
      })
    ) {
      reasons.push(config.originWalkPreferencePenalty.reason);
    }

    if (
      config.nonMatchingPenalty &&
      !exact &&
      !secondary &&
      hasNearAlternative({ journey: params.journey, ranked, config })
    ) {
      reasons.push(config.nonMatchingPenalty.reason);
    }
  }

  return reasons;
}
