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
const innerEl = document.getElementById('code-text-inner');
const aboveEl = document.getElementById('code-above-text');
const valueEl = document.getElementById('code-value');

/** How long a revealed character stays visible in secret mode (ms). */
const SECRET_REVEAL_MS = 2000;
/** Pause while all characters stay masked between reveals (ms). */
const SECRET_GAP_MS = 3500;

/** Timeout id for the pause between secret-mode reveals. */
let secretGapTimer: number | null = null;
/** Timeout id for hiding the currently revealed character. */
let secretHideTimer: number | null = null;
/** Character index order for the current secret-mode pass. */
let secretRevealOrder: number[] = [];
/** Next position in `secretRevealOrder` to reveal. */
let secretRevealCursor = 0;
/** Text color used for secret-mode mask backgrounds. */
let secretTextColor = '#ffffff';
/** Stroke color used for secret-mode mask borders. */
let secretStrokeColor = '#000000';
/** Stroke width (px) mirrored as CSS border on hidden secret-mode characters. */
let secretStrokeWidth = 0;
/** Key of the last fully applied display payload (avoids restarting animation on poll). */
let renderedDisplayKey: string | null = null;

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
 * Computes the axis-aligned bounding box size of a rotated rectangle.
 * @param width - Unrotated width in px.
 * @param height - Unrotated height in px.
 * @param rotationDeg - Rotation in degrees.
 * @returns AABB width and height in px.
 * @example
 * const box = rotatedAabbSize(200, 40, 15);
 * // { width: ~203, height: ~90 }
 */
const rotatedAabbSize = (
  width: number,
  height: number,
  rotationDeg: number
): { width: number; height: number } => {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  };
};

/**
 * Applies corner-anchored position to the outer code box (no rotation).
 * @param display - Code display style.
 */
const applyAnchorPosition = (display: CodeDisplayStyle): void => {
  if (!textEl) {
    return;
  }

  const anchor = display.anchor ?? resolveAnchor(display.x, display.y);

  textEl.style.left = '';
  textEl.style.right = '';
  textEl.style.top = '';
  textEl.style.bottom = '';

  switch (anchor) {
    case 'top-left':
      textEl.style.left = `${display.x}%`;
      textEl.style.top = `${display.y}%`;
      break;
    case 'top-right':
      textEl.style.right = `${100 - display.x}%`;
      textEl.style.top = `${display.y}%`;
      break;
    case 'bottom-left':
      textEl.style.left = `${display.x}%`;
      textEl.style.bottom = `${100 - display.y}%`;
      break;
    case 'bottom-right':
      textEl.style.right = `${100 - display.x}%`;
      textEl.style.bottom = `${100 - display.y}%`;
      break;
  }
};

/**
 * Sizes the outer box to the rotated text AABB and centers the inner span.
 * @param display - Code display style.
 */
const fitOuterToRotatedInner = (display: CodeDisplayStyle): void => {
  if (!textEl || !innerEl) {
    return;
  }

  innerEl.style.transform = 'translate(-50%, -50%)';
  const strokePad = Math.max(0, Number(display.strokeWidth) || 0) * 2;
  const rawWidth = innerEl.offsetWidth + strokePad;
  const rawHeight = innerEl.offsetHeight + strokePad;
  const box = rotatedAabbSize(rawWidth, rawHeight, display.rotation);

  textEl.style.width = `${box.width}px`;
  textEl.style.height = `${box.height}px`;
  innerEl.style.transform = `translate(-50%, -50%) rotate(${display.rotation}deg)`;
};

/**
 * Builds a stable key for a display payload to skip redundant re-renders.
 * @param display - Code display style.
 * @returns Serialization used for equality checks.
 * @example
 * displayKey({ code: 'AB', secretMode: true, x: 10, y: 20, ... });
 */
const displayKey = (display: CodeDisplayStyle): string => {
  return [
    display.code,
    display.secretMode ? '1' : '0',
    display.aboveText,
    display.aboveTextSizeMultiplier,
    display.aboveTextAlign,
    display.aboveTextMarginBottom,
    display.x,
    display.y,
    display.anchor,
    display.rotation,
    display.fontSize,
    display.fontFamily,
    display.color,
    display.strokeColor,
    display.strokeWidth,
  ].join('|');
};

/**
 * Clears all pending secret-mode reveal timers.
 * @example
 * stopSecretMode();
 */
const stopSecretMode = (): void => {
  if (secretGapTimer !== null) {
    window.clearTimeout(secretGapTimer);
    secretGapTimer = null;
  }
  if (secretHideTimer !== null) {
    window.clearTimeout(secretHideTimer);
    secretHideTimer = null;
  }
  secretRevealOrder = [];
  secretRevealCursor = 0;
};

/**
 * Shuffles character indices into a new random reveal order (Fisher–Yates).
 * @param length - Number of characters in the code.
 * @returns Permutation of `0..length-1`.
 * @example
 * shuffleIndices(4); // e.g. [2, 0, 3, 1]
 */
const shuffleIndices = (length: number): number[] => {
  const indices = Array.from({ length }, (_, index) => index);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const left = indices[i] as number;
    const right = indices[j] as number;
    indices[i] = right;
    indices[j] = left;
  }
  return indices;
};

/**
 * Sets whether a secret-mode character shows its glyph or a masked box.
 * Hidden state uses the character's natural width with background + border
 * (matching text color / stroke); revealed state restores text stroke.
 * @param charEl - Character span element.
 * @param revealed - When true, the glyph is visible; otherwise it is masked.
 * @example
 * setCharRevealed(charEl, true);
 */
const setCharRevealed = (charEl: HTMLElement, revealed: boolean): void => {
  charEl.dataset.revealed = revealed ? 'true' : 'false';
  const borderWidth = Math.max(0, secretStrokeWidth);

  if (revealed) {
    charEl.style.color = '';
    charEl.style.background = '';
    charEl.style.webkitTextStroke = '';
    // Keep transparent border so layout does not jump when toggling the mask.
    charEl.style.border =
      borderWidth > 0 ? `${borderWidth}px solid transparent` : '';
    return;
  }

  charEl.style.color = 'transparent';
  charEl.style.background = secretTextColor;
  charEl.style.webkitTextStroke = '0';
  charEl.style.border =
    borderWidth > 0 ? `${borderWidth}px solid ${secretStrokeColor}` : 'none';
};

/**
 * Schedules the next secret-mode reveal cycle for the current code.
 * @example
 * scheduleNextSecretReveal();
 */
const scheduleNextSecretReveal = (): void => {
  if (!valueEl) {
    return;
  }

  secretGapTimer = window.setTimeout(() => {
    secretGapTimer = null;
    const charEls = valueEl.querySelectorAll<HTMLElement>('.code-char');
    if (charEls.length === 0) {
      return;
    }

    if (secretRevealCursor >= secretRevealOrder.length) {
      secretRevealOrder = shuffleIndices(charEls.length);
      secretRevealCursor = 0;
    }

    const index = secretRevealOrder[secretRevealCursor] as number;
    secretRevealCursor += 1;
    const charEl = charEls[index];
    if (!charEl) {
      scheduleNextSecretReveal();
      return;
    }

    setCharRevealed(charEl, true);

    secretHideTimer = window.setTimeout(() => {
      secretHideTimer = null;
      setCharRevealed(charEl, false);
      scheduleNextSecretReveal();
    }, SECRET_REVEAL_MS);
  }, SECRET_GAP_MS);
};

/**
 * Builds per-character spans and starts the secret reveal loop.
 * @param display - Active display style (code, colors, stroke).
 * @example
 * startSecretMode(display);
 */
const startSecretMode = (display: CodeDisplayStyle): void => {
  if (!valueEl) {
    return;
  }

  stopSecretMode();
  secretTextColor = display.color;
  secretStrokeColor = display.strokeColor;
  secretStrokeWidth = Math.max(0, Number(display.strokeWidth) || 0);

  valueEl.textContent = '';
  valueEl.classList.add('code-value--secret');

  for (const char of display.code) {
    const charEl = document.createElement('span');
    charEl.className = 'code-char';
    charEl.textContent = char;
    setCharRevealed(charEl, false);
    valueEl.appendChild(charEl);
  }

  secretRevealOrder = shuffleIndices(display.code.length);
  secretRevealCursor = 0;
  scheduleNextSecretReveal();
};

/**
 * Applies display style to the on-screen code element.
 * @param display - Code display style.
 */
const renderDisplay = (display: CodeDisplayStyle): void => {
  if (!layerEl || !textEl || !innerEl || !aboveEl || !valueEl) {
    return;
  }

  const aboveText = String(display.aboveText ?? '');
  const multiplier =
    Number.isFinite(display.aboveTextSizeMultiplier) &&
    display.aboveTextSizeMultiplier > 0
      ? display.aboveTextSizeMultiplier
      : 0.5;
  const align = display.aboveTextAlign ?? 'left';
  const secretMode = display.secretMode === true;

  valueEl.style.fontSize = `${display.fontSize}px`;
  valueEl.style.lineHeight = `${display.fontSize * 2}px`;

  if (secretMode) {
    startSecretMode(display);
  } else {
    stopSecretMode();
    valueEl.classList.remove('code-value--secret');
    valueEl.textContent = display.code;
  }

  innerEl.style.fontFamily = display.fontFamily;
  innerEl.style.color = display.color;
  innerEl.style.width = '';
  innerEl.style.alignItems =
    align === 'center'
      ? 'center'
      : align === 'right'
        ? 'flex-end'
        : 'flex-start';
  aboveEl.style.width = '';
  aboveEl.style.maxWidth = '';

  if (aboveText) {
    aboveEl.hidden = false;
    aboveEl.textContent = aboveText;
    aboveEl.style.fontSize = `${display.fontSize * multiplier}px`;
    aboveEl.style.textAlign = align;
    aboveEl.style.marginBottom = `${display.aboveTextMarginBottom ?? 0}px`;
    const blockWidth = Math.max(valueEl.offsetWidth, aboveEl.offsetWidth, 1);
    innerEl.style.width = `${blockWidth}px`;
    aboveEl.style.width = '100%';
  } else {
    aboveEl.hidden = true;
    aboveEl.textContent = '';
    aboveEl.style.fontSize = '';
    aboveEl.style.textAlign = '';
    aboveEl.style.marginBottom = '';
    aboveEl.style.width = '';
  }

  const strokeWidth = Number(display.strokeWidth) || 0;
  if (strokeWidth > 0) {
    innerEl.dataset.stroke = 'on';
    innerEl.style.webkitTextStroke = `${strokeWidth}px ${display.strokeColor}`;
  } else {
    innerEl.dataset.stroke = 'off';
    innerEl.style.webkitTextStroke = '';
  }

  fitOuterToRotatedInner(display);
  applyAnchorPosition(display);
  layerEl.hidden = false;
};

/**
 * Hides the code from the screen.
 */
const hideDisplay = (): void => {
  stopSecretMode();
  renderedDisplayKey = null;
  if (layerEl) {
    layerEl.hidden = true;
  }
  if (aboveEl) {
    aboveEl.hidden = true;
    aboveEl.textContent = '';
    aboveEl.style.fontSize = '';
    aboveEl.style.maxWidth = '';
    aboveEl.style.textAlign = '';
    aboveEl.style.marginBottom = '';
    aboveEl.style.width = '';
  }
  if (valueEl) {
    valueEl.classList.remove('code-value--secret');
    valueEl.textContent = '';
    valueEl.style.fontSize = '';
    valueEl.style.lineHeight = '';
  }
  if (innerEl) {
    innerEl.style.width = '';
    innerEl.style.alignItems = '';
    innerEl.style.webkitTextStroke = '';
    innerEl.dataset.stroke = 'off';
  }
  if (textEl) {
    textEl.style.width = '';
    textEl.style.height = '';
  }
};

/**
 * Updates widget UI from server payload.
 * @param payload - Display state from worker.
 */
const applyPayload = (payload: DisplayPayload): void => {
  if (payload.visible && payload.display) {
    const key = displayKey(payload.display);
    if (key === renderedDisplayKey) {
      return;
    }
    renderedDisplayKey = key;
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
