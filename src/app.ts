import type { CodeDisplayStyle, DisplayPayload } from './types';

declare global {
  interface Window {
    io?: (
      namespace: string,
      options: { path: string }
    ) => {
      on(event: 'display:update', handler: (payload: DisplayPayload) => void): void;
      on(event: 'connect_error', handler: (error: Error) => void): void;
    };
  }
}

const ADDON_ID = 'balance-system-widget';
const SOCKET_PATH = 'display';

const layerEl = document.getElementById('code-layer');
const textEl = document.getElementById('code-text');

/**
 * Reads access token from the widget URL query string.
 * @returns Access token.
 */
const getToken = (): string => {
  return new URLSearchParams(window.location.search).get('token') ?? '';
};

/**
 * Builds addon HTTP endpoint URL.
 * @param path - Endpoint path suffix.
 * @returns Full local API URL.
 */
const buildApiUrl = (path: string): string => {
  const token = encodeURIComponent(getToken());
  return `http://localhost:${window.location.port}/addon/${ADDON_ID}/${path}?token=${token}`;
};

/**
 * Applies display style to the on-screen code element.
 * @param display - Code display style.
 */
const renderDisplay = (display: CodeDisplayStyle): void => {
  if (!layerEl || !textEl) {
    return;
  }

  textEl.textContent = display.code;
  textEl.style.left = `${display.x}%`;
  textEl.style.top = `${display.y}%`;
  textEl.style.fontSize = `${display.fontSize}px`;
  textEl.style.fontFamily = display.fontFamily;
  textEl.style.color = display.color;
  textEl.style.transform = `translate(-50%, -50%) rotate(${display.rotation}deg)`;

  const strokeWidth = Number(display.strokeWidth) || 0;
  if (strokeWidth > 0) {
    textEl.dataset.stroke = 'on';
    textEl.style.webkitTextStroke = `${strokeWidth}px ${display.strokeColor}`;
  } else {
    textEl.dataset.stroke = 'off';
    textEl.style.webkitTextStroke = '';
  }

  layerEl.hidden = false;
};

/**
 * Hides the code from the screen.
 */
const hideDisplay = (): void => {
  if (layerEl) {
    layerEl.hidden = true;
  }
  if (textEl) {
    textEl.textContent = '';
  }
};

/**
 * Updates widget UI from server payload.
 * @param payload - Display state from worker.
 */
const applyPayload = (payload: DisplayPayload): void => {
  if (payload.visible && payload.display) {
    renderDisplay(payload.display);
    return;
  }
  hideDisplay();
};

/**
 * Polls display state over HTTP as a fallback.
 */
const pollDisplay = async (): Promise<void> => {
  try {
    const response = await fetch(buildApiUrl('display'));
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as DisplayPayload & { ok?: boolean };
    if (data.ok) {
      applyPayload(data);
    }
  } catch (error) {
    console.error('[balance-system-widget] poll failed:', error);
  }
};

/**
 * Connects Socket.IO for instant display updates.
 */
const connectSocket = (): void => {
  const ioClient = window.io;
  if (typeof ioClient !== 'function') {
    return;
  }

  const namespace = `http://localhost:${window.location.port}/addon/${ADDON_ID}/${SOCKET_PATH}`;
  const socket = ioClient(namespace, { path: '/addon/socket.io' });

  socket.on('display:update', (payload: DisplayPayload) => {
    applyPayload(payload);
  });

  socket.on('connect_error', (error: Error) => {
    console.warn('[balance-system-widget] socket connect error:', error.message);
  });
};

/**
 * Boots widget page networking.
 */
const boot = (): void => {
  connectSocket();
  void pollDisplay();
  window.setInterval(() => {
    void pollDisplay();
  }, 1000);
};

boot();
