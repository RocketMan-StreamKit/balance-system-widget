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
  if (result.success && settings.isOpen && !settings.isNotifyBlocked) {
    await settings.notify.Send({
      message: {
        en: 'Code is now visible on the widget.',
        ru: 'Код отображён на виджете.',
        uk: 'Код відображено на віджеті.',
      },
    });
  }
  return result;
});

/**
 * Boots endpoints, chat listener, and challenge loop.
 */
const boot = async (): Promise<void> => {
  await registerWidgetConfig();
  await registerHttpEndpoints();
  await registerSocketEndpoints();

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
