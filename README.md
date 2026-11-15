# FUMIYA STYLE 公式サイト（fumiya-style.com）

## 構成
| 部分 | 仕組み |
|---|---|
| トップ・各事業ページ | `public/` の静的HTML（`design/*.dc.html` から `tools/build.py` で生成） |
| `/branding/`・`/branding/works/`・記事ページ・`/sitemap.xml` | Netlify Function `netlify/functions/works.mjs` がその場で生成 |
| 記事データ・画像 | Netlify Blobs（本番：`works` / `works-media`、プレビュー：`works-preview` / `works-media-preview`） |
| 画像配信 | `netlify/functions/media.mjs`（公開中の記事の画像だけ一般公開） |
| 管理画面 | `public/admin/`（`/admin/`）＋ API `netlify/functions/admin-api.mjs`（`/api/admin/*`） |
| 問い合わせ | Netlify Forms（`contact`）。記事から来た場合は `source_page` に記事URLが入る |

記事の公開・更新は Blobs の書き換えだけで反映され、サイトの再デプロイは不要（デプロイ1回=15クレジットを消費しない）。

## 必要な設定
- Netlify の環境変数 `ADMIN_PASSWORD`（8文字以上）。管理画面のログインに使用。変更すると全端末がログアウトされる。

## デプロイの流れ
- `preview` ブランチ → ブランチデプロイ（0クレジット）で確認。プレビュー用の別の保存先を使うので本番記事に影響しない。
- 問題がなければ `main` に反映 → 本番デプロイ（15クレジット）。

## 静的ページを直すとき
```
python3 tools/build.py design public https://fumiya-style.com
```

## テスト
```
ADMIN_PASSWORD=test-pass-1234 node tools/dev-server.mjs 8787 &
npm test                                   # サーバー側のルール（認証・下書き非公開・予約・URL など）
node tests/e2e-mobile.mjs http://localhost:8787 <画像フォルダ> <スクショ保存先>   # iPhone幅の操作
```

## バックアップ・復元
- 管理画面 → ⋯ → 「バックアップ・復元」→ JSON をダウンロード（全記事の文章・設定・画像URL一覧）。
- 同じ画面で JSON を選ぶと復元（同じ記事は上書き）。
- 記事を保存するたびに、変更前の版が内部記録（`rev/<記事ID>/<版>`）として残る。削除した下書きも `deleted/<記事ID>` に残る。

## 運用ルール（実装済み）
- サンプル（ひな形）は公開不可・一覧／サイトマップ対象外。複製すると必ず下書き・別URLになる。
- 「ここに〜を記入」の案内文が残っていると公開できない。
- 公開日時は日本時間で指定。未来の日時で公開操作すると予約投稿（時刻を過ぎてから最大5分程度で表示）。
- 更新日は、公開中の記事の本文などを実際に変えたときだけ動く（日付だけの変更では動かない）。
- 公開後にURLを変えると、古いURLは新しいURLへ301転送。
- robots.txt：検索・AIクローラーとも既存どおり許可。`/admin/`・`/api/` は除外。学習用クローラーの扱いは要相談。
