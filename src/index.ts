import { App, LogLevel, GenericMessageEvent, SayFn } from '@slack/bolt';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';

const CHANNELS_LOG = 'channels_log';
const UPLOAD_FOLDER = './uploads/';

(async () => {
  // チャンネルリストログの保存フォルダ作成
  if (!(await checkFileExists(CHANNELS_LOG))) {
    await fs.mkdir(CHANNELS_LOG);
  }
  // アップロード用ファイル保存フォルダ作成
  if (!(await checkFileExists(UPLOAD_FOLDER))) {
    await fs.mkdir(UPLOAD_FOLDER);
  }
})();

/**
 * チャンネルを表す型
 */
type Channel = {
  id: string;
  num_members: number;
  name: string;
  is_new: boolean;
  diff_num_members: number;
  rank: number;
};

const app = new App({
  logLevel: LogLevel.INFO, // デバッグするときには DEBUG に変更
  socketMode: true,
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
});

// チャンネルマップインフォbotのコマンド操作の確認
app.message(/^!ch-help/, async ({ message, say }) => {
  const m = message as GenericMessageEvent;
  await say(
    `\`!ch-report\` 本日のチャンネル人数の日次変化レポートを表示します。\n` +
      `\`!ch-times-ranking\` timesが含まれるチャンネルのトップ100を表示します。\n` +
      `\`!ch-fetch\` 本日のチャンネル一覧の情報をサーバー上に取得します。すでに取得済みであれば取得しません。\n` +
      `\`!ch-fetrep\` チャンネル情報を取得後、本日のチャンネル人数の日次変化レポートを表示します。`,
  );
});

// チャンネル人数の日次変化レポートを取得する
app.message(/^\!ch-report/, async ({ message, say }) => {
  const m = message as GenericMessageEvent;
  report(m, say);
});

async function report(m: GenericMessageEvent, say: SayFn) {
  const channels = await createNumMembersDiff();
  // 増減数の降順でソート
  channels.sort((a, b) => {
    return b.diff_num_members - a.diff_num_members;
  });

  if (channels.length <= 100) {
    // 差分が100個以内ならリンク投稿、そうでないならファイル投稿
    const msg = createReportMessageWithLink(channels);
    await say(msg);
  } else {
    const fileUploadOption = await createReportMessageAsFile(channels);
    const option = {
      title: '本日のチャンネル人数の日次変化レポート',
      channels: m.channel,
      file: fsSync.createReadStream(fileUploadOption.csvFilename),
      filename: fileUploadOption.titlefilename,
      filetype: 'csv',
    };
    // 参考: https://api.slack.com/methods/files.upload
    await app.client.files.upload(option);
  }
}

// チャンネル一覧を取得するコマンド
app.message(/^\!ch-fetch/, async ({ message, say }) => {
  const m = message as GenericMessageEvent;
  fetch(m, say);
});

async function fetch(m: GenericMessageEvent, say: SayFn) {
  const datestring = getDateString(new Date());
  const filename = `${CHANNELS_LOG}/${datestring}.json`;

  if (await checkFileExists(filename)) {
    await say(
      `<@${m.user}>さんの指示をもらいましたが、すでに本日 ${datestring} のチャンネルリストは取得済みです。`,
    );
  } else {
    await say(
      `<@${m.user}>さんの指示で、Slackからチャンネルリストを取得を開始します。`,
    );
    const channels = await fetchChannelList();
    // チャンネルリストログの保存フォルダ作成
    await fs.writeFile(filename, JSON.stringify(channels));
    await say(
      `<@${m.user}>さんの指示で、Slackからチャンネルリストを取得し、ファイル保存しました。`,
    );
  }
}

// チャンネル一覧を取得後、レポートを送信するコマンド
app.message(/^(リマインダー : )*\!ch-fetrep(\.)*/, async ({ message, say }) => {
  const m = message as GenericMessageEvent;
  fetch(m, say);
  report(m, say);
});

// チャンネル一覧を取得するコマンド
app.message(/^\!ch-times-ranking/, async ({ message, say }) => {
  const m = message as GenericMessageEvent;
  const today = new Date();

  let channels = await loadChannelList(today);
  if (channels.length === 0) {
    // 本日が存在しない場合には昨日のチャンネルリストを取得
    channels = await loadChannelList(createYesterdayDate(today));
  }

  let rankedChannels = channels
    .filter((c) => c.name.includes('times'))
    .sort((a, b) => b.num_members - a.num_members)
    .slice(0, 100)
    .map((c, i) => {
      c.rank = i + 1;
      return c;
    });

  // 同数と同順位とする
  let pre_num_members = -1;
  let pre_rank = -1;
  for (let c of rankedChannels) {
    if (c.num_members === pre_num_members) {
      c.rank = pre_rank;
    }
    pre_num_members = c.num_members;
    pre_rank = c.rank;
  }

  const fields: any[] = [];
  const content = {
    text: '本日のtimesが含まれるチャンネルの参加者人数トップ100を表示します。',
    attachments: [{ fields: fields, color: '#658CFF' }],
  };

  fields.push(
    {
      title: 'timesランキング',
      short: true,
    },
    {
      title: 'チャンネル名',
      short: true,
    },
  );

  rankedChannels.forEach((c) => {
    fields.push({
      value: `第${c.rank}位 (${c.num_members}人)`,
      short: true,
    });
    fields.push({
      value: `<#${c.id}>`,
      short: true,
    });
  });

  await say(content);
});

type FileUploadOption = {
  csvFilename: string;
  titlefilename: string;
};

/**
 * レポートをCSVファイル形式で作成する
 * @param channels
 * @return 出力したCSVファイルパスの文字列を取得する
 */
async function createReportMessageAsFile(
  channels: Channel[],
): Promise<FileUploadOption> {
  let textdata = '"前日より変化したチャンネル","増減 (現在値)"';

  channels.forEach((c) => {
    textdata += '\n';
    textdata += c.is_new ? `"${c.name} (新規)",` : `"${c.name} ",`;
    textdata +=
      (c.diff_num_members > 0
        ? `"+${c.diff_num_members}`
        : `"${c.diff_num_members}`) + ` (${c.num_members})"`;
  });

  const titlefilename =
    getDateString(new Date()) + 'の前日より変化したチャンネル.csv';
  const csvFilename = UPLOAD_FOLDER + titlefilename;
  await fs.writeFile(csvFilename, textdata);

  return { csvFilename, titlefilename };
}

/**
 * レポートのメッセージをリンク形式で取得する
 * @param channels
 * @returns
 */
function createReportMessageWithLink(channels: Channel[]) {
  const fields: any[] = [];
  const msg = {
    text: '本日のチャンネル人数の日次変化レポートを表示します。',
    attachments: [{ fields: fields, color: '#658CFF' }],
  };

  fields.push(
    {
      title: '前日より変化したチャンネル',
      short: true,
    },
    {
      title: '増減 (現在値)',
      short: true,
    },
  );

  channels.forEach((c) => {
    fields.push({
      value: c.is_new ? `<#${c.id}> (新規)` : `<#${c.id}> `,
      short: true,
    });

    fields.push({
      value:
        (c.diff_num_members > 0
          ? `+${c.diff_num_members}`
          : `${c.diff_num_members}`) + ` (${c.num_members})`,
      short: true,
    });
  });

  return msg;
}

/**
 * 前日と今日のチャンネル人数のDiffを作成する
 * @return Promise.<Object[]>
 */
async function createNumMembersDiff(): Promise<Channel[]> {
  const today = new Date();
  const yesterdayChannels = await loadChannelList(createYesterdayDate(today));
  const yesterdayMap = new Map();
  yesterdayChannels.forEach((channel) => {
    const c = channel as Channel;
    yesterdayMap.set(c.id, c);
  });
  const todayChannels = await loadChannelList(today);

  const diffs: Channel[] = [];
  todayChannels.forEach((channel) => {
    const c = channel as Channel;
    if (yesterdayMap.has(c.id)) {
      const yesterdayChannel = yesterdayMap.get(c.id);
      // チャンネル人数に差があるチャンネルを属性足して追加
      if (c.num_members !== yesterdayChannel.num_members) {
        c.is_new = false;
        c.diff_num_members = c.num_members - yesterdayChannel.num_members;
        diffs.push(c);
      }
    } else {
      // 新規チャンネルもdiffに入れる
      c.is_new = true;
      c.diff_num_members = c.num_members;
      diffs.push(c);
    }
  });
  return diffs;
}

/**
 * 本日を指定して昨日(24時間前)のDateオブジェクトを取得する
 * @param today 本日とする日時のDate型
 */
function createYesterdayDate(today: Date) {
  const yesterday = new Date(today.getTime() - 1000 * 60 * 60 * 24);
  return yesterday;
}

/**
 * 本日のログファイルをローカルファイルをより取得する
 * ファイルが存在しない場合は、エラーを出力し、空配列を返す
 * @return Promise.<Channel[]>
 */
async function loadChannelList(date: Date): Promise<Channel[]> {
  const filename = CHANNELS_LOG + '/' + getDateString(date) + '.json';

  try {
    const data = await fs.readFile(filename, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    // ファイルが存在しない場合は、エラーを出力し、空配列を返す
    console.error(e);
    return [];
  }
}

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
async function fetchChannelList(): Promise<Object[]> {
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

  return channels;
}

(async () => {
  await app.start();
})();
