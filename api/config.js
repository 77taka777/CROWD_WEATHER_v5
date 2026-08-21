/* ============================================================
   /api/config ── フロントエンド用の公開設定
   ------------------------------------------------------------
   Google Maps JavaScript API キーをサーバー側（環境変数）から
   同一オリジンのフロントへ渡す。キーはHTTPリファラー制限を
   前提に配布する（Maps JS API の通常運用）。未設定なら空文字を
   返し、フロントはSVGレーダー表示にフォールバックする。

   環境変数: GOOGLE_MAPS_API_KEY
   ============================================================ */
export default function handler(req, res) {
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY || "";
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
  return res.status(200).json({ mapsKey });
}
