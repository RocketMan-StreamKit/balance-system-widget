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

export type CodeDisplayStyle = {
  code: string;
  x: number;
  y: number;
  anchor: TextAnchor;
  rotation: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  strokeColor: string;
  strokeWidth: number;
};

export type DisplayPayload = {
  visible: boolean;
  display: CodeDisplayStyle | null;
};

export type ChallengePhase = 'idle' | 'showing';
