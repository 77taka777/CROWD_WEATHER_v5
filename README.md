# CROWD WEATHER v5.1

混雑と暑熱を「予報」に変えるイベント安全プラットフォーム。
ひとつの予報エンジン（NOAA太陽位置 × 影投影 × WBGT × Fruin密度）を、**制作・現場・来場者**の3つのレンズで使う。

- 本番: https://crowd-weather-v5-77taka777.vercel.app/

## 構成

```
index.html        … アプリ本体（単一ファイル・ビルド不要）
api/generate.js   … 文書生成: 汎用LLM APIプロキシ（OpenAI互換・環境変数で差し替え）
api/opendata.js   … 東京都オープンデータ連携（都営給水スポット / CKAN API）
```

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

キー未設定でもアプリは動作し、文書生成はルールベースに自動フォールバックする。

## データソース / クレジット

- 東京都水道局「Tokyowater Drinking Station 一覧」（東京都オープンデータカタログ, CC BY 4.0）
  https://catalog.data.metro.tokyo.lg.jp/dataset/t000019d0000000003
- Open-Meteo（実況 / Historical Weather API・ERA5）
- 太陽位置: NOAA式 ／ WBGT: Stull(2011)近似＋環境省区分 ／ 密度: Fruin基準
