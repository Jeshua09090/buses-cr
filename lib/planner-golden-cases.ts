import type { PlannedJourney } from '@/lib/journey-planner';
import { formatRouteDisplayName } from '@/lib/route-display';

export type PlannerGoldenCaseExpectation = {
  expectedWinners: string[];
  acceptableAlternatives: string[];
  shouldNeverWin: string[];
  expectedBoardStops?: string[];
  shouldNeverBoardStops?: string[];
  expectedFinalStops?: string[];
  shouldNeverFinalStops?: string[];
};

export type PlannerGoldenCaseGroupId =
  | 'core-national'
  | 'cartago-tejar'
  | 'cartago-guadalupe'
  | 'cartago-campina'
  | 'cartago-east'
  | 'cartago-irazu'
  | 'cartago-southeast'
  | 'cartago-local'
  | 'cartago-outward';

export type PlannerGoldenCaseDirection = 'ida' | 'vuelta' | 'circular' | 'local';

export type PlannerGoldenCase = {
  id: string;
  name: string;
  groupId: PlannerGoldenCaseGroupId;
  groupLabel: string;
  direction: PlannerGoldenCaseDirection;
  originLabel: string;
  originCoordinates: [number, number];
  destinationQuery: string;
  destinationLabel?: string;
  destinationCoordinates?: [number, number];
  expectation: PlannerGoldenCaseExpectation;
  notes?: string;
};

export type PlannerGoldenCaseStatus = 'pass' | 'acceptable' | 'unexpected' | 'forbidden' | 'empty';

export type PlannerGoldenCaseEvaluation = {
  status: PlannerGoldenCaseStatus;
  winnerTitle: string | null;
  boardStopTitle: string | null;
  finalStopTitle: string | null;
  matchingRule: string | null;
  topTitles: string[];
};

export type PlannerGoldenCaseGroup = {
  id: PlannerGoldenCaseGroupId;
  label: string;
  cases: PlannerGoldenCase[];
};

function normalizeText(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function matchesRule(title: string, rule: string) {
  const normalizedTitle = normalizeText(title);
  const normalizedRule = normalizeText(rule);
  if (!normalizedTitle || !normalizedRule) return false;
  return (
    normalizedTitle === normalizedRule ||
    normalizedTitle.includes(normalizedRule) ||
    normalizedRule.includes(normalizedTitle)
  );
}

export function buildGoldenCaseJourneyTitle(journey: PlannedJourney) {
  const labels = journey.legs
    .map((leg) => leg.routeName?.trim() || leg.routeCode?.trim() || null)
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(labels.map((value) => formatRouteDisplayName(value)))).join(' luego ');
}

export function buildGoldenCaseBoardStopTitle(journey: PlannedJourney) {
  const firstLeg = journey.legs[0];
  return firstLeg?.boardStopName?.trim() || firstLeg?.boardStop?.nombre?.trim() || null;
}

export function buildGoldenCaseFinalStopTitle(journey: PlannedJourney) {
  const finalLeg = journey.legs[journey.legs.length - 1];
  return finalLeg?.alightStopName?.trim() || finalLeg?.alightStop?.nombre?.trim() || null;
}

function appendStopRules(routeRule: string, boardRule?: string, finalRule?: string) {
  const stopRules = [
    boardRule ? `Subida: ${boardRule}` : null,
    finalRule ? `Bajada: ${finalRule}` : null,
  ].filter(Boolean);

  if (stopRules.length === 0) return routeRule;
  return `${routeRule} @ ${stopRules.join(' / ')}`;
}

export function evaluatePlannerGoldenCase(
  goldenCase: PlannerGoldenCase,
  journeys: PlannedJourney[],
): PlannerGoldenCaseEvaluation {
  if (journeys.length === 0) {
    return {
      status: 'empty',
      winnerTitle: null,
      boardStopTitle: null,
      finalStopTitle: null,
      matchingRule: null,
      topTitles: [],
    };
  }

  const topTitles = journeys.slice(0, 3).map((journey) => buildGoldenCaseJourneyTitle(journey));
  const winnerTitle = topTitles[0] ?? null;
  const boardStopTitle = buildGoldenCaseBoardStopTitle(journeys[0]);
  const finalStopTitle = buildGoldenCaseFinalStopTitle(journeys[0]);

  if (!winnerTitle) {
    return {
      status: 'empty',
      winnerTitle: null,
      boardStopTitle,
      finalStopTitle,
      matchingRule: null,
      topTitles,
    };
  }

  const forbiddenRule = goldenCase.expectation.shouldNeverWin.find((rule) => matchesRule(winnerTitle, rule));
  if (forbiddenRule) {
    return {
      status: 'forbidden',
      winnerTitle,
      boardStopTitle,
      finalStopTitle,
      matchingRule: forbiddenRule,
      topTitles,
    };
  }

  const forbiddenBoardStopRule = goldenCase.expectation.shouldNeverBoardStops?.find(
    (rule) => boardStopTitle && matchesRule(boardStopTitle, rule),
  );
  if (forbiddenBoardStopRule) {
    return {
      status: 'forbidden',
      winnerTitle,
      boardStopTitle,
      finalStopTitle,
      matchingRule: `Subida prohibida: ${forbiddenBoardStopRule}`,
      topTitles,
    };
  }

  const forbiddenFinalStopRule = goldenCase.expectation.shouldNeverFinalStops?.find(
    (rule) => finalStopTitle && matchesRule(finalStopTitle, rule),
  );
  if (forbiddenFinalStopRule) {
    return {
      status: 'forbidden',
      winnerTitle,
      boardStopTitle,
      finalStopTitle,
      matchingRule: `Bajada prohibida: ${forbiddenFinalStopRule}`,
      topTitles,
    };
  }

  const expectedBoardStopRule = goldenCase.expectation.expectedBoardStops?.find(
    (rule) => boardStopTitle && matchesRule(boardStopTitle, rule),
  );
  const requiresExpectedBoardStop = Boolean(goldenCase.expectation.expectedBoardStops?.length);
  const expectedFinalStopRule = goldenCase.expectation.expectedFinalStops?.find(
    (rule) => finalStopTitle && matchesRule(finalStopTitle, rule),
  );
  const requiresExpectedFinalStop = Boolean(goldenCase.expectation.expectedFinalStops?.length);
  const expectedRule = goldenCase.expectation.expectedWinners.find((rule) => matchesRule(winnerTitle, rule));
  if (expectedRule) {
    if (requiresExpectedBoardStop && !expectedBoardStopRule) {
      return {
        status: 'unexpected',
        winnerTitle,
        boardStopTitle,
        finalStopTitle,
        matchingRule: 'Subida inicial inesperada',
        topTitles,
      };
    }

    if (requiresExpectedFinalStop && !expectedFinalStopRule) {
      return {
        status: 'unexpected',
        winnerTitle,
        boardStopTitle,
        finalStopTitle,
        matchingRule: 'Bajada final inesperada',
        topTitles,
      };
    }

    return {
      status: 'pass',
      winnerTitle,
      boardStopTitle,
      finalStopTitle,
      matchingRule: appendStopRules(expectedRule, expectedBoardStopRule, expectedFinalStopRule),
      topTitles,
    };
  }

  const acceptableRule = goldenCase.expectation.acceptableAlternatives.find((rule) =>
    matchesRule(winnerTitle, rule),
  );
  if (acceptableRule) {
    return {
      status: 'acceptable',
      winnerTitle,
      boardStopTitle,
      finalStopTitle,
      matchingRule: acceptableRule,
      topTitles,
    };
  }

  return {
    status: 'unexpected',
    winnerTitle,
    boardStopTitle,
    finalStopTitle,
    matchingRule: null,
    topTitles,
  };
}

export const plannerGoldenCases: PlannerGoldenCase[] = [
  {
    id: 'taras-las-vegas',
    name: 'Taras -> Restaurante Las Vegas',
    groupId: 'cartago-tejar',
    groupLabel: 'Cartago / Tejar',
    direction: 'ida',
    originLabel: 'Taras / casa del usuario',
    originCoordinates: [-83.9389683, 9.87829],
    destinationQuery: '9.843929,-83.938564',
    destinationLabel: 'Restaurante Las Vegas',
    destinationCoordinates: [-83.9385643, 9.8439289],
    expectation: {
      expectedWinners: ['Cartago - Taras - San Nicolas luego Cartago-San Isidro - El Molino'],
      acceptableAlternatives: [
        'Cartago - Taras - San Nicolas luego Cartago-Asuncion-Pitahaya-San Isidro',
        'Cartago - Guadalupe',
        'Cartago - Guayabal - La Campina Por Asuncion',
        'Cartago - Taras - San Nicolas luego Santa Elena Abajo - Cartago Por Parque Industrial',
      ],
      shouldNeverWin: [
        'San Jose-Tejar',
        'San Jose-Tejar luego Cartago-San Isidro - El Molino',
        'San Jose-Tejar luego Cartago-Asuncion-Pitahaya-San Isidro',
      ],
    },
    notes:
      'Transit-facing version of Las Vegas using the south side of Parque de Tejar address to reduce POI ambiguity. Santa Elena/Parque Industrial is acceptable when its seeded sequence runs Cartago -> Tejar and drops near the destination. 2026-05-15: exact-origin Moovit retest from [-83.9389683, 9.87829] confirms Taras/San Nicolas feeder plus CARTAGO - SAN ISIDRO DE TEJAR. 2026-05-16: FU6a found the strict San Isidro transfer is still not exposed by Minotor bestRoute even though Taras and Tejar candidates exist; the Taras->Tejar feeder rule only demotes long-walk adjacent direct branches when a viable Taras/San Nicolas feeder is already present, so the case is ACCEPTABLE via Santa Elena/Parque Industrial while the strict San Isidro transfer remains runtime/snapshot debt.',
  },
  {
    id: 'taras-bar-el-gallito',
    name: 'Taras -> Bar El Gallito',
    groupId: 'cartago-tejar',
    groupLabel: 'Cartago / Tejar',
    direction: 'ida',
    originLabel: 'Taras / casa del usuario',
    originCoordinates: [-83.9389683, 9.87829],
    destinationQuery: '9.830049,-83.952985',
    destinationLabel: 'Bar El Gallito',
    destinationCoordinates: [-83.9529845, 9.8300491],
    expectation: {
      expectedWinners: ['Cartago - Taras - San Nicolas luego Cartago-San Isidro - El Molino'],
      acceptableAlternatives: ['Cartago - Taras - San Nicolas luego Cartago-Asuncion-Pitahaya-San Isidro'],
      shouldNeverWin: ['San Jose-Tejar'],
    },
    notes: 'Good regression case for destination hub resolution and local transfer quality.',
  },
  {
    id: 'taras-plaza-san-isidro',
    name: 'Taras -> Plaza San Isidro',
    groupId: 'cartago-tejar',
    groupLabel: 'Cartago / Tejar',
    direction: 'ida',
    originLabel: 'Taras / casa del usuario',
    originCoordinates: [-83.9389683, 9.87829],
    destinationQuery: 'Plaza San Isidro, Tejar',
    destinationLabel: 'Plaza San Isidro',
    destinationCoordinates: [-83.9525036531641, 9.82938521411127],
    expectation: {
      expectedWinners: [
        'Cartago - Taras - San Nicolas luego Cartago-San Isidro - El Molino',
        'Cartago - Taras - San Nicolas luego Cartago-Asuncion-Pitahaya-San Isidro',
      ],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar'],
    },
  },
  {
    id: 'taras-pali-taras',
    name: 'Taras -> Pali Taras',
    groupId: 'cartago-local',
    groupLabel: 'Cartago / Urbano norte',
    direction: 'local',
    originLabel: 'Taras / casa del usuario',
    originCoordinates: [-83.9389683, 9.87829],
    destinationQuery: 'Pali Taras',
    destinationLabel: 'Pali Taras',
    destinationCoordinates: [-83.934149, 9.8788492],
    expectation: {
      expectedWinners: ['Cartago - Taras - San Nicolas'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'San Jose - San Pedro'],
      expectedBoardStops: [
        'Diagonal A La Casa De Los Patos',
        'Diagonal A Pulperia La Nueva',
      ],
      expectedFinalStops: ['Frente A Pali'],
      shouldNeverFinalStops: ['Diagonal A La Casa De Los Patos'],
    },
    notes:
      'Protege busqueda generica de Pali cerca de Taras: debe bajar junto al Pali, no antes de Casa de los Patos. 2026-05-22: la busqueda Range RAPTOR acotada conserva la opcion de esperar en Casa de los Patos; Linda Vista ya no es una subida aceptable para este caso oro.',
  },
  {
    id: 'taras-paseo-metropoli',
    name: 'Taras -> Paseo Metropoli / Walmart',
    groupId: 'cartago-local',
    groupLabel: 'Cartago / Urbano norte',
    direction: 'local',
    originLabel: 'Taras / casa del usuario',
    originCoordinates: [-83.9389683, 9.87829],
    destinationQuery: 'Paseo Metropoli Cartago',
    destinationLabel: 'Paseo Metropoli / Walmart',
    destinationCoordinates: [-83.9426214, 9.867107],
    expectation: {
      expectedWinners: ['Cartago - Quircot - Pedregal - Parque Industrial'],
      acceptableAlternatives: [
        'Cartago - Taras - San Nicolas luego Cartago - Tres Rios Por La Lima',
        'Cartago - Taras - San Nicolas luego San Jose - San Pedro - Pista - La Lima - Cartago',
        'Tierra Blanca - Cot - Parque Industrial',
      ],
      shouldNeverWin: [
        'Cartago - La Lima',
        'San Jose - San Pedro - Tres Rios - La Lima - Cartago',
        'San Jose - Zapote - Tres Rios - La Lima - Cartago',
      ],
      expectedBoardStops: [
        'Contiguo Minisuper Armonia',
        'Frente Al Restaurante Elegante',
        'Diagonal A La Casa De Los Patos',
        'Cruzando La Calle Frente Fabrica De Candelas',
      ],
      expectedFinalStops: [
        'Parada Paseo Metropoli',
        'Parada De Paseo Metropoli',
        'Entrada Parque Industrial La Lima',
      ],
    },
    notes:
      '2026-05-28 Moovit visual check from Taras to Walmart/Paseo Metropoli shows local Cartago-La Lima service near Arboleda/Armonia, but 2026-05-29 user local review rejects the tiny-hop La Lima direct from Taras because it requires a long access walk for a very short ride. Prefer the Parque Industrial-side local option or the Casa de los Patos feeder transfer; keep generic San Jose/Zapote/La Lima hops forbidden.',
  },
  {
    id: 'taras-terramall',
    name: 'Taras -> Terramall',
    groupId: 'cartago-outward',
    groupLabel: 'Cartago / Outward',
    direction: 'ida',
    originLabel: 'Taras / casa del usuario',
    originCoordinates: [-83.9389683, 9.87829],
    destinationQuery: 'Terramall',
    destinationLabel: 'Terramall',
    destinationCoordinates: [-83.9844, 9.9057],
    expectation: {
      expectedWinners: ['San Jose - San Pedro'],
      acceptableAlternatives: ['Itcr - San Jose', 'Cartago - Tres Rios Por La Lima'],
      shouldNeverWin: ['San Jose-Tejar', 'Turrialba - San Jose'],
      expectedFinalStops: ['Antes Del Puente Peatonal', 'Parada Frente Vindi Tres Rios'],
    },
    notes:
      '2026-05-27 Moovit comparison from Taras to Terramall recommends Cartago-Tres Rios plus San Jose Zapote/San Pedro-Tres Rios-La Lima; local oracle also says San Pedro goes toward Terra. 2026-05-29 local CTP 0300-P POC exposes ITCR-San Jose as a direct near-drop option from Velas y Candelas; keep it acceptable pending field check, while San Jose-Tejar and Turrialba stay secondary.',
  },
  {
    id: 'taras-basilica',
    name: 'Taras -> Basilica de Los Angeles',
    groupId: 'cartago-local',
    groupLabel: 'Cartago / Urbano norte',
    direction: 'local',
    originLabel: 'Taras / casa del usuario',
    originCoordinates: [-83.9389683, 9.87829],
    destinationQuery: 'Basilica de Los Angeles Cartago',
    destinationLabel: 'Basilica de Los Angeles',
    destinationCoordinates: [-83.9169, 9.8642],
    expectation: {
      expectedWinners: ['Cartago - Taras - San Nicolas'],
      acceptableAlternatives: [
        'Cartago - Taras - San Nicolas luego San Jose - San Pedro - Pista - Taras - Cartago',
      ],
      shouldNeverWin: ['La Angelina - Cartago', 'San Jose-Tejar', 'San Jose - Turrialba'],
      expectedBoardStops: ['Diagonal A La Casa De Los Patos'],
      expectedFinalStops: ['Parque Industrial - Cartago', 'Parada Plaza Iglesias'],
    },
    notes:
      '2026-05-29 local oracle + Moovit public Basilica page: from Taras, prefer the Taras/San Nicolas feeder toward Cartago center and walk; do not let the earlier La Angelina far-walk direct regain top rank. Moovit lists Basilica-area stops within 1-5 minutes and San Jose/San Pedro/Taras-Cartago as a nearby family, so a short near-drop transfer remains acceptable but secondary to the simpler Taras-first behavior.',
  },
  {
    id: 'taras-tec-cartago',
    name: 'Taras -> TEC Cartago',
    groupId: 'cartago-local',
    groupLabel: 'Cartago / Urbano norte',
    direction: 'local',
    originLabel: 'Taras / casa del usuario',
    originCoordinates: [-83.9389683, 9.87829],
    destinationQuery: 'TEC Cartago',
    destinationLabel: 'TEC Cartago',
    destinationCoordinates: [-83.9124243, 9.8554619],
    expectation: {
      expectedWinners: ['San Jose - ITCR'],
      acceptableAlternatives: ['Cartago - Taras - San Nicolas luego San Jose - ITCR'],
      shouldNeverWin: ['San Jose - San Pedro - Tres Rios - Taras - Cartago'],
      expectedFinalStops: ['Diagonal A Una Entrada Secundaria Del Tec'],
      shouldNeverFinalStops: ['Veterinaria El Delfin', 'Plaza Iglesias'],
    },
    notes:
      '2026-05-29 TEC POC follow-up. Moovit lists Terminal Campus Tec and the Cartago-Campus TEC student line; local CTP 0300-P ITCR data should drop within ~210m of the campus pin, not in central Cartago.',
  },
  {
    id: 'llano-grande-tec-cartago',
    name: 'Llano Grande -> TEC Cartago',
    groupId: 'cartago-local',
    groupLabel: 'Cartago / Urbano norte',
    direction: 'local',
    originLabel: 'Llano Grande centro',
    originCoordinates: [-83.910782, 9.9412609],
    destinationQuery: 'TEC Cartago',
    destinationLabel: 'TEC Cartago',
    destinationCoordinates: [-83.9124243, 9.8554619],
    expectation: {
      expectedWinners: ['Llano Grande - Cartago luego San Jose - ITCR'],
      acceptableAlternatives: [],
      shouldNeverWin: [
        'Cartago - La Angelina luego San Jose - ITCR',
        'San Jose - San Pedro - Tres Rios - Taras - Cartago',
      ],
      expectedBoardStops: ['Frente Al Minisuper La Teja', 'Frente A Agroquimicos'],
      expectedFinalStops: ['Diagonal A Una Entrada Secundaria Del Tec'],
      shouldNeverFinalStops: ['Veterinaria El Delfin', 'Plaza Iglesias'],
    },
    notes:
      'Protects the residual Llano Grande TEC watch: prefer the local Llano Grande feeder plus ITCR campus drop over a farther La Angelina boarding or a central Cartago far drop.',
  },
  {
    id: 'taras-rio-loro',
    name: 'Taras -> Parque Ambiental Rio Loro',
    groupId: 'cartago-tejar',
    groupLabel: 'Cartago / Tejar',
    direction: 'ida',
    originLabel: 'Taras / casa del usuario',
    originCoordinates: [-83.9389683, 9.87829],
    destinationQuery: '9.907525,-83.942501',
    destinationLabel: 'Parque Ambiental Rio Loro',
    destinationCoordinates: [-83.9425011, 9.9075246],
    expectation: {
      expectedWinners: [
        'San Jose - San Pedro - Pista - Taras - Cartago',
        'San Jose - San Pedro - Tres Rios - Taras - Cartago',
        'San Jose - San Pedro - Pista - La Lima - Cartago',
        'San Jose - San Pedro - Tres Rios - La Lima - Cartago',
        'San Jose - Zapote - Tres Rios - Taras - Cartago',
        'San Jose - Zapote - Tres Rios - La Lima - Cartago',
      ],
      acceptableAlternatives: [
        'Cartago - Tres Rios',
      ],
      shouldNeverWin: [
        'San Jose-Tejar',
        'Ina-San Jose-San Pedro-Pista-Taras-Cartago',
        'Cartago - Taras - San Nicolas luego Cartago-Ice',
        'Cartago - El Carmen - Quircot - Cooperrosales',
      ],
      expectedFinalStops: [
        'Entrada Angelina',
        'Antes De Trasmecum',
        'Diagonal A Soda El Trailero',
        'Parada Frente A Recope',
        'Parada De Ochomogo Frente A Recope',
      ],
      shouldNeverFinalStops: ['Diagonal A La Gasolinera Cristo Rey', 'Parada Protecto Tres Rios-Cartago'],
    },
    notes:
      'Regresion para Rio Loro: evitar ir primero hacia Cartago/Paseo Metropoli y preferir el corredor oeste con caminata real razonable.',
  },
  {
    id: 'cartago-terminal-rio-loro',
    name: 'Terminal Cartago -> Parque Ambiental Rio Loro',
    groupId: 'cartago-southeast',
    groupLabel: 'Cartago / Sureste',
    direction: 'ida',
    originLabel: 'Terminal Cartago',
    originCoordinates: [-83.923164, 9.862138],
    destinationQuery: '9.909199,-83.943462',
    destinationLabel: 'Parque Ambiental Rio Loro',
    destinationCoordinates: [-83.943462, 9.909199],
    expectation: {
      expectedWinners: [
        'Cartago-Ministerio De Salud En San Jose',
        'Cartago-Ice',
      ],
      acceptableAlternatives: [
        'San Jose - San Pedro - Pista - Taras - Cartago',
        'San Jose - San Pedro - Tres Rios - Taras - Cartago',
        'San Jose - San Pedro - Pista - La Lima - Cartago',
        'San Jose - San Pedro - Tres Rios - La Lima - Cartago',
        'San Jose - Zapote - Tres Rios - Taras - Cartago',
        'San Jose - Zapote - Tres Rios - La Lima - Cartago',
        'Cartago - Tres Rios',
        'Turrialba - San Jose Expreso',
      ],
      shouldNeverWin: [
        'San Jose-Tejar',
        'Ina-San Jose-San Pedro-Pista-Taras-Cartago',
        'Cartago - Taras - San Nicolas',
      ],
    },
    notes:
      'Desde Terminal Cartago, la caminata real puede favorecer Cartago/ICE-Ministerio; el caso Taras -> Rio Loro sigue cubriendo la familia 300 tipo Moovit.',
  },
  {
    id: 'taras-tobosi-pollos-charlie',
    name: 'Taras -> Pollos Charlie Tobosi',
    groupId: 'cartago-southeast',
    groupLabel: 'Cartago / Sureste',
    direction: 'ida',
    originLabel: 'Taras / casa del usuario',
    originCoordinates: [-83.9389683, 9.87829],
    destinationQuery: '9.83808815,-83.98318007',
    destinationLabel: 'Pollos Charlie, Tobosi',
    destinationCoordinates: [-83.98318007, 9.83808815],
    expectation: {
      expectedWinners: [
        'Cartago - Taras - San Nicolas luego Cartago - Tobosi - Quebradillas',
        'Cartago - Taras - San Nicolas luego Cartago - Tobosi - Quebradillas Por Barrancas',
      ],
      acceptableAlternatives: ['Cartago - Taras - San Nicolas luego Cartago - Tablon Por Barrancas'],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago - Coris', 'Ina-San Jose-San Pedro-Pista-Taras-Cartago'],
      expectedFinalStops: ['Entrada De Pollos Charlie', 'Pollos Charlie'],
    },
    notes:
      'Protege el caso visto en planner-lab: desde Taras debe transferir en Plaza Iglesias hacia Tobosi/Tablon, no caer al fallback Coris con caminata larga. 2026-05-15: la subida exacta queda flexible porque RAPTOR usa Parada sin nombre a 108m, pero conserva Taras/San Nicolas y baja en Pollos Charlie.',
  },
  {
    id: 'cartago-centro-guadalupe',
    name: 'Cartago centro -> Guadalupe',
    groupId: 'cartago-guadalupe',
    groupLabel: 'Cartago / Guadalupe',
    direction: 'circular',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: 'Guadalupe, Cartago',
    destinationLabel: 'Guadalupe',
    destinationCoordinates: [-83.9244086, 9.8660225],
    expectation: {
      expectedWinners: ['Cartago - Guadalupe'],
      acceptableAlternatives: [
        'Cartago-Ice',
        'Cartago - Guadalupe por La Lima',
        'Cartago - Guadalupe por La Joya',
        'El Alto - San Blas - Cartago - Parque Industrial',
        'Penas Blancas - Parque Industrial',
        'San Rafael De Oreamuno - Parque Industrial',
      ],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago-San Isidro - El Molino'],
    },
    notes:
      'This case verifies that 0332 is generated and visible, while allowing close-drop local alternatives when they clearly reduce walking. 2026-05-21: after Cartago-ICE was constrained to commute-only service, San Rafael -> Parque Industrial became acceptable because it boards near Cartago centro and drops at the exact Guadalupe stop.',
  },
  {
    id: 'cartago-centro-tejar-molino',
    name: 'Cartago centro -> Tejar por Molino',
    groupId: 'cartago-tejar',
    groupLabel: 'Cartago / Tejar',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.843929,-83.938564',
    destinationLabel: 'Restaurante Las Vegas / Tejar centro',
    destinationCoordinates: [-83.9385643, 9.8439289],
    expectation: {
      expectedWinners: ['Cartago-San Isidro - El Molino'],
      acceptableAlternatives: ['Cartago-Asuncion-Pitahaya-San Isidro'],
      shouldNeverWin: ['San Jose-Tejar'],
    },
  },
  {
    id: 'cartago-centro-tejar-asuncion',
    name: 'Cartago centro -> Tejar por Asuncion',
    groupId: 'cartago-tejar',
    groupLabel: 'Cartago / Tejar',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.844006,-83.932367',
    destinationLabel: 'Asuncion, Tejar',
    destinationCoordinates: [-83.93236670000002, 9.8440063],
    expectation: {
      expectedWinners: ['Cartago-Asuncion-Pitahaya-San Isidro'],
      acceptableAlternatives: ['Cartago-San Isidro - El Molino'],
      shouldNeverWin: ['San Jose-Tejar'],
    },
  },
  {
    id: 'cartago-terminal-nuevo-mundo',
    name: 'Terminal Cartago -> Restaurante Nuevo Mundo',
    groupId: 'cartago-southeast',
    groupLabel: 'Cartago / Sureste',
    direction: 'ida',
    originLabel: 'Terminal Cartago',
    originCoordinates: [-83.923164, 9.862138],
    destinationQuery: '9.841523,-83.947323',
    destinationLabel: 'Restaurante Nuevo Mundo',
    destinationCoordinates: [-83.947323, 9.841523],
    expectation: {
      expectedWinners: [
        'Cartago - Coris',
        'Cartago - Rio Conejo',
        'Cartago - Santa Elena Abajo',
        'Cartago - Santa Elena Abajo Por Parque Industrial',
      ],
      acceptableAlternatives: [
        'Cartago-San Isidro - El Molino',
        'Cartago-Asuncion-Pitahaya-San Isidro',
        'Santa Elena Abajo - Cartago Por Parque Industrial',
      ],
      shouldNeverWin: ['San Jose-Tejar'],
    },
    notes:
      'Moovit baseline for Nuevo Mundo points to the Coris/Santa Elena/Rio Conejo corridor; Molino/San Isidro is only a fallback if geometry makes it clearly better. 2026-05-16: preserving direct no-transfer RAPTOR candidates surfaces the inverse-labeled Santa Elena Abajo - Cartago Por Parque Industrial service to Keondas; accepted as same Santa Elena/Parque Industrial corridor, not promoted to strict PASS.',
  },
  {
    id: 'cartago-centro-tablon',
    name: 'Cartago centro -> Tablon',
    groupId: 'cartago-southeast',
    groupLabel: 'Cartago / Sureste',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.831312,-84.00739824',
    destinationLabel: 'Parada de Tablon',
    destinationCoordinates: [-84.00739824, 9.831312],
    expectation: {
      expectedWinners: ['Cartago - Tablon'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago - Loaiza', 'Cartago - Paraiso'],
    },
    notes: 'Caso de cobertura para la rama 0331-A hacia Tablon.',
  },
  {
    id: 'tablon-cartago-centro',
    name: 'Tablon -> Cartago centro',
    groupId: 'cartago-southeast',
    groupLabel: 'Cartago / Sureste',
    direction: 'vuelta',
    originLabel: 'Parada de Tablon',
    originCoordinates: [-84.00739824, 9.831312],
    destinationQuery: 'Cartago centro, Cartago',
    destinationLabel: 'Cartago centro',
    destinationCoordinates: [-83.919373, 9.864429],
    expectation: {
      expectedWinners: ['Tablon - Cartago'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'Loaiza - Cartago', 'Paraiso - Cartago'],
    },
    notes: 'Regreso de la rama 0331-A para proteger el orden Tablon->Cartago.',
  },
  {
    id: 'cartago-centro-tobosi',
    name: 'Cartago centro -> Tobosi',
    groupId: 'cartago-southeast',
    groupLabel: 'Cartago / Sureste',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.84032959,-83.98419924',
    destinationLabel: 'Tobosi',
    destinationCoordinates: [-83.98419924, 9.84032959],
    expectation: {
      expectedWinners: ['Cartago - Tobosi - Quebradillas'],
      acceptableAlternatives: ['Cartago - Tobosi - Quebradillas Por Barrancas', 'Cartago - Tablon Por Barrancas'],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago - Loaiza'],
    },
    notes: 'Caso de cobertura para la rama 0331-E hacia Tobosi/Quebradillas.',
  },
  {
    id: 'cartago-centro-tobosi-pollos-charlie',
    name: 'Cartago centro -> Pollos Charlie Tobosi',
    groupId: 'cartago-southeast',
    groupLabel: 'Cartago / Sureste',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.83808815,-83.98318007',
    destinationLabel: 'Pollos Charlie, Tobosi',
    destinationCoordinates: [-83.98318007, 9.83808815],
    expectation: {
      expectedWinners: ['Cartago - Tobosi - Quebradillas', 'Cartago - Tobosi - Quebradillas Por Barrancas'],
      acceptableAlternatives: ['Cartago - Tablon Por Barrancas', 'Cartago - Tablon'],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago - Loaiza', 'Cartago - Paraiso'],
      expectedFinalStops: ['Entrada De Pollos Charlie', 'Pollos Charlie'],
    },
    notes:
      'Moovit baseline shows this as Cartago - Tablon; in runtime data the exact Pollos Charlie stop is shared by Tobosi/Quebradillas and Tablon por Barrancas variants.',
  },
  {
    id: 'la-estrella-pollos-charlie',
    name: 'Super La Estrella -> Pollos Charlie Tobosi',
    groupId: 'cartago-southeast',
    groupLabel: 'Cartago / Sureste',
    direction: 'ida',
    originLabel: 'Super La Estrella / El Molino',
    originCoordinates: [-83.92662328, 9.86304056],
    destinationQuery: '9.83808815,-83.98318007',
    destinationLabel: 'Pollos Charlie, Tobosi',
    destinationCoordinates: [-83.98318007, 9.83808815],
    expectation: {
      expectedWinners: ['Cartago - Tobosi - Quebradillas', 'Cartago - Tobosi - Quebradillas Por Barrancas'],
      acceptableAlternatives: ['Cartago - Tablon Por Barrancas', 'Cartago - Tablon'],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago - Loaiza', 'Cartago - Paraiso'],
      expectedBoardStops: ['Super La Estrella', 'La Estrella'],
      expectedFinalStops: ['Entrada De Pollos Charlie', 'Pollos Charlie'],
    },
    notes:
      'Protege el caso visto contra Moovit: desde El Molino debe poder abordar en la parada oficial Super La Estrella, no en una parada cercana con mas caminata.',
  },
  {
    id: 'tobosi-cartago-centro',
    name: 'Tobosi -> Cartago centro',
    groupId: 'cartago-southeast',
    groupLabel: 'Cartago / Sureste',
    direction: 'vuelta',
    originLabel: 'Tobosi',
    originCoordinates: [-83.98419924, 9.84032959],
    destinationQuery: 'Cartago centro, Cartago',
    destinationLabel: 'Cartago centro',
    destinationCoordinates: [-83.919373, 9.864429],
    expectation: {
      expectedWinners: ['Quebradillas - Tobosi - Cartago'],
      acceptableAlternatives: [
        'Quebradillas Por Barrancas - Tobosi - Cartago',
        'Tablon Por Barrancas - Cartago',
        'Tablon - Cartago',
      ],
      shouldNeverWin: ['San Jose-Tejar', 'Loaiza - Cartago'],
    },
    notes:
      'Regreso de la rama 0331-E para proteger el orden Tobosi->Cartago. 2026-05-15: Tablon - Cartago se acepta como alternativa de regreso porque sirve el mismo corredor cercano a Tobosi y llega a Cartago centro sin rama prohibida.',
  },
  {
    id: 'cartago-centro-barrancas-tks',
    name: 'Cartago centro -> Barrancas / TKs',
    groupId: 'cartago-southeast',
    groupLabel: 'Cartago / Sureste',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.84411263,-83.99143741',
    destinationLabel: 'Barrancas / TKs',
    destinationCoordinates: [-83.99143741, 9.84411263],
    expectation: {
      expectedWinners: ['Cartago - Tobosi - Quebradillas Por Barrancas'],
      acceptableAlternatives: ['Cartago - Tobosi - Quebradillas', 'Cartago - Tablon Por Barrancas'],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago - Loaiza'],
    },
    notes: 'Caso de cobertura para la rama 0331-F hacia Barrancas/Quebradillas.',
  },
  {
    id: 'barrancas-tks-cartago-centro',
    name: 'Barrancas / TKs -> Cartago centro',
    groupId: 'cartago-southeast',
    groupLabel: 'Cartago / Sureste',
    direction: 'vuelta',
    originLabel: 'Barrancas / TKs',
    originCoordinates: [-83.99143741, 9.84411263],
    destinationQuery: 'Cartago centro, Cartago',
    destinationLabel: 'Cartago centro',
    destinationCoordinates: [-83.919373, 9.864429],
    expectation: {
      expectedWinners: ['Quebradillas Por Barrancas - Tobosi - Cartago'],
      acceptableAlternatives: ['Quebradillas - Tobosi - Cartago', 'Tablon Por Barrancas - Cartago'],
      shouldNeverWin: ['San Jose-Tejar', 'Loaiza - Cartago'],
    },
    notes: 'Regreso de la rama 0331-F para proteger el orden Barrancas->Cartago.',
  },
  {
    id: 'cartago-centro-la-campina',
    name: 'Cartago centro -> La Campina',
    groupId: 'cartago-campina',
    groupLabel: 'Cartago / La Campina',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.837702,-83.936483',
    destinationLabel: 'Parquecito La Campina',
    destinationCoordinates: [-83.9364834537593, 9.83770228559147],
    expectation: {
      expectedWinners: ['Cartago-Guayabal-La Campina Por Asuncion'],
      acceptableAlternatives: ['Cartago-Hacienda Vieja-Tejar-Guayabal'],
      shouldNeverWin: [
        'San Jose-Tejar',
        'Cartago-San Isidro - El Molino',
        'Cartago-Asuncion-Pitahaya-San Isidro',
      ],
    },
    notes:
      'Caso de cobertura para detectar si La Campina sigue quedando escondida al salir desde Cartago centro.',
  },
  {
    id: 'la-campina-cartago-centro',
    name: 'La Campina -> Cartago centro',
    groupId: 'cartago-campina',
    groupLabel: 'Cartago / La Campina',
    direction: 'vuelta',
    originLabel: 'Parquecito La Campina',
    originCoordinates: [-83.9364834537593, 9.83770228559147],
    destinationQuery: '9.864429,-83.919373',
    destinationLabel: 'Cartago centro',
    destinationCoordinates: [-83.919373, 9.864429],
    expectation: {
      expectedWinners: ['Cartago-Guayabal-La Campina Por Asuncion'],
      acceptableAlternatives: ['Cartago-Hacienda Vieja-Tejar-Guayabal'],
      shouldNeverWin: [
        'San Jose-Tejar',
        'Cartago-San Isidro - El Molino',
        'Cartago-Asuncion-Pitahaya-San Isidro',
      ],
    },
    notes:
      'Caso de regreso para verificar que la variante 0328-G-2 compita bien desde Campina hacia Cartago.',
  },
  {
    id: 'cartago-centro-los-molinos',
    name: 'Cartago centro -> Los Molinos',
    groupId: 'cartago-local',
    groupLabel: 'Cartago / Urbano norte',
    direction: 'local',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.855229,-83.930226',
    destinationLabel: 'Residencial Los Molinos',
    destinationCoordinates: [-83.93022614, 9.85522867],
    expectation: {
      expectedWinners: ['Cartago - Residencial Los Molinos'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago-San Isidro - El Molino'],
    },
    notes: 'Caso de cobertura para el bloque urbano norte 0321.',
  },
  {
    id: 'cartago-centro-san-blas',
    name: 'Cartago centro -> San Blas',
    groupId: 'cartago-local',
    groupLabel: 'Cartago / Urbano norte',
    direction: 'local',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.877321,-83.910680',
    destinationLabel: 'San Blas',
    destinationCoordinates: [-83.9106802132904, 9.87732094323902],
    expectation: {
      expectedWinners: ['Cartago - San Blas'],
      acceptableAlternatives: ['San Blas - Cartago', 'Cartago - San Blas - El Alto'],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago - Guadalupe'],
    },
    notes: 'Caso de cobertura para 0329-A/B hacia San Blas y El Alto.',
  },
  {
    id: 'cartago-centro-quircot-iglesia',
    name: 'Cartago centro -> Iglesia Quircot',
    groupId: 'cartago-local',
    groupLabel: 'Cartago / Urbano norte',
    direction: 'local',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.888154,-83.929474',
    destinationLabel: 'Iglesia Quircot',
    destinationCoordinates: [-83.92947387695312, 9.888154029846191],
    expectation: {
      expectedWinners: ['Cartago - El Carmen - Quircot', 'Cartago - Loyola - Pedregal - Quircot'],
      acceptableAlternatives: ['Cartago - Taras - San Nicolas'],
      shouldNeverWin: ['San Jose', 'Turrialba', 'Lourdes - El Covao'],
      expectedFinalStops: ['Despues De La Torre', 'Cruzando La Calle Frente A Iglesia Quircot', 'Despues Del Templo De Quircot'],
    },
    notes:
      'Round 9 probe. Exact Quircot church stop exposed a San Jose/Turrialba pass-through winner with 500-700m final walk; local Quircot drops are closer and should rank first.',
  },
  {
    id: 'cartago-centro-pedregal-ebais',
    name: 'Cartago centro -> EBAIS Pedregal',
    groupId: 'cartago-local',
    groupLabel: 'Cartago / Urbano norte',
    direction: 'local',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.877954,-83.927025',
    destinationLabel: 'EBAIS Pedregal',
    destinationCoordinates: [-83.9270248413086, 9.877954483032227],
    expectation: {
      expectedWinners: ['Cartago - Loyola - Pedregal - Quircot'],
      acceptableAlternatives: ['Cartago - El Carmen - Quircot'],
      shouldNeverWin: ['San Jose', 'Turrialba', 'Cartago - Taras - San Nicolas'],
      expectedFinalStops: ['Diagonal A Soda Segura', 'Entrada Los Yola', 'Frente Lubricentro Labco'],
    },
    notes:
      'Round 9 probe. Pedregal/Loyola local loop should beat interurban pass-throughs that leave 750-1200m from EBAIS Pedregal.',
  },
  {
    id: 'cartago-centro-el-carmen-minisuper',
    name: 'Cartago centro -> El Carmen minisuper',
    groupId: 'cartago-local',
    groupLabel: 'Cartago / Urbano norte',
    direction: 'local',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.873767,-83.922203',
    destinationLabel: 'El Carmen minisuper',
    destinationCoordinates: [-83.92220306396484, 9.873766899108887],
    expectation: {
      expectedWinners: ['Cartago - El Carmen - Quircot'],
      acceptableAlternatives: ['Cartago - Taras - San Nicolas'],
      shouldNeverWin: ['San Jose', 'Cartago-Ice', 'San Rafael De Oreamuno - Parque Industrial'],
      expectedFinalStops: [
        'Frente A Bar La Fortuna',
        'En La Esquina, Frente Porton Blanco',
        'Frente Escuela Julian Volio Llorente',
      ],
    },
    notes:
      'Round 9 probe. Protects close-in El Carmen from San Jose/La Lima and Parque Industrial pass-throughs with longer final walks. 2026-05-29 Quircot loop-start range fix exposes the near-exact Bar La Fortuna drop at 12m, so keep it strict-accepted.',
  },
  {
    id: 'cartago-centro-el-alto-plaza',
    name: 'Cartago centro -> El Alto plaza',
    groupId: 'cartago-local',
    groupLabel: 'Cartago / Urbano norte',
    direction: 'local',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.867877,-83.892914',
    destinationLabel: 'El Alto plaza',
    destinationCoordinates: [-83.89291381835938, 9.867877006530762],
    expectation: {
      expectedWinners: ['Cartago - La Cruz De Caravaca - El Alto'],
      acceptableAlternatives: ['Cartago - San Blas - El Alto'],
      shouldNeverWin: ['Cartago - San Rafael De Oreamuno', 'Cartago - Paraiso', 'Cartago - Barrio Maria Auxiliadora'],
      expectedFinalStops: ['Antes Del Bar La Guaria', 'Frente Bar La Guaria'],
    },
    notes:
      'Round 9 probe. Exact El Alto plaza had a near El Alto/La Cruz drop at ~125m but San Rafael won with ~1.2km final walk before the targeted preference.',
  },
  {
    id: 'cartago-centro-agua-caliente-lourdes',
    name: 'Cartago centro -> Agua Caliente / Lourdes',
    groupId: 'cartago-local',
    groupLabel: 'Cartago / Urbano norte',
    direction: 'local',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.825456,-83.908692',
    destinationLabel: 'Lourdes / Agua Caliente',
    destinationCoordinates: [-83.9086919704042, 9.82545597844213],
    expectation: {
      expectedWinners: ['Cartago - Agua Caliente - Lourdes'],
      acceptableAlternatives: ['Lourdes - Agua Caliente - Cartago'],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago-San Isidro - El Molino'],
    },
    notes: 'Caso de cobertura para 0335-A hacia Agua Caliente y Lourdes.',
  },
  {
    id: 'terminal-cartago-llano-grande',
    name: 'Terminal Cartago -> Llano Grande',
    groupId: 'cartago-local',
    groupLabel: 'Cartago / Urbano norte',
    direction: 'ida',
    originLabel: 'Terminal Cartago',
    originCoordinates: [-83.923164, 9.862138],
    destinationQuery: '9.941261,-83.910782',
    destinationLabel: 'Llano Grande',
    destinationCoordinates: [-83.910782, 9.9412609],
    expectation: {
      expectedWinners: ['Cartago - Llano Grande'],
      acceptableAlternatives: ['Cartago - Llano Grande - Las Pavas'],
      shouldNeverWin: [
        'San Jose-Tejar',
        'San Jose - Turrialba',
        'Cartago - Tierra Blanca - Potrero Cerrado - Sanatorio',
      ],
      expectedFinalStops: ['Frente A Cruz Roja', 'Parada Frente A Super Sharon', 'Frente Al Antiguo Bar Tenampa'],
    },
    notes:
      'Moovit baseline uses Cartago - Llano Grande; protects against falling back to Tierra Blanca with a multi-km final walk. 2026-05-15: Frente Al Antiguo Bar Tenampa se acepta como bajada porque es la misma familia Llano Grande y queda dentro de la zona de destino.',
  },
  {
    id: 'terminal-cartago-llano-grande-escuela',
    name: 'Terminal Cartago -> Escuela Llano Grande',
    groupId: 'cartago-local',
    groupLabel: 'Cartago / Urbano norte',
    direction: 'ida',
    originLabel: 'Terminal Cartago',
    originCoordinates: [-83.923164, 9.862138],
    destinationQuery: '9.937464,-83.906791',
    destinationLabel: 'Escuela Llano Grande',
    destinationCoordinates: [-83.906791, 9.937464],
    expectation: {
      expectedWinners: ['Cartago - Llano Grande Con Entrada A Las Pavas'],
      acceptableAlternatives: ['Cartago - Llano Grande'],
      shouldNeverWin: ['Cartago - Barrio Sagrada Familia', 'Cartago - El Carmen - Quircot - Cooperrosales'],
      expectedFinalStops: [
        'Frente A Casa De Madera',
        'Diagonal Super La Negrita',
        'Frente A Sub Delegacion Policial De Llanogrande',
        'A Un Costado De Bar Las Brisas',
        'Frente Escuela Llano Grande',
      ],
    },
    notes:
      'Round 9 exact-school probe. Runtime data has Llano Grande/Las Pavas stops at 0-335m; this protects against earlier Sagrada Familia/Quircot drops with 690-740m final walk winning on base score.',
  },
  {
    id: 'cartago-centro-paraiso',
    name: 'Cartago centro -> Paraiso',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.838231,-83.865581',
    destinationLabel: 'Parque de Paraiso',
    destinationCoordinates: [-83.865581, 9.838231],
    expectation: {
      expectedWinners: ['Cartago - Paraiso'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago-Ice', 'Cartago-Ministerio De Salud'],
    },
    notes: 'Primer caso oro del corredor 0336 hacia el este; valida que Cartago->Paraiso use la secuencia correcta.',
  },
  {
    id: 'taras-paraiso-centro',
    name: 'Taras -> Paraiso centro',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'ida',
    originLabel: 'Taras / casa del usuario',
    originCoordinates: [-83.9389683, 9.87829],
    destinationQuery: '9.8392523,-83.8664324',
    destinationLabel: 'Paraiso centro',
    destinationCoordinates: [-83.8664324, 9.8392523],
    expectation: {
      expectedWinners: [
        'Cartago - Taras - San Nicolas luego Cartago - Cachi',
        'Cartago - Taras - San Nicolas luego Cartago - Penas Blancas',
        'Cartago - Taras - San Nicolas luego Parque Industrial - Cartago - Paraiso',
        'Cartago - Taras - San Nicolas luego Cartago - Paraiso',
      ],
      acceptableAlternatives: [
        'La Angelina - Cartago luego Cartago - Paraiso',
      ],
      shouldNeverWin: ['Orosi - Rio Macho', 'San Jose - Turrialba', 'San Jose-Tejar'],
      expectedBoardStops: ['Diagonal A La Casa De Los Patos'],
    },
    notes:
      '2026-05-28 local oracle + Moovit: Paraiso from Taras should prefer the Cartago/Paraiso terminal family over Orosi/Rio Macho or Turrialba when both drop in central Paraiso. Planner Lab now preserves the Plaza Iglesias -> Capuchinos/Dulce Nombre transfer shape for the top recommendation.',
  },
  {
    id: 'taras-llanos-santa-lucia',
    name: 'Taras -> Llanos de Santa Lucia',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'ida',
    originLabel: 'Taras / casa del usuario',
    originCoordinates: [-83.9389683, 9.87829],
    destinationQuery: '9.83865394,-83.8784335',
    destinationLabel: 'Llanos de Santa Lucia / El Pollote',
    destinationCoordinates: [-83.8784335, 9.83865394],
    expectation: {
      expectedWinners: [
        'Cartago - Taras - San Nicolas luego Cartago - Llanos De Santa Lucia',
        'Cartago - Taras - San Nicolas luego Parque Industrial De Cartago - Paraiso',
        'Cartago - Taras - San Nicolas luego Parque Industrial - Cartago - Paraiso',
        'Cartago - Taras - San Nicolas luego Cartago - Paraiso',
      ],
      acceptableAlternatives: [],
      expectedBoardStops: ['Diagonal A La Casa De Los Patos'],
      shouldNeverWin: [
        'Cartago - Cachi',
        'Cartago - Penas Blancas',
        'Orosi - Rio Macho',
        'San Jose - San Pedro - Pista - Taras - Cartago',
        'San Jose - Turrialba',
      ],
    },
    notes:
      '2026-05-26 Planner Lab/Moovit check: Moovit lists Llanos served by Cartago-Llanos, Cartago-Paraiso, San Jose-Turrialba and Periferica Paraiso with 2-3 min nearby stops. Product judgment after local review: prefer local Paraiso/Llanos-compatible service over Cachi/Penas or the more expensive Turrialba interurban when both drop nearby.',
  },
  {
    id: 'taras-pali-llanos-santa-lucia',
    name: 'Taras -> Pali Llanos de Santa Lucia',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'ida',
    originLabel: 'Taras / casa del usuario',
    originCoordinates: [-83.9389683, 9.87829],
    destinationQuery: '9.8433782,-83.88357049',
    destinationLabel: 'Llanos de Santa Lucia / Pali',
    destinationCoordinates: [-83.88357049, 9.8433782],
    expectation: {
      expectedWinners: [
        'Cartago - Taras - San Nicolas luego Cartago - Llanos De Santa Lucia',
        'Cartago - Taras - San Nicolas luego Cartago - Paraiso',
        'Cartago - Taras - San Nicolas luego Parque Industrial - Cartago - Paraiso',
        'Cartago - Taras - San Nicolas luego Parque Industrial De Cartago - Paraiso',
      ],
      acceptableAlternatives: [],
      expectedBoardStops: ['Diagonal A La Casa De Los Patos'],
      expectedFinalStops: ['Contiguo Pali De Llanos De Santa Lucia'],
      shouldNeverWin: [
        'Cartago - Cachi',
        'Cartago - Penas Blancas',
        'Orosi - Rio Macho',
        'San Jose - San Pedro - Pista - Taras - Cartago',
        'San Jose - Turrialba',
      ],
    },
    notes:
      '2026-05-26 screenshot regression: the transit-facing Llanos landmark should board at Casa de los Patos and drop by Pali/Llanos, not walk downhill to Linda Vista first. 2026-05-29 local oracle + runtime fix: prefer Plaza Iglesias/Capuchinos transfer and exact Cartago - Llanos De Santa Lucia over Cachi/Penas or Cementerio shortcuts from Taras.',
  },
  {
    id: 'terminal-cartago-lankester',
    name: 'Terminal Cartago -> Jardin Botanico Lankester',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'ida',
    originLabel: 'Terminal Cartago',
    originCoordinates: [-83.923164, 9.862138],
    destinationQuery: '9.839454,-83.890202',
    destinationLabel: 'Jardin Botanico Lankester',
    destinationCoordinates: [-83.8902015, 9.8394544],
    expectation: {
      expectedWinners: ['Cartago - Laguna De Dona Ana - Obreros Y Campesinos - Los Helechos'],
      acceptableAlternatives: ['Cartago - Los Helechos - Urb. Catzi', 'Cartago - Paraiso'],
      shouldNeverWin: ['San Jose - Turrialba', 'San Jose-Tejar', 'Cartago - Turrialba'],
      expectedFinalStops: ['Motel Orquideas', 'Frente Jardin Botanico Lankester', 'Subestacion Ice Concavas'],
    },
    notes:
      'Moovit baseline uses La Laguna/Los Helechos for Lankester; catches the bad fallback where San Jose-Turrialba was used as a local Cartago bus.',
  },
  {
    id: 'paraiso-cartago-centro',
    name: 'Paraiso -> Cartago centro',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'vuelta',
    originLabel: 'Parque de Paraiso',
    originCoordinates: [-83.865581, 9.838231],
    destinationQuery: 'Cartago centro, Cartago',
    destinationLabel: 'Cartago centro',
    destinationCoordinates: [-83.919373, 9.864429],
    expectation: {
      expectedWinners: ['Paraiso - Cartago'],
      acceptableAlternatives: [
        'Cartago - Paraiso',
        'Rio Macho - Orosi - Cartago',
        'El Humo - Tucurrique - Cartago',
        'La Flor - Parque Industrial',
      ],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago-Ice', 'Cartago-Ministerio De Salud'],
    },
    notes:
      'Regreso para proteger el sentido 0336-A-2 despues de invertir 4360. 2026-05-16: preserving direct no-transfer RAPTOR candidates surfaces La Flor - Parque Industrial from Paraiso to Cartago-Orosi; accepted as a through service that reaches Cartago centro, while Paraiso - Cartago remains the strict expected winner.',
  },
  {
    id: 'cartago-centro-santiago-cervantes',
    name: 'Cartago centro -> Santiago/Cervantes',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.869528,-83.798834',
    destinationLabel: 'Santiago de Paraiso',
    destinationCoordinates: [-83.798834, 9.869528],
    expectation: {
      expectedWinners: ['Cartago - Paraiso - Birrisito - Cervantes - Santiago'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar'],
    },
    notes: 'Caso de cobertura para el tronco 0338-A hacia Birrisito, Cervantes y Santiago.',
  },
  {
    id: 'santiago-cervantes-cartago-centro',
    name: 'Santiago/Cervantes -> Cartago centro',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'vuelta',
    originLabel: 'Santiago de Paraiso',
    originCoordinates: [-83.798834, 9.869528],
    destinationQuery: 'Cartago centro, Cartago',
    destinationLabel: 'Cartago centro',
    destinationCoordinates: [-83.919373, 9.864429],
    expectation: {
      expectedWinners: ['Santiago - Cervantes - Birrisito - Paraiso - Cartago'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar'],
    },
    notes: 'Regreso del tronco 0338-A para proteger el orden Santiago->Cartago.',
  },
  {
    id: 'cartago-centro-orosi-centro',
    name: 'Cartago centro -> Orosi centro',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.797,-83.853',
    destinationLabel: 'Orosi centro',
    destinationCoordinates: [-83.853, 9.797],
    expectation: {
      expectedWinners: [
        'Cartago - Orosi - Rio Macho',
        'Parque Industrial - Cartago - Orosi - Rio Macho',
      ],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago - Paraiso - Birrisito'],
    },
    notes:
      'Moovit/manual validation: Orosi/Rio Macho is the correct family; destination-aware suppression must hide the false OROSI detour badge.',
  },
  {
    id: 'cartago-centro-rio-macho',
    name: 'Cartago centro -> Rio Macho',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.776909,-83.840835',
    destinationLabel: 'Rio Macho / plantel ICE',
    destinationCoordinates: [-83.840835, 9.776909],
    expectation: {
      expectedWinners: ['Cartago - Orosi - Rio Macho'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago - Paraiso - Birrisito'],
    },
    notes: 'Caso de cobertura para el tronco 0339-B hacia Orosi y Rio Macho.',
  },
  {
    id: 'rio-macho-cartago-centro',
    name: 'Rio Macho -> Cartago centro',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'vuelta',
    originLabel: 'Rio Macho / plantel ICE',
    originCoordinates: [-83.840835, 9.776909],
    destinationQuery: 'Cartago centro, Cartago',
    destinationLabel: 'Cartago centro',
    destinationCoordinates: [-83.919373, 9.864429],
    expectation: {
      expectedWinners: ['Rio Macho - Orosi - Cartago'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'Santiago - Cervantes'],
    },
    notes: 'Regreso del tronco 0339-B para proteger el orden Rio Macho->Cartago.',
  },
  {
    id: 'rio-macho-parque-industrial',
    name: 'Rio Macho -> Parque Industrial',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'ida',
    originLabel: 'Rio Macho / plantel ICE',
    originCoordinates: [-83.840835, 9.776909],
    destinationQuery: '9.85659988,-83.95437470',
    destinationLabel: 'Parque Industrial / Baxter',
    destinationCoordinates: [-83.9543747, 9.85659988],
    expectation: {
      expectedWinners: ['Rio Macho - Orosi - Cartago - Parque Industrial'],
      acceptableAlternatives: [
        'Purisil - Rio Macho - Orosi - Cartago luego Penas Blancas - Parque Industrial',
      ],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago - Orosi - Rio Macho'],
      expectedFinalStops: [
        'Parada Baxter',
        'Parada Frente A Parque Industrial',
        'Diagonal A La Esquina De Baxter',
      ],
    },
    notes:
      'Caso de cobertura para la rama 0339-D hacia Parque Industrial. 2026-05-15: Moovit exact coords usa CARTAGO - OROSI Y RAMALES desde Rio Macho hasta Cartago y luego CARTAGO - PARQUE INDUSTRIAL; se acepta el resultado snapshot Purisil/Rio Macho + Penas Blancas/Parque Industrial porque aborda en Rio Macho/Orosi y baja en el area Baxter/Parque Industrial, pero se mantiene fuera de PASS strict.',
  },
  {
    id: 'parque-industrial-rio-macho',
    name: 'Parque Industrial -> Rio Macho',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'vuelta',
    originLabel: 'Parque Industrial / Baxter',
    originCoordinates: [-83.9543747, 9.85659988],
    destinationQuery: '9.776909,-83.840835',
    destinationLabel: 'Rio Macho / plantel ICE',
    destinationCoordinates: [-83.840835, 9.776909],
    expectation: {
      expectedWinners: ['Parque Industrial - Cartago - Orosi - Rio Macho'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'Rio Macho - Orosi - Cartago'],
      expectedFinalStops: ['Terminal Rio Macho', 'Frente Plantel Del Ice'],
    },
    notes: 'Regreso de la rama 0339-D para proteger Parque Industrial->Rio Macho.',
  },
  {
    id: 'cartago-centro-el-humo',
    name: 'Cartago centro -> El Humo/Tucurrique',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.80183743,-83.71591776',
    destinationLabel: 'El Humo de Tucurrique',
    destinationCoordinates: [-83.71591776, 9.80183743],
    expectation: {
      expectedWinners: ['Cartago - Tucurrique - El Humo'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago - Paraiso - Birrisito', 'Cartago - Orosi'],
    },
    notes: 'Caso de cobertura para la rama 0336-M hacia Tucurrique y El Humo.',
  },
  {
    id: 'el-humo-cartago-centro',
    name: 'El Humo/Tucurrique -> Cartago centro',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'vuelta',
    originLabel: 'El Humo de Tucurrique',
    originCoordinates: [-83.71591776, 9.80183743],
    destinationQuery: 'Cartago centro, Cartago',
    destinationLabel: 'Cartago centro',
    destinationCoordinates: [-83.919373, 9.864429],
    expectation: {
      expectedWinners: ['El Humo - Tucurrique - Cartago'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'Santiago - Cervantes', 'Rio Macho - Orosi'],
    },
    notes: 'Regreso de la rama 0336-M para proteger el orden El Humo->Cartago.',
  },
  {
    id: 'cartago-centro-cachi',
    name: 'Cartago centro -> Cachi',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.82731855,-83.80707509',
    destinationLabel: 'Entrada Cachi',
    destinationCoordinates: [-83.80707509, 9.82731855],
    expectation: {
      expectedWinners: ['Cartago - Cachi'],
      acceptableAlternatives: ['Cartago - Tucurrique - El Humo'],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago - Paraiso - Birrisito', 'Cartago - Orosi'],
    },
    notes: 'Caso de cobertura para la rama 0336-J hacia Cachi.',
  },
  {
    id: 'taras-cachi',
    name: 'Taras -> Cachi',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'ida',
    originLabel: 'Taras / casa del usuario',
    originCoordinates: [-83.9389683, 9.87829],
    destinationQuery: '9.82731855,-83.80707509',
    destinationLabel: 'Entrada Cachi',
    destinationCoordinates: [-83.80707509, 9.82731855],
    expectation: {
      expectedWinners: ['Cartago - Taras - San Nicolas luego Cartago - Cachi'],
      acceptableAlternatives: [
        'Cartago - Taras - San Nicolas luego Cartago - Penas Blancas',
        'Cartago - Taras - San Nicolas luego Cartago - Loaiza',
      ],
      shouldNeverWin: [
        'San Jose - San Pedro - Pista - La Lima - Cartago',
        'San Jose - San Pedro - Tres Rios - La Lima - Cartago',
        'San Jose - Zapote - Tres Rios - La Lima - Cartago',
        'San Jose - San Pedro - Pista - Taras - Cartago',
        'San Jose - Zapote - Tres Rios - Taras - Cartago',
        'San Jose-Tejar',
      ],
      expectedFinalStops: ['Entrada Cachi'],
    },
    notes:
      'Protege que desde Taras hacia Cartago este se use el alimentador local antes de la ruta regional, no un bus nacional caro como alimentador. 2026-05-15: la subida exacta queda flexible porque RAPTOR usa Parada sin nombre a 108m, pero conserva Taras/San Nicolas y baja en Entrada Cachi.',
  },
  {
    id: 'cachi-cartago-centro',
    name: 'Cachi -> Cartago centro',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'vuelta',
    originLabel: 'Entrada Cachi',
    originCoordinates: [-83.80707509, 9.82731855],
    destinationQuery: 'Cartago centro, Cartago',
    destinationLabel: 'Cartago centro',
    destinationCoordinates: [-83.919373, 9.864429],
    expectation: {
      expectedWinners: ['Cachi - Cartago'],
      acceptableAlternatives: [
        'Penas Blancas - Parque Industrial',
        'Penas Blancas - Cartago',
        'Loaiza - Cartago',
        'El Humo - Tucurrique - Cartago',
      ],
      shouldNeverWin: ['San Jose-Tejar', 'Santiago - Cervantes', 'Rio Macho - Orosi'],
    },
    notes: 'Regreso de la rama 0336-J para proteger el orden Cachi->Cartago.',
  },
  {
    id: 'cartago-centro-la-alegria',
    name: 'Cartago centro -> La Alegria/Palomo',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.81181333,-83.84751',
    destinationLabel: 'Terminal La Alegria',
    destinationCoordinates: [-83.84751, 9.81181333],
    expectation: {
      expectedWinners: ['Cartago - Orosi - Palomo - La Alegria'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago - Paraiso', 'Cartago - Orosi - Rio Macho'],
    },
    notes: 'Caso de cobertura para la rama 0339-A hacia Palomo y La Alegria.',
  },
  {
    id: 'la-alegria-cartago-centro',
    name: 'La Alegria/Palomo -> Cartago centro',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'vuelta',
    originLabel: 'Terminal La Alegria',
    originCoordinates: [-83.84751, 9.81181333],
    destinationQuery: 'Cartago centro, Cartago',
    destinationLabel: 'Cartago centro',
    destinationCoordinates: [-83.919373, 9.864429],
    expectation: {
      expectedWinners: ['La Alegria - Palomo - Orosi - Cartago'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'Rio Macho - Orosi', 'Cachi - Cartago'],
    },
    notes: 'Regreso de la rama 0339-A para proteger el orden La Alegria->Cartago.',
  },
  {
    id: 'cartago-centro-purisil',
    name: 'Cartago centro -> Purisil',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.76069723,-83.82018281',
    destinationLabel: 'Terminal Purisil',
    destinationCoordinates: [-83.82018281, 9.76069723],
    expectation: {
      expectedWinners: ['Cartago - Orosi - Rio Macho - Purisil'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago - Orosi - Palomo', 'Cartago - Cachi'],
    },
    notes: 'Caso de cobertura para la rama 0339-C hacia Purisil.',
  },
  {
    id: 'purisil-cartago-centro',
    name: 'Purisil -> Cartago centro',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'vuelta',
    originLabel: 'Terminal Purisil',
    originCoordinates: [-83.82018281, 9.76069723],
    destinationQuery: 'Cartago centro, Cartago',
    destinationLabel: 'Cartago centro',
    destinationCoordinates: [-83.919373, 9.864429],
    expectation: {
      expectedWinners: ['Purisil - Rio Macho - Orosi - Cartago'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'La Alegria - Palomo', 'Cachi - Cartago'],
    },
    notes: 'Regreso de la rama 0339-C para proteger el orden Purisil->Cartago.',
  },
  {
    id: 'terminal-cartago-tapanti',
    name: 'Terminal Cartago -> Parque Nacional Tapanti',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'ida',
    originLabel: 'Terminal Cartago',
    originCoordinates: [-83.923164, 9.862138],
    destinationQuery: '9.76586,-83.78541',
    destinationLabel: 'Parque Nacional Tapanti',
    destinationCoordinates: [-83.78541, 9.76586],
    expectation: {
      expectedWinners: ['Cartago - Orosi - Rio Macho - Purisil'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago - Cachi', 'Cartago - Orosi - Palomo'],
      expectedFinalStops: ['Terminal Purisil', 'Frente Mini Super Purisil'],
    },
    notes:
      'Destino turistico largo: Moovit tambien lo manda por Orosi/Purisil; protege que no vuelva a quedar vacio.',
  },
  {
    id: 'cartago-centro-penas-blancas',
    name: 'Cartago centro -> Penas Blancas',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.82705109,-83.78481747',
    destinationLabel: 'Iglesia de Penas Blancas',
    destinationCoordinates: [-83.78481747, 9.82705109],
    expectation: {
      expectedWinners: ['Cartago - Penas Blancas'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago - Cachi', 'Cartago - Tucurrique'],
    },
    notes: 'Caso de cobertura para la rama 0336-L hacia Penas Blancas.',
  },
  {
    id: 'penas-blancas-cartago-centro',
    name: 'Penas Blancas -> Cartago centro',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'vuelta',
    originLabel: 'Iglesia de Penas Blancas',
    originCoordinates: [-83.78481747, 9.82705109],
    destinationQuery: 'Cartago centro, Cartago',
    destinationLabel: 'Cartago centro',
    destinationCoordinates: [-83.919373, 9.864429],
    expectation: {
      expectedWinners: ['Penas Blancas - Cartago'],
      acceptableAlternatives: ['Penas Blancas - Parque Industrial'],
      shouldNeverWin: ['San Jose-Tejar', 'Cachi - Cartago', 'El Humo - Tucurrique'],
    },
    notes:
      'Regreso de la rama 0336-L; la rama 0336-O a Parque Industrial es aceptable porque pasa por Cartago centro antes de continuar.',
  },
  {
    id: 'penas-blancas-parque-industrial',
    name: 'Penas Blancas -> Parque Industrial',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'vuelta',
    originLabel: 'Iglesia de Penas Blancas',
    originCoordinates: [-83.78481747, 9.82705109],
    destinationQuery: '9.85659988,-83.95437470',
    destinationLabel: 'Parque Industrial / Baxter',
    destinationCoordinates: [-83.9543747, 9.85659988],
    expectation: {
      expectedWinners: ['Penas Blancas - Parque Industrial'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'Penas Blancas - Cartago', 'Cartago - Penas Blancas'],
      expectedFinalStops: [
        'Parada Baxter',
        'Parada Frente A Parque Industrial',
        'Diagonal A La Esquina De Baxter',
      ],
    },
    notes:
      'Caso de cobertura para la rama 0336-O hacia Parque Industrial. 2026-05-15: Diagonal A La Esquina De Baxter se acepta como bajada porque es la misma rama Penas Blancas - Parque Industrial y queda a 83m del pin Baxter.',
  },
  {
    id: 'cartago-centro-loaiza',
    name: 'Cartago centro -> Loaiza',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.81294327,-83.82325817',
    destinationLabel: 'Iglesia Loaiza',
    destinationCoordinates: [-83.82325817, 9.81294327],
    expectation: {
      expectedWinners: ['Cartago - Loaiza'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago - Cachi', 'Cartago - Penas Blancas'],
    },
    notes: 'Caso de cobertura para la rama 0336-K hacia Loaiza.',
  },
  {
    id: 'loaiza-cartago-centro',
    name: 'Loaiza -> Cartago centro',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'vuelta',
    originLabel: 'Iglesia Loaiza',
    originCoordinates: [-83.82325817, 9.81294327],
    destinationQuery: 'Cartago centro, Cartago',
    destinationLabel: 'Cartago centro',
    destinationCoordinates: [-83.919373, 9.864429],
    expectation: {
      expectedWinners: ['Loaiza - Cartago'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'Cachi - Cartago', 'Penas Blancas - Cartago'],
    },
    notes: 'Regreso de la rama 0336-K para proteger el orden Loaiza->Cartago.',
  },
  {
    id: 'cartago-centro-piedra-azul',
    name: 'Cartago centro -> Piedra Azul',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.85913425,-83.81146341',
    destinationLabel: 'Terminal Piedra Azul',
    destinationCoordinates: [-83.81146341, 9.85913425],
    expectation: {
      expectedWinners: ['Cartago - Piedra Azul'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago - Loaiza', 'Cartago - Penas Blancas'],
    },
    notes: 'Caso de cobertura para la rama 0336-N hacia Piedra Azul.',
  },
  {
    id: 'piedra-azul-cartago-centro',
    name: 'Piedra Azul -> Cartago centro',
    groupId: 'cartago-east',
    groupLabel: 'Cartago / Este',
    direction: 'vuelta',
    originLabel: 'Terminal Piedra Azul',
    originCoordinates: [-83.81146341, 9.85913425],
    destinationQuery: 'Cartago centro, Cartago',
    destinationLabel: 'Cartago centro',
    destinationCoordinates: [-83.919373, 9.864429],
    expectation: {
      expectedWinners: ['Piedra Azul - Cartago'],
      acceptableAlternatives: [],
      shouldNeverWin: ['San Jose-Tejar', 'Loaiza - Cartago', 'Penas Blancas - Cartago'],
    },
    notes: 'Regreso de la rama 0336-N para proteger el orden Piedra Azul->Cartago.',
  },
  {
    id: 'cartago-centro-volcan-irazu',
    name: 'Cartago centro -> Volcan Irazu',
    groupId: 'cartago-irazu',
    groupLabel: 'Cartago / Irazu',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: '9.977816,-83.844871',
    destinationLabel: 'Volcan Irazu',
    destinationCoordinates: [-83.84487054, 9.9778156],
    expectation: {
      expectedWinners: ['Cartago - San Juan De Chicua - La Pastora - Volcan Irazu'],
      acceptableAlternatives: ['Cartago - Tierra Blanca - Potrero Cerrado - Sanatorio'],
      shouldNeverWin: ['San Jose-Tejar', 'San Jose - Cartago - Volcan Irazu'],
    },
    notes: 'Caso de cobertura para 0307-C hacia Volcan Irazu desde Cartago centro.',
  },
  {
    id: 'cartago-terminal-prusia-pin-oeste',
    name: 'Terminal Cartago -> Pin oeste Volcan Irazu',
    groupId: 'cartago-irazu',
    groupLabel: 'Cartago / Irazu',
    direction: 'ida',
    originLabel: 'Terminal Cartago',
    originCoordinates: [-83.923164, 9.862138],
    destinationQuery: '9.953845,-83.881259',
    destinationLabel: 'Pin oeste Volcan Irazu',
    destinationCoordinates: [-83.88125895327642, 9.953845289007294],
    expectation: {
      expectedWinners: ['Cartago - Tierra Blanca - Potrero Cerrado - Sanatorio'],
      acceptableAlternatives: [],
      shouldNeverWin: [
        'San Jose-Tejar',
        'San Jose - Cartago - Volcan Irazu',
        'Cartago - San Juan De Chicua - La Pastora - Volcan Irazu',
        'Cartago - Taras - San Nicolas luego Cartago - Tierra Blanca',
        'Cartago - Llano Grande',
      ],
    },
    notes:
      'Control para pins de Prusia/Irazu oeste: la caminata real por calle favorece Sanatorio sobre la ruta de Chicua.',
  },
  {
    id: 'cartago-terminal-sanatorio-duran',
    name: 'Terminal Cartago -> Sanatorio Duran',
    groupId: 'cartago-irazu',
    groupLabel: 'Cartago / Irazu',
    direction: 'ida',
    originLabel: 'Terminal Cartago',
    originCoordinates: [-83.923164, 9.862138],
    destinationQuery: '9.936879,-83.885614',
    destinationLabel: 'Sanatorio Duran',
    destinationCoordinates: [-83.885614, 9.936879],
    expectation: {
      expectedWinners: ['Cartago - Tierra Blanca - Potrero Cerrado - Sanatorio'],
      acceptableAlternatives: [],
      shouldNeverWin: [
        'San Jose-Tejar',
        'San Jose - Cartago - Volcan Irazu',
        'San Jose - San Pedro - Tres Rios - La Lima - Cartago',
        'San Jose - San Pedro - Tres Rios - Taras - Cartago',
        'San Jose - San Pedro - Pista - La Lima - Cartago',
        'Cartago - Taras - San Nicolas luego Cartago - Tierra Blanca',
      ],
      expectedFinalStops: ['Terminal Sanatorio De Duran'],
      shouldNeverFinalStops: ['Cruce Sanatorio'],
    },
    notes:
      'Moovit baseline reaches the Sanatorio terminal; this catches premature drops at Cruce Sanatorio.',
  },
  {
    id: 'taras-volcan-irazu',
    name: 'Taras -> Volcan Irazu',
    groupId: 'cartago-irazu',
    groupLabel: 'Cartago / Irazu',
    direction: 'ida',
    originLabel: 'Taras / casa del usuario',
    originCoordinates: [-83.9389683, 9.87829],
    destinationQuery: '9.977816,-83.844871',
    destinationLabel: 'Volcan Irazu',
    destinationCoordinates: [-83.84487054, 9.9778156],
    expectation: {
      expectedWinners: [
        'Cartago - Taras - San Nicolas luego Cartago - San Juan De Chicua - La Pastora - Volcan Irazu',
      ],
      acceptableAlternatives: ['Cartago - San Juan De Chicua - La Pastora - Volcan Irazu'],
      shouldNeverWin: ['San Jose-Tejar', 'San Jose - Cartago - Volcan Irazu'],
    },
    notes:
      'Caso largo con alimentadora 0323-B y transferencia regional controlada hacia 0307-C/Irazu.',
  },
  {
    id: 'taras-volcan-irazu-pin-oeste',
    name: 'Taras -> Pin oeste Volcan Irazu',
    groupId: 'cartago-irazu',
    groupLabel: 'Cartago / Irazu',
    direction: 'ida',
    originLabel: 'Taras / casa del usuario',
    originCoordinates: [-83.9389683, 9.87829],
    destinationQuery: '9.953845,-83.881259',
    destinationLabel: 'Pin oeste Volcan Irazu',
    destinationCoordinates: [-83.88125895327642, 9.953845289007294],
    expectation: {
      expectedWinners: [
        'Cartago - Taras - San Nicolas luego Cartago - Tierra Blanca - Potrero Cerrado - Sanatorio',
      ],
      acceptableAlternatives: ['Cartago - Tierra Blanca - Potrero Cerrado - Sanatorio'],
      shouldNeverWin: [
        'San Jose-Tejar',
        'San Jose - San Pedro',
        'San Jose - Cartago - Volcan Irazu',
        'Cartago - San Juan De Chicua - La Pastora - Volcan Irazu',
        'Cartago - Llano Grande',
      ],
    },
    notes:
      'Caso para pins turisticos de Prusia/Irazu: por calle conviene Sanatorio aunque Chicua parezca mas cerca en linea recta.',
  },
  {
    id: 'taras-sanatorio-duran',
    name: 'Taras -> Sanatorio Duran',
    groupId: 'cartago-irazu',
    groupLabel: 'Cartago / Irazu',
    direction: 'ida',
    originLabel: 'Taras / casa del usuario',
    originCoordinates: [-83.9389683, 9.87829],
    destinationQuery: '9.933000,-83.883200',
    destinationLabel: 'Sanatorio Duran',
    destinationCoordinates: [-83.8832, 9.933],
    expectation: {
      expectedWinners: [
        'Cartago - Taras - San Nicolas luego Cartago - Tierra Blanca - Potrero Cerrado - Sanatorio',
      ],
      acceptableAlternatives: ['Cartago - Tierra Blanca - Potrero Cerrado - Sanatorio'],
      shouldNeverWin: ['San Jose-Tejar', 'San Jose - Cartago - Volcan Irazu'],
      expectedFinalStops: ['Terminal Sanatorio De Duran'],
      shouldNeverFinalStops: ['Cruce Sanatorio'],
    },
    notes:
      'Regresion para no cortar la ruta 0307-B en Cruce Sanatorio cuando el shape y Moovit llegan al terminal.',
  },
  {
    id: 'cartago-centro-ucr-san-pedro',
    name: 'Cartago centro -> UCR San Pedro',
    groupId: 'cartago-outward',
    groupLabel: 'Cartago / Outward',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: 'UCR San Pedro',
    destinationLabel: 'UCR San Pedro',
    destinationCoordinates: [-84.0513, 9.9368],
    expectation: {
      expectedWinners: ['San Jose - San Pedro'],
      acceptableAlternatives: ['Cartago-Ministerio De Salud En San Jose', 'Cartago-Ice'],
      shouldNeverWin: ['Heredia', 'Alajuela'],
    },
    notes:
      'Round 2 outward base. Moovit web trip planner selected UCR and exposed CARTAGO - SAN JOSE train access; RAPTOR currently uses the San Jose/San Pedro interurban family with reasonable final walk.',
  },
  {
    id: 'cartago-centro-mall-san-pedro',
    name: 'Cartago centro -> Mall San Pedro',
    groupId: 'cartago-outward',
    groupLabel: 'Cartago / Outward',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: 'Mall San Pedro',
    destinationLabel: 'Mall San Pedro',
    destinationCoordinates: [-84.0557, 9.934],
    expectation: {
      expectedWinners: ['San Jose - San Pedro'],
      acceptableAlternatives: ['Cartago-Ministerio De Salud En San Jose', 'Cartago-Ice'],
      shouldNeverWin: ['Heredia', 'Alajuela'],
    },
    notes: 'Round 2 outward commercial sentinel for the San Pedro corridor.',
  },
  {
    id: 'cartago-centro-plaza-del-sol',
    name: 'Cartago centro -> Plaza del Sol Curridabat',
    groupId: 'cartago-outward',
    groupLabel: 'Cartago / Outward',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: 'Plaza del Sol Curridabat',
    destinationLabel: 'Plaza del Sol Curridabat',
    destinationCoordinates: [-84.0447, 9.9147],
    expectation: {
      expectedWinners: ['San Jose - San Pedro', 'Cartago-Ministerio De Salud En San Jose'],
      acceptableAlternatives: ['Cartago-Ice'],
      shouldNeverWin: ['Heredia', 'Alajuela'],
    },
    notes:
      'Round 2 outward base. Moovit source page lists Plaza del Sol stops and Cartago/San Jose families; protects Curridabat east-side reach without claiming full San Jose metro support.',
  },
  {
    id: 'cartago-centro-multiplaza-este',
    name: 'Cartago centro -> Multiplaza del Este',
    groupId: 'cartago-outward',
    groupLabel: 'Cartago / Outward',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: 'Multiplaza del Este',
    destinationLabel: 'Multiplaza del Este',
    destinationCoordinates: [-84.038, 9.9156],
    expectation: {
      expectedWinners: ['San Jose - San Pedro', 'Cartago-Ministerio De Salud En San Jose'],
      acceptableAlternatives: ['Cartago-Ice'],
      shouldNeverWin: ['Heredia', 'Alajuela'],
    },
    notes: 'Round 2 outward base for a high-confidence Curridabat commercial pin.',
  },
  {
    id: 'cartago-centro-mercado-central-sj',
    name: 'Cartago centro -> Mercado Central San Jose',
    groupId: 'cartago-outward',
    groupLabel: 'Cartago / Outward',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: 'Mercado Central San Jose',
    destinationLabel: 'Mercado Central San Jose',
    destinationCoordinates: [-84.0802, 9.9342],
    expectation: {
      expectedWinners: ['San Jose - San Pedro', 'Cartago-Ministerio De Salud En San Jose'],
      acceptableAlternatives: ['Cartago-Ice'],
      shouldNeverWin: ['Heredia', 'Alajuela'],
    },
    notes:
      'Moovit exact trip-planner check confirmed a Cartago/San Jose trunk itinerary and a long final walk near 1km, so the long-walk shape is source-plausible for this pin.',
  },
  {
    id: 'cartago-centro-hospital-san-juan-dios',
    name: 'Cartago centro -> Hospital San Juan de Dios',
    groupId: 'cartago-outward',
    groupLabel: 'Cartago / Outward',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: 'Hospital San Juan de Dios',
    destinationLabel: 'Hospital San Juan de Dios',
    destinationCoordinates: [-84.0827, 9.9317],
    expectation: {
      expectedWinners: ['San Jose - San Pedro', 'Cartago-Ministerio De Salud En San Jose'],
      acceptableAlternatives: ['Cartago-Ice'],
      shouldNeverWin: ['Heredia', 'Alajuela'],
    },
    notes: 'Round 2 outward healthcare sentinel for central San Jose reach.',
  },
  {
    id: 'cartago-centro-hospital-mexico',
    name: 'Cartago centro -> Hospital Mexico',
    groupId: 'cartago-outward',
    groupLabel: 'Cartago / Outward',
    direction: 'ida',
    originLabel: 'Cartago centro',
    originCoordinates: [-83.919373, 9.864429],
    destinationQuery: 'Hospital Mexico',
    destinationLabel: 'Hospital Mexico',
    destinationCoordinates: [-84.117, 9.9515],
    expectation: {
      expectedWinners: ['San Jose - San Pedro', 'Hospital Mexico'],
      acceptableAlternatives: ['Cartago-Ministerio De Salud En San Jose', 'Cartago-Ice'],
      shouldNeverWin: ['Heredia', 'Alajuela'],
    },
    notes:
      'Round 2 northwest San Jose stress case. Moovit exact planner picked a hospital-adjacent target and confirms the trip is real, but this remains coordinate-sensitive.',
  },
  {
    id: 'ucr-san-pedro-cartago-centro',
    name: 'UCR San Pedro -> Cartago centro',
    groupId: 'cartago-outward',
    groupLabel: 'Cartago / Outward',
    direction: 'vuelta',
    originLabel: 'UCR San Pedro',
    originCoordinates: [-84.0513, 9.9368],
    destinationQuery: 'Cartago centro, Cartago',
    destinationLabel: 'Cartago centro',
    destinationCoordinates: [-83.919373, 9.864429],
    expectation: {
      expectedWinners: ['San Jose - San Pedro'],
      acceptableAlternatives: ['Cartago-Ministerio De Salud En San Jose', 'Cartago-Ice'],
      shouldNeverWin: ['Heredia', 'Alajuela'],
    },
    notes: 'Round 2 outward base return sentinel for student/worker trips.',
  },
  {
    id: 'curridabat-cartago-centro',
    name: 'Curridabat -> Cartago centro',
    groupId: 'cartago-outward',
    groupLabel: 'Cartago / Outward',
    direction: 'vuelta',
    originLabel: 'Curridabat central area',
    originCoordinates: [-84.0346, 9.9148],
    destinationQuery: 'Cartago centro, Cartago',
    destinationLabel: 'Cartago centro',
    destinationCoordinates: [-83.919373, 9.864429],
    expectation: {
      expectedWinners: ['San Jose - San Pedro'],
      acceptableAlternatives: ['Cartago-Ministerio De Salud En San Jose', 'Cartago-Ice'],
      shouldNeverWin: ['Heredia', 'Alajuela'],
    },
    notes: 'Round 2 outward base return sentinel from Curridabat.',
  },
  {
    id: 'san-jose-centro-cartago-centro',
    name: 'San Jose centro -> Cartago centro',
    groupId: 'cartago-outward',
    groupLabel: 'Cartago / Outward',
    direction: 'vuelta',
    originLabel: 'San Jose centro',
    originCoordinates: [-84.077, 9.9335],
    destinationQuery: 'Cartago centro, Cartago',
    destinationLabel: 'Cartago centro',
    destinationCoordinates: [-83.919373, 9.864429],
    expectation: {
      expectedWinners: [
        'San Jose - San Pedro',
        'San Jose - Zapote',
        'Cartago-Ministerio De Salud En San Jose',
      ],
      acceptableAlternatives: ['Cartago-Ice'],
      shouldNeverWin: ['Heredia', 'Alajuela'],
    },
    notes: 'Round 2 outward base reverse trunk from central San Jose.',
  },
  {
    id: 'hospital-mexico-cartago-centro',
    name: 'Hospital Mexico -> Cartago centro',
    groupId: 'cartago-outward',
    groupLabel: 'Cartago / Outward',
    direction: 'vuelta',
    originLabel: 'Hospital Mexico',
    originCoordinates: [-84.117, 9.9515],
    destinationQuery: 'Cartago centro, Cartago',
    destinationLabel: 'Cartago centro',
    destinationCoordinates: [-83.919373, 9.864429],
    expectation: {
      expectedWinners: ['San Jose - San Pedro', 'Hospital Mexico'],
      acceptableAlternatives: ['Cartago-Ministerio De Salud En San Jose', 'Cartago-Ice'],
      shouldNeverWin: ['Heredia', 'Alajuela'],
    },
    notes: 'Round 2 outward base reverse healthcare stress case.',
  },
  {
    id: 'plaza-san-isidro-cartago-centro',
    name: 'Plaza San Isidro -> Cartago centro',
    groupId: 'cartago-tejar',
    groupLabel: 'Cartago / Tejar',
    direction: 'vuelta',
    originLabel: 'Plaza San Isidro',
    originCoordinates: [-83.9525036531641, 9.82938521411127],
    destinationQuery: 'Cartago centro, Cartago',
    destinationLabel: 'Cartago centro',
    destinationCoordinates: [-83.919373, 9.864429],
    expectation: {
      expectedWinners: ['San Isidro-Cartago Por El Molino'],
      acceptableAlternatives: ['San Isidro-Cartago Por Asuncion'],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago-San Isidro - El Molino'],
    },
    notes: 'Caso de regreso para verificar que los sentidos vuelta 0328-D-2 y 0328-E-2 de verdad ganen cuando toca.',
  },
  {
    id: 'guadalupe-cartago-centro',
    name: 'Guadalupe -> Cartago centro',
    groupId: 'cartago-guadalupe',
    groupLabel: 'Cartago / Guadalupe',
    direction: 'circular',
    originLabel: 'Guadalupe',
    originCoordinates: [-83.9244086, 9.8660225],
    destinationQuery: 'Cartago centro, Cartago',
    destinationLabel: 'Cartago centro',
    destinationCoordinates: [-83.919373, 9.864429],
    expectation: {
      expectedWinners: ['Cartago - Guadalupe'],
      acceptableAlternatives: [
        'Cartago-Ice',
        'Cartago - Guadalupe por La Lima',
        'Cartago - Guadalupe por La Joya',
        'El Alto - San Blas - Cartago - Parque Industrial',
      ],
      shouldNeverWin: ['San Jose-Tejar', 'Cartago-San Isidro - El Molino'],
    },
    notes: 'Caso de control para asegurar que el anillo de Guadalupe también compita bien al volver hacia Cartago.',
  },
];

export const plannerGoldenCaseGroups: PlannerGoldenCaseGroup[] = plannerGoldenCases.reduce<
  PlannerGoldenCaseGroup[]
>((groups, goldenCase) => {
  const existingGroup = groups.find((group) => group.id === goldenCase.groupId);
  if (existingGroup) {
    existingGroup.cases.push(goldenCase);
    return groups;
  }

  groups.push({
    id: goldenCase.groupId,
    label: goldenCase.groupLabel,
    cases: [goldenCase],
  });
  return groups;
}, []);
