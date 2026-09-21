# tools

ブラウザだけで動く小さな道具を置いている場所です。

公開URL: https://negilab.github.io/tools/

## いま置いてあるもの

- 動画編集（`douga/`）
- PDFマスクツール 体験版（`pdfmask/`）

以前あったPDF編集・タスクボード・日報は削除しました。

## 構成

```
tools/
├── index.html   ← ツール一覧のトップページ
├── README.md    ← このファイル
└── .nojekyll    ← Jekyll処理を飛ばす（消さないこと）
```

## ツールを足すときは

1. ツール本体のHTMLをこのディレクトリに置く
2. `index.html` にカードを1つ足す
3. 下の一覧に行を足す
4. 詳しい使い方・制限は、ツールごとの `〇〇.md` に書く

| ツール | URL | 説明 |
|---|---|---|
| 動画編集 | [/douga/](https://negilab.github.io/tools/douga/) | 音声を取り出す・切る・重ねる・文字起こし |
| PDFマスクツール 体験版 | [/pdfmask/](https://negilab.github.io/tools/pdfmask/) | 図面PDFの個人情報を伏せる。詳しくは [pdfmask.md](pdfmask.md) |

外部と通信するかどうかは道具ごとに違うので、**そのツール自身の説明に書いてください。**
リポジトリ全体で一律にこうだ、とは書かないようにします。
