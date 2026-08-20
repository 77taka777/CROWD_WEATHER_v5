# CROWD WEATHER v5.3

混雑と暑熱を「予報」に変えるイベント安全プラットフォーム。
ひとつの予報エンジン（NOAA太陽位置 × 影投影 × WBGT × Fruin密度）を、**制作・現場・来場者**の3つのレンズで使う。

- 本番: https://crowd-weather-v5-77taka777.vercel.app/

## 構成

```
index.html        … アプリ本体（単一ファイル・ビルド不要）
api/generate.js   … 文書生成: 汎用LLM APIプロキシ（OpenAI互換・環境変数で差し替え）
api/opendata.js   … 東京都オープンデータ連携（給水スポット=CKAN API / 避難場所=CSV）
```

## v5.3 の変更点

1. **避難場所（災害時）の東京都オープンデータ連携を追加**: 給水スポットと同じ
   `/api/opendata` に `kind=evac` を追加。東京都オープンデータの「指定緊急避難場所」を
   サーバー側で取得（CSVを解析・Shift-JIS対応・列名を自動判定）し、会場からの
   **避難方向・距離**つきでレーダー表示。主催ビューのパネルは「給水スポット / 避難場所」
   タブで切替、現場向け（モバイル）ビューには最寄り避難場所の案内を追加。
   取得失敗時は会場周辺（有明）の実データにフォールバック。
2. **ラベル変更**: 会場図の「PA卓」→「総合管理棟」。3レンズを
   「主催（PC）」「現場向け（タブレット）」「現場向け（モバイル）」に変更。
3. **現場向け（タブレット）ビューをタブレット筐体で表示**: ベゼル・インカメラ・
   ステータスバー（時刻／日付／Wi-Fi／バッテリー）・ホームインジケータつきの
   端末モックの中に画面を収め、内側だけがスクロールする。実際の現場端末で
   見たときの見え方がそのまま伝わる。幅720px以下では筐体を外してフラット表示。
   筐体ぶん内側が狭くなるため、ビュー内のレイアウト分岐は約80px前倒し。
4. **主催ビューのコピー修正**: 連携説明を「実況を反映→過去の気象（Open-Meteo）・
   東京都オープンデータをAPI連携済み」に、オープンデータ枠の見出しを
   「TOKYO OPEN DATA ── もしもの時の避難・給水運営計画まで自動生成」に変更。
   給水／避難タブの折り返しも解消。

## v5.2 の変更点

1. **AI生成の表示を明確化**: AIが実際に使われた場合のみバッジが
   「AI生成（オンライン動作）── モデル名」になり、それ以外は
   「ルールベース生成（オフライン動作）」のまま。
2. **指示文の品質向上**: 読み手（制作担当/現場スタッフ/来場者）別に
   プロンプトを最適化。■見出し＋1行1アクション・曖昧語禁止・数値は予報値のみ。
3. **APIキー保護を強化**: キーはVercelの環境変数のみに保存（公開リポジトリ・
   フロントエンドには一切置かない）。さらに `/api/generate` にオリジン制限と
   レート制限（10回/分/IP）を追加し、第三者による無料枠の浪費を防止。
4. **「昨年同日・一昨年同日」の基準日バグ修正**: 再現後の日付ではなく、
   ユーザーが選んだ開催日（基準日）から常に算出。ボタンに実際の日付を表示。

## v5.1 の変更点

1. **東京都オープンデータ連携**
   - 東京都水道局「Tokyowater Drinking Station 一覧」（CC BY 4.0）を
     東京都オープンデータカタログの CKAN API からライブ取得し、
     会場周辺の給水スポットを距離・方位つきで表示（制作向け・来場者向け）。
   - 「実測・過去の気象を反映」: Open-Meteo Historical Weather API (ERA5) で
     過去日（昨年同日・一昨年同日・任意日）の実測気象を予報エンジンに再現。
     太陽位置・影・WBGTも日付連動で再計算される。16日先までの予報値の反映にも対応。
2. **LLMを汎用API化**: OrcaRouter依存を廃止し、OpenAI互換の任意プロバイダに
   環境変数だけで接続（既定: Google Gemini）。
3. **審査向けページを削除**（3レンズ構成に）。
4. **スタッフ最適配置マップ**: 現場向けに、警備・誘導・ゲート・救護の
   時間帯別最適配置をマップ＋積み上げバーで可視化（時間スクラバー連動）。

## 環境変数（Vercel → Settings → Environment Variables）

| 変数 | 必須 | 既定値 | 説明 |
|---|---|---|---|
| `LLM_API_KEY` | ○ | ― | LLMのAPIキー（`GEMINI_API_KEY` / `OPENAI_API_KEY` でも可） |
| `LLM_BASE_URL` | ― | Gemini OpenAI互換エンドポイント | OpenAI互換のベースURL |
| `LLM_MODEL` | ― | `gemini-3.7-flash`（不可時 `gemini-2.5-flash`） | モデル名 |

プロバイダ例:

| プロバイダ | LLM_BASE_URL | LLM_MODEL例 |
|---|---|---|
| Google Gemini（既定） | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.7-flash` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `google/gemini-2.5-flash` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |

| `ALLOWED_ORIGINS` | ― | ―（`*.vercel.app`/localhostは常に許可） | 独自ドメイン利用時に許可するホスト名（カンマ区切り） |

キー未設定でもアプリは動作し、文書生成はルールベースに自動フォールバックする。

### AI生成を有効にする手順（無料・約2分）

1. [Google AI Studio](https://aistudio.google.com/apikey) で「APIキーを作成」（Googleアカウントがあれば無料）
2. Vercel → プロジェクト `crowd-weather-v5-77taka777` → **Settings → Environment Variables**
3. Key: `LLM_API_KEY` ／ Value: 発行したキー ／ Environment: All にして **Save**
4. **Deployments** タブ → 最新デプロイの「…」→ **Redeploy**

### セキュリティ

- APIキーは**サーバー側（Vercel環境変数）のみ**。公開リポジトリ・HTML・
  ブラウザからは一切見えない。フロントは `/api/generate` を呼ぶだけ。
- `/api/generate` はオリジン制限（自サイト以外のWebページからの呼び出しを拒否）
  ＋レート制限（10回/分/IP）つき。
- Gemini無料枠の範囲で運用可能（超過しても自動課金されない・キー未設定/失敗時は
  ルールベース生成に自動フォールバック）。

## データソース / クレジット

- 東京都水道局「Tokyowater Drinking Station 一覧」（東京都オープンデータカタログ, CC BY 4.0）
  https://catalog.data.metro.tokyo.lg.jp/dataset/t000019d0000000003
- 東京都・特別区「指定緊急避難場所」（東京都オープンデータ, CC BY 4.0）
  https://catalog.data.metro.tokyo.lg.jp/dataset?q=指定緊急避難場所
- Open-Meteo（実況 / Historical Weather API・ERA5）
- 太陽位置: NOAA式 ／ WBGT: Stull(2011)近似＋環境省区分 ／ 密度: Fruin基準
