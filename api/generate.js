/* ============================================================
   /api/generate ── 汎用LLM API プロキシ（OpenAI互換）
   ------------------------------------------------------------
   OrcaRouter依存を廃止し、OpenAI互換のチャット補完APIなら
   どのプロバイダでも環境変数だけで差し替えられる汎用構成。

   セキュリティ:
   - APIキーはサーバー側の環境変数のみ（リポジトリ/フロントに置かない）
   - オリジン制限: 自サイト(*.vercel.app / localhost / ALLOWED_ORIGINS)以外の
     Webページからの呼び出しを403で拒否
   - レート制限: 10リクエスト/分/IP（無料枠の浪費防止）

   環境変数:
     LLM_API_KEY   … APIキー（必須。GEMINI_API_KEY / OPENAI_API_KEY でも可）
     LLM_BASE_URL  … OpenAI互換ベースURL（省略時: Google Gemini互換エンドポイント）
     LLM_MODEL     … モデル名（省略時: gemini-3.7-flash → 不可時 gemini-2.5-flash に自動フォールバック）

   例:
     Gemini     : 既定のまま LLM_API_KEY にAI Studioのキーを設定
     OpenAI     : LLM_BASE_URL=https://api.openai.com/v1
                  LLM_MODEL=gpt-4o-mini
     OpenRouter : LLM_BASE_URL=https://openrouter.ai/api/v1
                  LLM_MODEL=google/gemini-2.5-flash
     Groq       : LLM_BASE_URL=https://api.groq.com/openai/v1
   ============================================================ */

const DEFAULT_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_MODELS = ["gemini-3.7-flash", "gemini-2.5-flash"];

function promptFromBody(body) {
  if (typeof body?.prompt === "string" && body.prompt.trim()) {
    return body.prompt.trim();
  }

  if (Array.isArray(body?.messages)) {
    return body.messages
      .map((message) => {
        if (typeof message?.content === "string") return message.content;
        if (Array.isArray(message?.content)) {
          return message.content
            .map((part) => (typeof part?.text === "string" ? part.text : ""))
            .filter(Boolean)
            .join("\n");
        }
        return "";
      })
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  const ask = body?.ask || "警備計画・現場指示・来場者通知のいずれか";
  return [
    "あなたはイベント安全管理の専門家です。",
    "以下のJSONは、混雑・暑熱予報の実計算値です。このJSONだけを根拠にして、日本語で文書を作成してください。",
    "",
    `作成内容: ${ask}`,
    "",
    "条件:",
    "- JSONに存在する数値だけを使い、数値を捏造しない",
    "- 見出し付きの読みやすい文章にする",
    "- Markdown記法は使わない",
    "- 約600字から900字程度にまとめる",
    "- 現場でそのまま使える具体的な指示にする",
    "",
    "JSON:",
    JSON.stringify(body?.context || {}, null, 2),
  ].join("\n");
}

/* ---- 簡易保護: オリジン制限 + レート制限（無料枠の浪費・第三者利用を防ぐ） ---- */
const RATE = new Map(); // ip -> timestamps(ms)
function rateLimited(ip) {
  const now = Date.now();
  const arr = (RATE.get(ip) || []).filter((t) => now - t < 60_000);
  if (arr.length >= 10) {
    RATE.set(ip, arr);
    return true;
  }
  arr.push(now);
  RATE.set(ip, arr);
  if (RATE.size > 5000) RATE.clear(); // 念のためのメモリ上限
  return false;
}
function originAllowed(origin) {
  if (!origin) return true; // curl等Originなしは通す（キーは露出しない）
  try {
    const h = new URL(origin).hostname;
    if (h === "localhost" || h === "127.0.0.1") return true;
    if (h.endsWith(".vercel.app")) return true;
    const extra = (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return extra.some((d) => h === d || h.endsWith("." + d));
  } catch (_) {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (!originAllowed(req.headers.origin)) {
    return res.status(403).json({ error: "Forbidden origin" });
  }
  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anon";
  if (rateLimited(ip)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const apiKey =
    process.env.LLM_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error:
        "LLM_API_KEY is not configured (GEMINI_API_KEY / OPENAI_API_KEY も可)",
    });
  }

  try {
    const prompt = promptFromBody(req.body || {});
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const baseUrl = (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(
      /\/+$/,
      ""
    );
    const candidates = process.env.LLM_MODEL
      ? [process.env.LLM_MODEL]
      : DEFAULT_MODELS;
    const maxTokens = Number(req.body?.max_tokens) > 0
      ? Math.min(Number(req.body.max_tokens), 4000)
      : 1200;

    let lastStatus = 502;
    let lastError = "LLM API request failed";

    for (const model of candidates) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 50_000);

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        const text = data.choices?.[0]?.message?.content || "";
        return res.status(200).json({
          text,
          model: data.model || model,
          content: [{ type: "text", text }],
        });
      }

      lastStatus = response.status;
      lastError =
        data.error?.message || data.message || "LLM API request failed";

      /* モデル名起因のエラー（404/400等）のみ次候補を試す。認証エラーは即返す */
      if (response.status === 401 || response.status === 403) break;
    }

    return res.status(lastStatus).json({ error: lastError });
  } catch (error) {
    const aborted = error?.name === "AbortError";
    return res.status(aborted ? 504 : 500).json({
      error: aborted
        ? "LLM API request timed out"
        : error instanceof Error
          ? error.message
          : "Unexpected server error",
    });
  }
}
