import { registerWidgetConfig } from './config';
import {
  SOCKET_PATH,
  getDisplayState,
  onChatMessage,
  showCodeNow,
  startChallengeEngine,
} from './engine';
import type { DisplayPayload } from './types';

type QueryRecord = Record<string, string | undefined>;

/**
 * Validates frontend access token from query string.
 * @param query - HTTP query parameters.
 * @returns Whether the request is authorized.
 */
const isAuthorized = (query: QueryRecord): boolean => {
  return String(query.token || '') === String(data.token || '');
};

/**
 * Registers HTTP endpoints for the widget page.
 */
const registerHttpEndpoints = async (): Promise<void> => {
  await network.endpoints.create('display', 'GET', 'onGetDisplay');
};

/**
 * Registers Socket.IO namespace for live display updates.
 */
const registerSocketEndpoints = async (): Promise<void> => {
  await network.socketEndpoints.create(SOCKET_PATH, 'onDisplaySocket');
};

/**
 * Boots endpoints, chat listener, and challenge loop.
 */
const boot = async (): Promise<void> => {
  await registerWidgetConfig();
  await registerHttpEndpoints();
  await registerSocketEndpoints();

  events.On('onGetDisplay', async ({ query }) => {
    if (!isAuthorized(query)) {
      return { error: 'Unauthorized' };
    }
    const state = await getDisplayState();
    return { ok: true, ...state };
  });

  events.On('onDisplaySocket', async (payload) => {
    if (payload.type === 'connect') {
      const state = await getDisplayState();
      await network.socketEndpoints.emit(
        SOCKET_PATH,
        'display:update',
        state,
        payload.socketId
      );
    }
  });

  events.On('onShowCodeNow', async () => {
    const result = await showCodeNow();
    if (settings.isOpen && !settings.isNotifyBlocked) {
      await settings.notify.Send({
        message: result.success
          ? {
              en: 'Code is now visible on the widget.',
              ru: 'Код отображён на виджете.',
              uk: 'Код відображено на віджеті.',
            }
          : {
              en: 'Enable "Allow other addons to credit balance" in balance-system settings.',
              ru: 'Включите «Разрешить другим аддонам пополнять баланс» в настройках системы баланса.',
              uk: 'Увімкніть «Дозволити іншим аддонам поповнювати баланс» у налаштуваннях balance-system.',
            },
      });
    }
    return result;
  });

  await dashboard.onChatMessage((msg) => {
    void onChatMessage(msg);
  });

  await startChallengeEngine();
};

void boot().catch((error) => {
  console.error('[balance-system-widget] boot failed:', error);
});

console.log('[balance-system-widget] balance code challenge widget loaded');

export type { DisplayPayload };
