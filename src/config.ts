/** Default success chat message template. */
const DEFAULT_SUCCESS_MESSAGE =
  '@{login} указал код! На счёт записано {amount} {currency}.';

/** Default timeout chat message template. */
const DEFAULT_TIMEOUT_MESSAGE = 'Время вышло — никто не указал код.';

/** Default special characters for code generation. */
const DEFAULT_SPECIAL_CHARS = '!@#$%&*?';

/**
 * Registers addon settings schema in StreamKit+.
 * @returns {Promise<void>}
 */
export const registerWidgetConfig = async (): Promise<void> => {
  const schema: AddonConfigSchema = [
    {
      key: 'code_section',
      type: 'info',
      editor: {
        label: {
          en: 'Code format',
          ru: 'Формат кода',
          uk: 'Формат коду',
        },
        description: {
          en: 'Length and character set for codes shown on stream.',
          ru: 'Длина и набор символов для кодов на экране.',
          uk: 'Довжина та набір символів для кодів на екрані.',
        },
      },
    },
    [
      {
        key: 'code_length',
        type: 'number',
        default: 4,
        editor: {
          label: { en: 'Length', ru: 'Длина', uk: 'Довжина' },
          validation: { min: 1, max: 32 },
        },
      },
      {
        key: 'code_use_letters',
        type: 'boolean',
        default: true,
        editor: {
          label: { en: 'Letters', ru: 'Буквы', uk: 'Літери' },
        },
      },
      {
        key: 'code_use_digits',
        type: 'boolean',
        default: true,
        editor: {
          label: { en: 'Digits', ru: 'Цифры', uk: 'Цифри' },
        },
      },
    ],
    [
      {
        key: 'code_use_special',
        type: 'boolean',
        default: false,
        editor: {
          label: { en: 'Special chars', ru: 'Спецсимволы', uk: 'Спецсимволи' },
        },
      },
      {
        key: 'code_special_chars',
        type: 'text',
        default: DEFAULT_SPECIAL_CHARS,
        editor: {
          label: {
            en: 'Special charset',
            ru: 'Набор спецсимволов',
            uk: 'Набір спецсимволів',
          },
        },
      },
    ],
    {
      key: 'case_sensitive',
      type: 'boolean',
      default: false,
      editor: {
        label: {
          en: 'Case sensitive match',
          ru: 'Учитывать регистр',
          uk: 'Враховувати регістр',
        },
      },
    },
    {
      key: 'display_section',
      type: 'info',
      editor: {
        label: {
          en: 'On-screen appearance',
          ru: 'Внешний вид на экране',
          uk: 'Зовнішній вигляд на екрані',
        },
        description: {
          en: 'Position, rotation, font, and colors for the on-screen code.',
          ru: 'Позиция, поворот, шрифт и цвета кода на экране.',
          uk: 'Позиція, поворот, шрифт і кольори коду на екрані.',
        },
      },
    },
    [
      {
        key: 'margin_min',
        type: 'number',
        default: 5,
        editor: {
          label: {
            en: 'Min edge margin (%)',
            ru: 'Мин. отступ от края (%)',
            uk: 'Мін. відступ від краю (%)',
          },
          validation: { min: 0, max: 45 },
        },
      },
      {
        key: 'rotation_min',
        type: 'number',
        default: -15,
        editor: {
          label: {
            en: 'Rotation from (°)',
            ru: 'Поворот от (°)',
            uk: 'Поворот від (°)',
          },
          validation: { min: -180, max: 180 },
        },
      },
      {
        key: 'rotation_max',
        type: 'number',
        default: 15,
        editor: {
          label: {
            en: 'Rotation to (°)',
            ru: 'Поворот до (°)',
            uk: 'Поворот до (°)',
          },
          validation: { min: -180, max: 180 },
        },
      },
    ],
    [
      {
        key: 'font_size_min',
        type: 'number',
        default: 48,
        editor: {
          label: {
            en: 'Font size from (px)',
            ru: 'Размер шрифта от (px)',
            uk: 'Розмір шрифту від (px)',
          },
          validation: { min: 8, max: 400 },
        },
      },
      {
        key: 'font_size_max',
        type: 'number',
        default: 72,
        editor: {
          label: {
            en: 'Font size to (px)',
            ru: 'Размер шрифта до (px)',
            uk: 'Розмір шрифту до (px)',
          },
          validation: { min: 8, max: 400 },
        },
      },
    ],
    {
      key: 'font_family',
      type: 'select',
      default: 'system',
      options: [
        {
          value: 'system',
          label: { en: 'System UI', ru: 'Системный', uk: 'Системний' },
        },
        {
          value: 'arial',
          label: { en: 'Arial', ru: 'Arial', uk: 'Arial' },
        },
        {
          value: 'georgia',
          label: { en: 'Georgia', ru: 'Georgia', uk: 'Georgia' },
        },
        {
          value: 'courier',
          label: { en: 'Courier', ru: 'Courier', uk: 'Courier' },
        },
        {
          value: 'impact',
          label: { en: 'Impact', ru: 'Impact', uk: 'Impact' },
        },
        {
          value: 'custom',
          label: { en: 'Custom', ru: 'Свой', uk: 'Власний' },
        },
      ],
      editor: {
        label: { en: 'Font', ru: 'Шрифт', uk: 'Шрифт' },
      },
    },
    {
      key: 'font_family_custom',
      type: 'text',
      default: 'Arial, sans-serif',
      editor: {
        label: {
          en: 'Custom font family',
          ru: 'Свой шрифт (CSS)',
          uk: 'Власний шрифт (CSS)',
        },
        description: {
          en: 'Used when Font is set to Custom',
          ru: 'Используется при выборе «Свой»',
          uk: 'Використовується при виборі «Власний»',
        },
      },
    },
    [
      {
        key: 'text_color',
        type: 'color',
        default: '#ffffff',
        editor: {
          label: { en: 'Text color', ru: 'Цвет текста', uk: 'Колір тексту' },
        },
      },
      {
        key: 'stroke_color',
        type: 'color',
        default: '#000000',
        editor: {
          label: { en: 'Stroke color', ru: 'Цвет обводки', uk: 'Колір обводки' },
        },
      },
      {
        key: 'stroke_width',
        type: 'number',
        default: 0,
        editor: {
          label: {
            en: 'Stroke width (px)',
            ru: 'Толщина обводки (px)',
            uk: 'Товщина обводки (px)',
          },
          validation: { min: 0, max: 20 },
        },
      },
    ],
    {
      key: 'reward_section',
      type: 'info',
      editor: {
        label: {
          en: 'Reward',
          ru: 'Награда',
          uk: 'Нагорода',
        },
        description: {
          en: 'Random balance amount credited to the viewer who types the code.',
          ru: 'Случайная сумма баланса для зрителя, указавшего код.',
          uk: 'Випадкова сума балансу для глядача, який вказав код.',
        },
      },
    },
    [
      {
        key: 'reward_min',
        type: 'number',
        default: 1,
        editor: {
          label: {
            en: 'Amount from',
            ru: 'Сумма от',
            uk: 'Сума від',
          },
          validation: { min: 0.01 },
        },
      },
      {
        key: 'reward_max',
        type: 'number',
        default: 5,
        editor: {
          label: {
            en: 'Amount to',
            ru: 'Сумма до',
            uk: 'Сума до',
          },
          validation: { min: 0.01 },
        },
      },
    ],
    {
      key: 'timing_section',
      type: 'info',
      editor: {
        label: {
          en: 'Timing',
          ru: 'Тайминги',
          uk: 'Таймінги',
        },
        description: {
          en: 'How often codes appear and how long they stay visible.',
          ru: 'Как часто появляются коды и сколько они видны.',
          uk: 'Як часто з’являються коди та скільки вони видимі.',
        },
      },
    },
    [
      {
        key: 'interval_min_minutes',
        type: 'number',
        default: 5,
        editor: {
          label: {
            en: 'Interval from (min)',
            ru: 'Интервал от (мин)',
            uk: 'Інтервал від (хв)',
          },
          validation: { min: 0.1 },
        },
      },
      {
        key: 'interval_max_minutes',
        type: 'number',
        default: 10,
        editor: {
          label: {
            en: 'Interval to (min)',
            ru: 'Интервал до (мин)',
            uk: 'Інтервал до (хв)',
          },
          validation: { min: 0.1 },
        },
      },
    ],
    [
      {
        key: 'duration_min_seconds',
        type: 'number',
        default: 30,
        editor: {
          label: {
            en: 'Display from (sec)',
            ru: 'Показ от (сек)',
            uk: 'Показ від (сек)',
          },
          validation: { min: 1 },
        },
      },
      {
        key: 'duration_max_seconds',
        type: 'number',
        default: 60,
        editor: {
          label: {
            en: 'Display to (sec)',
            ru: 'Показ до (сек)',
            uk: 'Показ до (сек)',
          },
          validation: { min: 1 },
        },
      },
    ],
    {
      key: 'messages_section',
      type: 'info',
      editor: {
        label: {
          en: 'Chat messages',
          ru: 'Сообщения в чат',
          uk: 'Повідомлення в чат',
        },
        description: {
          en: 'Messages sent to Twitch chat on success or timeout.',
          ru: 'Сообщения в чат Twitch при успехе или по таймауту.',
          uk: 'Повідомлення в чат Twitch при успіху або за таймаутом.',
        },
      },
    },
    {
      key: 'success_message',
      type: 'text',
      default: DEFAULT_SUCCESS_MESSAGE,
      editor: {
        label: {
          en: 'Success message',
          ru: 'Сообщение при успехе',
          uk: 'Повідомлення при успіху',
        },
        description: {
          en: 'Placeholders: {login}, {amount}, {currency}',
          ru: 'Подстановки: {login}, {amount}, {currency}',
          uk: 'Підстановки: {login}, {amount}, {currency}',
        },
      },
    },
    {
      key: 'send_timeout_message',
      type: 'boolean',
      default: false,
      editor: {
        label: {
          en: 'Send message on timeout',
          ru: 'Сообщение при истечении времени',
          uk: 'Повідомлення при закінченні часу',
        },
      },
    },
    {
      key: 'timeout_message',
      type: 'text',
      default: DEFAULT_TIMEOUT_MESSAGE,
      editor: {
        label: {
          en: 'Timeout message',
          ru: 'Сообщение при таймауте',
          uk: 'Повідомлення при таймауті',
        },
      },
    },
    {
      key: 'enabled',
      type: 'boolean',
      default: true,
      editor: {
        label: {
          en: 'Challenge active',
          ru: 'Челлендж включён',
          uk: 'Челендж увімкнено',
        },
      },
    },
    {
      key: 'show_code_now',
      type: 'button',
      event: 'onShowCodeNow',
      editor: {
        label: {
          en: 'Show code now',
          ru: 'Отобразить код сейчас',
          uk: 'Показати код зараз',
        },
        description: {
          en: 'Display a code on the widget immediately, without waiting for the interval.',
          ru: 'Показать код на виджете сразу, без ожидания интервала.',
          uk: 'Показати код на віджеті одразу, без очікування інтервалу.',
        },
      },
    },
  ];

  await GenerateConfig(schema);
};

export { DEFAULT_SUCCESS_MESSAGE, DEFAULT_TIMEOUT_MESSAGE, DEFAULT_SPECIAL_CHARS };
