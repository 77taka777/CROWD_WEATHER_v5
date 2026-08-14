const DEFAULT_MODEL = "orcarouter/auto";

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = process.env.ORCA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ORCA_API_KEY is not configured" });
  }

  try {
    const prompt = promptFromBody(req.body || {});
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const model = process.env.ORCA_MODEL || DEFAULT_MODEL;
    const response = await fetch("https://api.orcarouter.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 1200,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || data.message || "OrcaRouter request failed",
      });
    }

    const text = data.choices?.[0]?.message?.content || "";

    return res.status(200).json({
      text,
      model,
      content: [{ type: "text", text }],
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unexpected server error",
    });
  }
}
