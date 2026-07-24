export type RewardRounding = 'integer' | 'tenths' | 'hundredths';

export type WidgetParams = {
  enabled?: boolean;
  code_length?: number;
  code_use_letters?: boolean;
  code_use_digits?: boolean;
  code_use_special?: boolean;
  code_special_chars?: string;
  case_sensitive?: boolean;
  margin_min?: number;
  margin_max?: number;
  rotation_min?: number;
  rotation_max?: number;
  font_size_min?: number;
  font_size_max?: number;
  font_family?: string;
  font_family_custom?: string;
  text_color?: string;
  stroke_color?: string;
  stroke_width?: number;
  /**
   * When enabled, each code character is masked and briefly revealed one at a time.
   */
  secret_mode?: boolean;
  /** Optional caption shown above the promo code. */
  code_above_text?: string;
  /**
   * Font-size multiplier for the above-code caption relative to the promo code.
   * Stored as a string select value (e.g. `"0.5"`).
   */
  code_above_text_size?: string;
  /** Horizontal alignment of the above-code caption (`left` | `center` | `right`). */
  code_above_text_align?: string;
  /** Bottom margin (px) between the above-code caption and the promo code. */
  code_above_text_margin?: number;
  reward_min?: number;
  reward_max?: number;
  reward_rounding?: RewardRounding;
  interval_min_minutes?: number;
  interval_max_minutes?: number;
  duration_min_seconds?: number;
  duration_max_seconds?: number;
  success_message?: string;
  send_timeout_message?: boolean;
  timeout_message?: string;
};

export type TextAnchor =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export type TextAlign = 'left' | 'center' | 'right';

export type CodeDisplayStyle = {
  code: string;
  /** Optional caption rendered above the promo code. */
  aboveText: string;
  /**
   * Font-size multiplier for `aboveText` relative to `fontSize`.
   * @example 0.5 means half the promo-code font size.
   */
  aboveTextSizeMultiplier: number;
  /** Horizontal alignment of the above-code caption. */
  aboveTextAlign: TextAlign;
  /** Bottom margin in px between the caption and the promo code. */
  aboveTextMarginBottom: number;
  x: number;
  y: number;
  anchor: TextAnchor;
  rotation: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  /**
   * When true, the widget masks each character and briefly reveals them one by one.
   */
  secretMode: boolean;
};

export type DisplayPayload = {
  visible: boolean;
  display: CodeDisplayStyle | null;
};

export type ChallengePhase = 'idle' | 'showing';
