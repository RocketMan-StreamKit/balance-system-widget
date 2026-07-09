# Виджет для системы баланса зрителей

StreamKit+ widget addon for the **[viewer balance system](https://github.com/RocketMan-StreamKit/balance-system)**. Shows a random code on stream; Twitch chat users who type the exact code earn balance credited through the balance addon.

- **Addon id:** `balance-system-widget`
- **Type:** `widget`
- **Depends on:** `balance-system`, `twitch`
- **Minimum StreamKit+:** `1.0.25`

## Features

- Random code on screen (length, charset: letters / digits / special symbols)
- Random position, rotation, and font size within configured ranges
- Text color and optional stroke
- Listens to **Twitch** chat via StreamKit+ dashboard API
- Credits balance through `balance-system` RPC (`creditBalance`)
- Sends result messages to Twitch chat via `twitch` RPC (`sendChatMessage`)
- Configurable spawn interval and display duration (random ranges)
- Optional timeout chat message when nobody claims the code

## Requirements

1. Install and enable **balance-system** and **twitch** addons.
2. In balance-system settings, enable **Allow other addons to credit balance**.
3. Authorize Twitch (and optional bot) for chat send.
4. Add the widget to your overlay (OBS browser source or overlay app window).

## Development

```bash
npm install
npm run build
```

Install the `dist/` folder in **StreamKit+ → Settings → Widgets**.

## Settings overview

| Group | Options |
| --- | --- |
| Code format | Length, letters, digits, special chars, case sensitivity |
| Appearance | Margin, rotation, font size range, font, colors, stroke |
| Reward | Random amount range, rounding (whole / tenths / hundredths) |
| Timing | Spawn interval (minutes), display duration (seconds) |
| Chat | Success / timeout message templates |

Success message placeholders: `{login}`, `{amount}`, `{currency}`.

## Release

Push to `main` or run the **Release addon** GitHub Action. Tag `v{version}` from `manifest.json`.

Docs: [StreamKit+ addon developer docs](https://rocketman-streamkit.github.io/types/)
