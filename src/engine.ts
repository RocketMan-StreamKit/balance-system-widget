import type {
  ChallengePhase,
  CodeDisplayStyle,
  DisplayPayload,
  RewardRounding,
  TextAnchor,
  WidgetParams,
} from './types';

const BALANCE_ADDON_ID = 'balance-system';
const TWITCH_ADDON_ID = 'twitch';
export const SOCKET_PATH = 'display';

type AddonRpcEnvelope = {
  success: boolean;
  result?: unknown;
  message?: string;
};

/**
 * Unwraps a payload from `addons.request` response envelope.
 * @param response - Raw RPC response from another addon.
 * @returns Handler payload or null when routing failed.
 */
const unwrapAddonRpc = <T>(response: AddonRpcEnvelope): T | null => {
  if (!response.success) {
    console.warn('[balance-system-widget] addon RPC failed:', response.message);
    return null;
  }
  return (response.result ?? null) as T | null;
};

let phase: ChallengePhase = 'idle';
let activeCode: string | null = null;
let activeSession = 0;
let spawnTimer: ReturnType<typeof setTimeout> | null = null;
let expireTimer: ReturnType<typeof setTimeout> | null = null;
let currentReward: number | null = null;
let currentDisplay: CodeDisplayStyle | null = null;

/**
 * Reads addon settings from persisted params.
 * @returns {Promise<WidgetParams>}
 */
const loadParams = async (): Promise<WidgetParams> => {
  return api.config.getParams<WidgetParams>();
};

/**
 * Picks a random number between min and max (inclusive).
 * @param min - Lower bound.
 * @param max - Upper bound.
 * @returns Random float in range.
 */
const randomBetween = (min: number, max: number): number => {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (lo === hi) {
    return lo;
  }
  const scale = 10_000;
  const ratio = random.number(0, scale) / scale;
  return lo + ratio * (hi - lo);
};

/**
 * Builds charset for code generation from settings.
 * @param params - Widget settings.
 * @returns Charset string.
 */
const buildCharset = (params: WidgetParams): string => {
  let charset = '';
  if (params.code_use_letters !== false) {
    charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  }
  if (params.code_use_digits !== false) {
    charset += '0123456789';
  }
  if (params.code_use_special) {
    charset += String(params.code_special_chars ?? '!@#$%&*?');
  }
  if (!charset) {
    charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  }
  return charset;
};

/**
 * Generates a random code string.
 * @param params - Widget settings.
 * @returns Generated code.
 */
const generateCode = (params: WidgetParams): string => {
  const charset = buildCharset(params);
  const length = Math.max(
    1,
    Math.min(32, Math.floor(Number(params.code_length) || 4))
  );
  let code = '';
  for (let i = 0; i < length; i += 1) {
    const index = random.number(0, charset.length - 1);
    code += charset.charAt(index);
  }
  return code;
};

/**
 * Resolves CSS font-family from settings.
 * @param params - Widget settings.
 * @returns CSS font-family value.
 */
const resolveFontFamily = (params: WidgetParams): string => {
  switch (params.font_family) {
    case 'arial':
      return 'Arial, Helvetica, sans-serif';
    case 'georgia':
      return 'Georgia, "Times New Roman", serif';
    case 'courier':
      return '"Courier New", Courier, monospace';
    case 'impact':
      return 'Impact, Haettenschweiler, sans-serif';
    case 'custom':
      return String(params.font_family_custom || 'Arial, sans-serif');
    default:
      return 'system-ui, -apple-system, Segoe UI, sans-serif';
  }
};

/**
 * Resolves text anchor from screen quadrant (50% split on each axis).
 * @param x - Horizontal position (%).
 * @param y - Vertical position (%).
 * @returns Corner anchor for positioning.
 */
const resolveAnchor = (x: number, y: number): TextAnchor => {
  const isRight = x >= 50;
  const isBottom = y >= 50;
  if (!isRight && !isBottom) {
    return 'top-left';
  }
  if (isRight && !isBottom) {
    return 'top-right';
  }
  if (!isRight && isBottom) {
    return 'bottom-left';
  }
  return 'bottom-right';
};

/**
 * Builds on-screen display style for the current code.
 * @param params - Widget settings.
 * @param code - Active code text.
 * @returns Display style payload.
 */
const buildDisplayStyle = (
  params: WidgetParams,
  code: string
): CodeDisplayStyle => {
  const margin = Math.max(0, Math.min(45, Number(params.margin_min) || 5));
  const x = randomBetween(margin, 100 - margin);
  const y = randomBetween(margin, 100 - margin);
  const anchor = resolveAnchor(x, y);
  const rotation = randomBetween(
    Number(params.rotation_min ?? -15),
    Number(params.rotation_max ?? 15)
  );
  const fontSize = randomBetween(
    Number(params.font_size_min) || 48,
    Number(params.font_size_max) || 72
  );

  return {
    code,
    x,
    y,
    anchor,
    rotation,
    fontSize,
    fontFamily: resolveFontFamily(params),
    color: String(params.text_color || '#ffffff'),
    strokeColor: String(params.stroke_color || '#000000'),
    strokeWidth: Math.max(0, Number(params.stroke_width) || 0),
  };
};

/**
 * Pushes current display state to widget clients.
 * @param payload - Display state.
 */
const pushDisplay = async (payload: DisplayPayload): Promise<void> => {
  await network.socketEndpoints.emit(SOCKET_PATH, 'display:update', payload);
};

/**
 * Clears scheduled timers.
 */
const clearTimers = (): void => {
  if (spawnTimer !== null) {
    clearTimeout(spawnTimer);
    spawnTimer = null;
  }
  if (expireTimer !== null) {
    clearTimeout(expireTimer);
    expireTimer = null;
  }
};

/**
 * Hides the code from the widget screen.
 */
const hideCode = async (): Promise<void> => {
  phase = 'idle';
  activeCode = null;
  currentReward = null;
  currentDisplay = null;
  if (expireTimer !== null) {
    clearTimeout(expireTimer);
    expireTimer = null;
  }
  await pushDisplay({ visible: false, display: null });
};

/**
 * Resolves rounding precision factor from settings.
 * @param rounding - Rounding mode.
 * @returns Multiplier for rounding (1, 10, or 100).
 */
const getRoundingFactor = (rounding: RewardRounding): number => {
  switch (rounding) {
    case 'tenths':
      return 10;
    case 'hundredths':
      return 100;
    default:
      return 1;
  }
};

/**
 * Rounds reward amount according to settings.
 * @param amount - Raw amount.
 * @param rounding - Rounding mode.
 * @returns Rounded amount.
 */
const roundAmount = (amount: number, rounding: RewardRounding): number => {
  const factor = getRoundingFactor(rounding);
  return Math.round(amount * factor) / factor;
};

/**
 * Formats reward amount for chat messages.
 * @param amount - Reward amount.
 * @param rounding - Rounding mode.
 * @returns Formatted amount string.
 */
const formatAmount = (
  amount: number,
  rounding: RewardRounding = 'integer'
): string => {
  const rounded = roundAmount(amount, rounding);
  if (rounding === 'integer') {
    return String(rounded);
  }
  if (rounding === 'tenths') {
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
};

/**
 * Replaces placeholders in a message template.
 * @param template - Message template.
 * @param values - Placeholder values.
 * @returns Formatted message.
 */
const formatMessage = (
  template: string,
  values: {
    login: string;
    amount: number;
    currency: string;
    rounding: RewardRounding;
  }
): string => {
  return String(template || '')
    .replace(/\{login\}/g, values.login)
    .replace(/\{amount\}/g, formatAmount(values.amount, values.rounding))
    .replace(/\{currency\}/g, values.currency);
};

/**
 * Sends a message to Twitch chat via the Twitch addon RPC.
 * @param message - Chat message text.
 */
const sendTwitchChatMessage = async (message: string): Promise<void> => {
  if (!message.trim()) {
    return;
  }
  try {
    const response = await addons.request(TWITCH_ADDON_ID, 'sendChatMessage', {
      message,
    });
    if (!response.success) {
      console.error(
        '[balance-system-widget] sendChatMessage failed:',
        response.message
      );
    }
  } catch (error) {
    console.error(
      '[balance-system-widget] failed to send chat message:',
      error
    );
  }
};

/**
 * Fetches balance currency from the balance-system addon.
 * @returns Currency code.
 */
const getBalanceCurrency = async (): Promise<string> => {
  try {
    const payload = unwrapAddonRpc<{ currency?: string }>(
      await addons.request(BALANCE_ADDON_ID, 'getCurrency')
    );
    return String(payload?.currency || '');
  } catch {
    return '';
  }
};

/**
 * Checks whether external balance credit is allowed.
 * @returns Whether credit is allowed.
 * @example
 * if (await canCreditBalance()) { ... }
 */
export const canCreditBalance = async (): Promise<boolean> => {
  try {
    const payload = unwrapAddonRpc<{ allowed?: boolean }>(
      await addons.request(BALANCE_ADDON_ID, 'canCreditBalance')
    );
    return Boolean(payload?.allowed);
  } catch {
    return false;
  }
};

/**
 * Credits viewer balance through balance-system RPC.
 * @param input - Credit request payload.
 * @returns Credit result.
 */
const creditViewerBalance = async (input: {
  login: string;
  twitchId?: string;
  displayName?: string;
  amount: number;
}): Promise<{ success: boolean; message?: string }> => {
  try {
    const payload = unwrapAddonRpc<{ success?: boolean; message?: string }>(
      await addons.request(BALANCE_ADDON_ID, 'creditBalance', {
        login: input.login,
        twitchId: input.twitchId,
        displayName: input.displayName,
        amount: input.amount,
      })
    );
    if (!payload) {
      return { success: false, message: 'balance-system RPC failed' };
    }
    return { success: Boolean(payload.success), message: payload.message };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'credit failed',
    };
  }
};

/**
 * Picks a random reward amount from settings.
 * @param params - Widget settings.
 * @returns Reward amount.
 */
const pickRewardAmount = (params: WidgetParams): number => {
  const min = Math.max(0.01, Number(params.reward_min) || 1);
  const max = Math.max(min, Number(params.reward_max) || min);
  const rounding = params.reward_rounding || 'integer';
  return roundAmount(randomBetween(min, max), rounding);
};

/**
 * Schedules the next code appearance after a random interval.
 */
const scheduleNextSpawn = async (): Promise<void> => {
  if (spawnTimer !== null) {
    clearTimeout(spawnTimer);
    spawnTimer = null;
  }

  const params = await loadParams();
  if (params.enabled === false) {
    return;
  }

  const minMs =
    Math.max(0.1, Number(params.interval_min_minutes) || 5) * 60_000;
  const maxMs = Math.max(
    minMs,
    Math.max(0.1, Number(params.interval_max_minutes) || 10) * 60_000
  );
  // Node clamps delays outside [1, 2^31-1] to 1ms — keep the value in range.
  const delay = Math.min(
    Math.max(1, Math.round(randomBetween(minMs, maxMs))),
    2_147_483_647
  );

  spawnTimer = setTimeout(() => {
    void spawnChallenge();
  }, delay);
};

/**
 * Shows a new code on screen and starts the display timer.
 * @param force - Skip the enabled flag (manual trigger from settings).
 * @returns Whether a code was shown.
 */
const spawnChallenge = async (force = false): Promise<boolean> => {
  spawnTimer = null;
  const params = await loadParams();
  if (!force && params.enabled === false) {
    await scheduleNextSpawn();
    return false;
  }

  if (!force) {
    const allowed = await canCreditBalance();
    if (!allowed) {
      console.warn(
        '[balance-system-widget] external balance credit is disabled in balance-system settings'
      );
      await scheduleNextSpawn();
      return false;
    }
  }

  const code = generateCode(params);
  const reward = pickRewardAmount(params);
  const session = activeSession + 1;
  activeSession = session;
  activeCode = code;
  currentReward = reward;
  phase = 'showing';

  const display = buildDisplayStyle(params, code);
  currentDisplay = display;
  await pushDisplay({ visible: true, display });

  const minSec = Math.max(1, Number(params.duration_min_seconds) || 30);
  const maxSec = Math.max(minSec, Number(params.duration_max_seconds) || 60);
  const durationMs = randomBetween(minSec, maxSec) * 1000;

  if (expireTimer !== null) {
    clearTimeout(expireTimer);
  }
  expireTimer = setTimeout(() => {
    void handleExpire(session);
  }, durationMs);

  return true;
};

/**
 * Handles display timeout when nobody typed the code.
 * @param session - Spawn session id.
 */
const handleExpire = async (session: number): Promise<void> => {
  if (session !== activeSession || phase !== 'showing') {
    return;
  }

  expireTimer = null;
  const params = await loadParams();
  await hideCode();

  if (params.send_timeout_message) {
    await sendTwitchChatMessage(String(params.timeout_message || ''));
  }

  await scheduleNextSpawn();
};

/**
 * Handles a successful code match from Twitch chat.
 * @param msg - Incoming chat message.
 * @param reward - Pre-selected reward amount.
 * @param matchedCode - Code that was matched.
 */
const handleWinner = async (
  msg: DashboardChatIncomingPayload,
  reward: number,
  matchedCode: string
): Promise<void> => {
  const session = activeSession;
  const login = String(msg.user?.name || '').trim();
  if (!login) {
    await scheduleNextSpawn();
    return;
  }

  const credit = await creditViewerBalance({
    login,
    twitchId: msg.user?.id,
    displayName: login,
    amount: reward,
  });

  const params = await loadParams();
  const currency = await getBalanceCurrency();

  if (credit.success) {
    const text = formatMessage(String(params.success_message || ''), {
      login,
      amount: reward,
      currency,
      rounding: params.reward_rounding || 'integer',
    });
    await sendTwitchChatMessage(text);
  } else {
    console.error(
      '[balance-system-widget] credit failed:',
      credit.message,
      'code:',
      matchedCode
    );
    await sendTwitchChatMessage(
      `@${login} указал код, но пополнение баланса не удалось.`
    );
  }

  if (session === activeSession) {
    await scheduleNextSpawn();
  }
};

/**
 * Normalizes chat text for code comparison.
 * @param text - Raw chat text.
 * @param caseSensitive - Whether to preserve case.
 * @returns Normalized text.
 */
const normalizeChatText = (text: string, caseSensitive: boolean): string => {
  const trimmed = text.trim();
  return caseSensitive ? trimmed : trimmed.toLowerCase();
};

/**
 * Checks whether an incoming chat message matches the active code.
 * @param msg - Incoming chat message.
 */
export const onChatMessage = async (
  msg: DashboardChatIncomingPayload
): Promise<void> => {
  if (phase !== 'showing' || !activeCode) {
    return;
  }

  if (msg.user?.platform !== 'twitch') {
    return;
  }

  if (msg.sourceAddonId && msg.sourceAddonId !== TWITCH_ADDON_ID) {
    return;
  }

  const params = await loadParams();
  const expected = normalizeChatText(
    activeCode,
    Boolean(params.case_sensitive)
  );
  const actual = normalizeChatText(
    String(msg.message?.content || ''),
    Boolean(params.case_sensitive)
  );

  if (actual !== expected) {
    return;
  }

  if (phase !== 'showing' || !activeCode || currentReward === null) {
    return;
  }

  phase = 'idle';
  const matchedCode = activeCode;
  const reward = currentReward;
  activeCode = null;
  currentReward = null;
  if (expireTimer !== null) {
    clearTimeout(expireTimer);
    expireTimer = null;
  }
  currentDisplay = null;
  await pushDisplay({ visible: false, display: null });

  await handleWinner(msg, reward, matchedCode);
};

/**
 * Returns current display payload for HTTP polling.
 * @returns Current display state.
 */
export const getDisplayState = async (): Promise<DisplayPayload> => {
  if (phase !== 'showing' || !activeCode || !currentDisplay) {
    return { visible: false, display: null };
  }

  return {
    visible: true,
    display: currentDisplay,
  };
};

/**
 * Shows a code immediately (settings button), cancelling any pending spawn timer.
 * Requires external balance credit to be enabled in balance-system settings.
 * @returns Whether a code was shown.
 * @example
 * const result = await showCodeNow();
 * // { success: true } when credit is allowed and the code is displayed
 */
export const showCodeNow = async (): Promise<{ success: boolean }> => {
  if (spawnTimer !== null) {
    clearTimeout(spawnTimer);
    spawnTimer = null;
  }

  const allowed = await canCreditBalance();
  if (!allowed) {
    return { success: false };
  }

  const shown = await spawnChallenge(true);
  return { success: shown };
};

/**
 * Starts the challenge engine and chat listener.
 */
export const startChallengeEngine = async (): Promise<void> => {
  clearTimers();
  phase = 'idle';
  activeCode = null;
  activeSession = 0;
  currentReward = null;
  currentDisplay = null;
  await pushDisplay({ visible: false, display: null });
  await scheduleNextSpawn();
};

/**
 * Stops timers when the addon unloads (best-effort).
 */
export const stopChallengeEngine = (): void => {
  clearTimers();
};

export { hideCode, pushDisplay };
