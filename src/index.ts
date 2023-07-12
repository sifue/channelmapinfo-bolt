import { App, LogLevel, GenericMessageEvent } from '@slack/bolt';
import fs from 'node:fs/promises';

const CHANNELS_LOG = 'channels_log';
const UPLOAD_FOLDER = './uploads/';

(async () => {
  // チャンネルリストログの保存フォルダ作成
  if (!(await checkFileExists(CHANNELS_LOG))) {
    await fs.mkdir(CHANNELS_LOG);
  }
})();

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

  const datestring = getDateString(new Date());
  const filename = `${CHANNELS_LOG}/${datestring}.json`;

  if (await checkFileExists(filename)) {
    await say(`すでに本日 {datestring} のチャンネルリストは取得済みです。`);
  } else {
    await say(
      `<@${m.user}>さんの指示で、Slackからチャンネルリストを取得を開始します。`,
    );
    const channels = await fetchChannelList();
    // チャンネルリストログの保存フォルダ作成
    await fs.writeFile(filename, JSON.stringify(channels));
    await say(
      `<@${m.user}>さんの指示で、Slackからチャンネルリストを取得してファイル保存しました。`,
    );
  }
});

/**
 * ファイルの存在を確認する
 * @param filePath ファイルパス
 * @returns
 */
async function checkFileExists(filePath: string) {
  try {
    await fs.access(filePath, fs.constants.F_OK);
    return true; // ファイルが存在した場合、真を返します
  } catch {
    return false; // ファイルが存在しない場合、偽を返します
  }
}

/**
 * Date型の日付より、YYYY-MM-DDの形式の文字列を返す
 * @param date 日付
 * @returns
 */
function getDateString(date: Date) {
  const str = date
    .toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    .split('/')
    .join('-');
  return str;
}

/**
 * チャンネル一覧をSlackより取得し、cursorを使ったものをまとめて結合する
 * @return Promise.<Object[]>
 */
async function fetchChannelList() {
  let cursor;
  let channels: any[] = [];

  let count = 1;
  do {
    console.log(
      `[INFO] conversations.list APIを実行します。 count: ${count++}`,
    );
    // API ドキュメント https://api.slack.com/methods/conversations.list
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
