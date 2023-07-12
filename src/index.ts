import { App, LogLevel, GenericMessageEvent } from '@slack/bolt';

const app = new App({
  logLevel: LogLevel.INFO, // デバッグするときには DEBUG に変更
  socketMode: true,
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  appToken: process.env.SLACK_APP_TOKEN,
});

// チャンネルマップインフォbotのコマンド操作の確認
app.message(/^!ch-help/, async ({ message, say }) => {
  const m = message as GenericMessageEvent;
  await say(
    `!ch-fetch 現在のチャンネル一覧の情報を所得する。すでに取得済みであれば取得しない。\n`,
  );
});

// チャンネル一覧を取得するコマンド
app.message(/^\!ch-fetch/, async ({ message, say }) => {
  const m = message as GenericMessageEvent;
  const channels = await fetchChannelList();
  console.log(channels);
  await say(
    `<@${m.user}>さんの指示で、Slackからチャンネルリストを取得してファイル保存しました。`,
  );
});

/**
 * チャンネル一覧をSlackより取得し、cursorを使ったものをまとめて結合する
 * @return Promise.<Object[]>
 */
async function fetchChannelList() {
  let cursor;
  let channels: any[] = [];

  do {
    const res = await app.client.conversations.list({
      cursor: cursor,
      exclude_archived: true,
      limit: 1000,
      types: 'public_channel',
    });

    if (res.ok && res.response_metadata) {
      cursor = res.response_metadata.next_cursor;
      channels = channels.concat(res.channels);
    } else {
      console.error(
        '[ERROR] 正しくconversations.list APIが利用できませんでした。 res:',
      );
      console.error(res);
    }
  } while (cursor);

  return { channels };
}

(async () => {
  await app.start();
})();
