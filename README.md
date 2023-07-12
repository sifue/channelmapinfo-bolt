# チャンネルマップインフォ bot Bolt版

## 概要

- 毎日のチャンネルの参加者数増減を教えてくれる機能
- times チャンネルのランキングを教えてくれる機能

以上を提供するBoltで実装されたSlackBotです。

内部的に https://api.slack.com/methods/conversations.list このAPIを使用しています。

## コマンド一覧

- \`!ch-help\` ボットの利用方法を表示。
- \`!ch-report\` 本日のチャンネル人数の日次変化レポートを表示します。
- \`!ch-fetch\` 本日のチャンネル一覧の情報をサーバー上に取得します。すでに取得済みであれば取得しません。
- \`!ch-fetrep\` チャンネル情報を取得後、本日のチャンネル人数の日次変化レポートを表示します。

## 使い方

Node.js v18.13.0 で動作確認。

```
npm install
npm run build
env SLACK_BOT_TOKEN=xxxxx SLACK_APP_TOKEN=xxxxx node dist/index.js
```

## 定期実行のやり方

基本的にSlackbotのreminderを利用した投稿を前提とする。指定したチャンネルにボットを招待した後、

```
/remind #sifue_bot_test “!ch-fetrep” at 6:00am
```

以上でSlackbotは、

```
リマインダー : !ch-fetrep.
```

という予約投稿を指定された日時に投稿をするため、それに合わせてbotが動作することを前提とする。
この投稿で現在のチャンネル一覧の取得と、前回の投稿からの増減のレポートを行う。

# Slack アプリケーションの作成方法

https://qiita.com/seratch/items/1a460c08c3e245b56441 以上を参考に、WebSocket モードでアプリケーションを作成

# Bot Token Scope の設定 (OAuth & Permissions)

- chat:write
- channels:read
- groups:read
- im:read
- mpim:read
- files:write

# Event Subscription の設定 (Event Subscriptions)

- message.channels
- message.groups
- message.im
- message.mpim
