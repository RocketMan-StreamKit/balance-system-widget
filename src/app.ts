import type { CodeDisplayStyle, DisplayPayload, TextAnchor } from './types';

declare global {
  interface Window {
    io?: (
      namespace: string,
      options: { path: string }
    ) => {
      on(
        event: 'display:update',
        handler: (payload: DisplayPayload) => void
      ): void;
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
 * Resolves text anchor from screen quadrant when missing from payload.
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
 * Applies corner-anchored position based on screen quadrant.
 * @param display - Code display style.
 */
const applyAnchorPosition = (display: CodeDisplayStyle): void => {
  if (!textEl) {
    return;
  }

  const anchor = display.anchor ?? resolveAnchor(display.x, display.y);
  const rotation = `rotate(${display.rotation}deg)`;

  textEl.style.left = '';
  textEl.style.right = '';
  textEl.style.top = '';
  textEl.style.bottom = '';

  switch (anchor) {
    case 'top-left':
      textEl.style.left = `${display.x}%`;
      textEl.style.top = `${display.y}%`;
      textEl.style.transformOrigin = 'left top';
      break;
    case 'top-right':
      textEl.style.right = `${100 - display.x}%`;
      textEl.style.top = `${display.y}%`;
      textEl.style.transformOrigin = 'right top';
      break;
    case 'bottom-left':
      textEl.style.left = `${display.x}%`;
      textEl.style.bottom = `${100 - display.y}%`;
      textEl.style.transformOrigin = 'left bottom';
      break;
    case 'bottom-right':
      textEl.style.right = `${100 - display.x}%`;
      textEl.style.bottom = `${100 - display.y}%`;
      textEl.style.transformOrigin = 'right bottom';
      break;
  }

  textEl.style.transform = rotation;
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
  applyAnchorPosition(display);
  textEl.style.fontSize = `${display.fontSize}px`;
  textEl.style.fontFamily = display.fontFamily;
  textEl.style.color = display.color;

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
    console.warn(
      '[balance-system-widget] socket connect error:',
      error.message
    );
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
