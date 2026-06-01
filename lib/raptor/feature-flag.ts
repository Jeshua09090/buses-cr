const INSTALLATION_ID_STORAGE_KEY = '@busescr/raptor-runtime-installation-id:v1';
const DEFAULT_ROLLOUT_SALT = 'busescr-raptor-runtime-v1';

let cachedInstallationId: string | null = null;

export type RaptorRuntimeDecisionMode =
  | 'forced_on'
  | 'forced_off'
  | 'rollout_enabled'
  | 'rollout_disabled';

export type RaptorRuntimeDecision = {
  enabled: boolean;
  mode: RaptorRuntimeDecisionMode;
  fallbackReason?: string;
  rolloutPercent: number;
  rolloutBucket?: number;
};

type RaptorRuntimeDecisionInput = {
  disableEnv?: string;
  forceEnv?: string;
  rolloutPercentEnv?: string;
  rolloutSalt?: string;
  installationId?: string;
};

function isTruthyEnv(value: string | undefined) {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

function parseRolloutPercent(value: string | undefined) {
  if (value == null || value.trim() === '') return 0;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;

  return Math.min(100, Math.max(0, parsed));
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function generateInstallationId() {
  return [
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
    Math.random().toString(36).slice(2),
  ].join('-');
}

async function loadPersistedInstallationId() {
  if (cachedInstallationId) return cachedInstallationId;

  try {
    const asyncStorageModule = await import('@react-native-async-storage/async-storage');
    const storage = asyncStorageModule.default;
    const existing = await storage.getItem(INSTALLATION_ID_STORAGE_KEY);

    if (existing) {
      cachedInstallationId = existing;
      return existing;
    }

    const generated = generateInstallationId();
    await storage.setItem(INSTALLATION_ID_STORAGE_KEY, generated);
    cachedInstallationId = generated;
    return generated;
  } catch {
    cachedInstallationId = generateInstallationId();
    return cachedInstallationId;
  }
}

export function evaluateRaptorRuntimeDecision(input: RaptorRuntimeDecisionInput = {}): RaptorRuntimeDecision {
  const rolloutPercent = parseRolloutPercent(input.rolloutPercentEnv);

  if (isTruthyEnv(input.disableEnv)) {
    return {
      enabled: false,
      mode: 'forced_off',
      fallbackReason: 'raptor_forced_off',
      rolloutPercent,
    };
  }

  if (isTruthyEnv(input.forceEnv)) {
    return {
      enabled: true,
      mode: 'forced_on',
      rolloutPercent: 100,
    };
  }

  if (rolloutPercent <= 0) {
    return {
      enabled: false,
      mode: 'rollout_disabled',
      fallbackReason: 'feature_flag_off',
      rolloutPercent: 0,
    };
  }

  if (rolloutPercent >= 100) {
    return {
      enabled: true,
      mode: 'rollout_enabled',
      rolloutPercent: 100,
      rolloutBucket: 0,
    };
  }

  const installationId = input.installationId ?? '';
  const rolloutSalt = input.rolloutSalt ?? DEFAULT_ROLLOUT_SALT;
  const bucket = hashString(`${rolloutSalt}:${installationId}`) % 10000;
  const rolloutBasisPoints = Math.round(rolloutPercent * 100);
  const enabled = bucket < rolloutBasisPoints;

  return {
    enabled,
    mode: enabled ? 'rollout_enabled' : 'rollout_disabled',
    fallbackReason: enabled ? undefined : 'rollout_not_selected',
    rolloutPercent,
    rolloutBucket: bucket / 100,
  };
}

export function evaluateRaptorRuntimePreloadEnabled(input: RaptorRuntimeDecisionInput = {}) {
  if (isTruthyEnv(input.disableEnv)) return false;
  if (isTruthyEnv(input.forceEnv)) return true;

  return parseRolloutPercent(input.rolloutPercentEnv) >= 100;
}

export function isRaptorRuntimeEnabled() {
  return evaluateRaptorRuntimePreloadEnabled({
    disableEnv: process.env.EXPO_PUBLIC_DISABLE_RAPTOR_RUNTIME,
    forceEnv: process.env.EXPO_PUBLIC_USE_RAPTOR_RUNTIME,
    rolloutPercentEnv: process.env.EXPO_PUBLIC_RAPTOR_RUNTIME_ROLLOUT_PERCENT,
  });
}

export async function resolveRaptorRuntimeDecision() {
  const forceEnv = process.env.EXPO_PUBLIC_USE_RAPTOR_RUNTIME;
  const disableEnv = process.env.EXPO_PUBLIC_DISABLE_RAPTOR_RUNTIME;
  const rolloutPercentEnv = process.env.EXPO_PUBLIC_RAPTOR_RUNTIME_ROLLOUT_PERCENT;

  if (
    isTruthyEnv(forceEnv) ||
    isTruthyEnv(disableEnv) ||
    parseRolloutPercent(rolloutPercentEnv) <= 0 ||
    parseRolloutPercent(rolloutPercentEnv) >= 100
  ) {
    return evaluateRaptorRuntimeDecision({
      disableEnv,
      forceEnv,
      rolloutPercentEnv,
      rolloutSalt: process.env.EXPO_PUBLIC_RAPTOR_RUNTIME_ROLLOUT_SALT,
    });
  }

  return evaluateRaptorRuntimeDecision({
    disableEnv,
    forceEnv,
    rolloutPercentEnv,
    rolloutSalt: process.env.EXPO_PUBLIC_RAPTOR_RUNTIME_ROLLOUT_SALT,
    installationId: await loadPersistedInstallationId(),
  });
}
