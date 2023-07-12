# チャンネルマップインフォ bot Bolt版

## 概要

- 毎日のチャンネルの参加者数増減を教えてくれる機能
- times チャンネルのランキングを教えてくれる機能
  以上を提供するBoltで実装されたSlackBotです。

内部的に https://api.slack.com/methods/conversations.list このAPIを使用しています。

## 使い方

Node.js v18.13.0 で動作確認。

```
npm install
npm run build
env SLACK_BOT_TOKEN=xxxxx SLACK_SIGNING_SECRET=xxxxx node dist/index.js
```

# Slack アプリケーションの作成方法

https://qiita.com/seratch/items/1a460c08c3e245b56441 以上を参考に、WebSocket モードでアプリケーションを作成

# Bot Token Scope の設定 (OAuth & Permissions)

- chat:write
- channels:read
- groups:read
- im:read
- mpim:read

# Event Subscription の設定 (Event Subscriptions)

- message.channels
- message.groups
- message.im
- message.mpim
