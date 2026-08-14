# tools

ブラウザだけで動く小さな道具を置いている場所です。
特記のないものはクライアントサイドで完結し、ファイルはサーバーに送信されません。

例外はタスクボードで、これだけは自分で用意したGoogle Apps Script経由で
自分のGoogleドライブの台帳を読み書きします（詳細は `タスクボード.md`）。

公開URL: https://akiranakachi-eng.github.io/tools/

| ツール | URL | 説明 |
|---|---|---|
| PDF編集 | [pdf.html](https://akiranakachi-eng.github.io/tools/pdf.html) | PDFへの書き込み・ページ整理・文字の差し替え |
| タスクボード | [taskboard.html](https://akiranakachi-eng.github.io/tools/taskboard.html) | 出先からタスクの確認と回答（iPhoneのホーム画面に追加して使う想定） |
| 日報 | [nippou.html](https://akiranakachi-eng.github.io/tools/nippou.html) | 各部屋の日報と、記録室が数えたカード・トークン・金額の一覧（読むだけ） |

各ツールの詳しい使い方・制限は、対応するドキュメント（例: `PDF編集.md`）を参照してください。

日報のページ（`nippou.html`）だけは手で書いたものではありません。
PC側の道具 `ktok-tools\nippou\build_nippou.py` が記録室の資料を読んで組み立てたものです。
**中身を直すときは、このHTMLではなくその道具のほうを直してください。**
次に組み立て直したときに、手で入れた直しは消えます。
