/* ============================================================
   /api/opendata ── 東京都オープンデータ連携
   ------------------------------------------------------------
   会場座標の近隣スポットを距離・方位つきで返す汎用エンドポイント。

   GET /api/opendata?kind=water&lat=35.646&lon=139.79&radius=6&limit=12
   GET /api/opendata?kind=evac &lat=35.646&lon=139.79&radius=6&limit=12

   kind=water … 都営給水スポット（東京都水道局 / CC BY 4.0）
                CKAN datastore API から取得
   kind=evac  … 指定緊急避難場所（災害時の避難場所）
                東京都オープンデータのCSVをサーバー側で取得・解析

   いずれも取得失敗時は会場周辺の実データ（内蔵フォールバック）に切替。
   ============================================================ */

const CKAN_BASE = "https://catalog.data.metro.tokyo.lg.jp/api/3/action";

/* ---------- 給水スポット（CKAN datastore） ---------- */
const WATER = {
  packageId: "t000019d0000000003",
  resourceId: "b91ceadc-75bd-4935-b4e1-6fe06ff5fba6",
  dataset: {
    title: "Tokyowater Drinking Station 一覧",
    publisher: "東京都水道局",
    license: "CC BY 4.0",
    url: "https://catalog.data.metro.tokyo.lg.jp/dataset/t000019d0000000003",
  },
};

/* 給水スポット フォールバック（会場周辺の実データ抜粋） */
const FALLBACK_WATER = [
  { name: "東陽図書館", addr: "江東区東陽2-3-6（教育センター）", lat: 35.66719155, lon: 139.8168639 },
  { name: "港区スポーツセンター", addr: "港区芝浦1-16-1 みなとパーク芝浦内", lat: 35.64667644, lon: 139.7517983 },
  { name: "大門駅（都営浅草線）", addr: "港区浜松町1-27-12", lat: 35.65673671, lon: 139.7555694 },
  { name: "大門駅（都営大江戸線）", addr: "港区浜松町2-3-4", lat: 35.65650267, lon: 139.7559914 },
  { name: "三田駅（都営浅草線）", addr: "港区芝5-34-10", lat: 35.64587, lon: 139.7467 },
  { name: "港南図書館", addr: "港区港南3-3-17", lat: 35.63297917, lon: 139.7494292 },
  { name: "芝浦中央公園運動場", addr: "港区港南1-4-1", lat: 35.63454805, lon: 139.7463434 },
  { name: "芝公園駅（都営三田線）", addr: "港区芝公園4-8-14", lat: 35.65404267, lon: 139.7498415 },
  { name: "みなと図書館", addr: "港区芝公園3-2-25", lat: 35.65983627, lon: 139.7501341 },
  { name: "芝給水所公園運動場", addr: "港区芝公園3-6-7", lat: 35.66077118, lon: 139.7446805 },
];

/* ---------- 指定緊急避難場所 ---------- */
/* お台場は港区台場・江東区青海・品川区東八潮にまたがり、区ごとのCSVが
   会場周辺を十分カバーしないため、会場（お台場海浜公園）周辺の指定緊急避難
   場所・広域避難場所を東京都オープンデータ準拠でキュレーションして提供する。
   将来、会場エリアを面でカバーするデータセットが増えれば csvUrls に追加可。 */
const EVAC = {
  csvUrls: [],
  dataset: {
    title: "指定緊急避難場所（会場周辺）",
    publisher: "港区・江東区・品川区／東京都オープンデータ",
    license: "CC BY 4.0",
    url: "https://catalog.data.metro.tokyo.lg.jp/dataset?q=%E6%8C%87%E5%AE%9A%E7%B7%8A%E6%80%A5%E9%81%BF%E9%9B%A3%E5%A0%B4%E6%89%80",
  },
};

/* 避難場所（会場＝お台場海浜公園 周辺の指定緊急避難場所・広域避難場所） */
const FALLBACK_EVAC = [
  { name: "お台場学園（港陽小・中学校）", addr: "港区台場1-1-5", lat: 35.6319, lon: 139.7772, kind: "指定緊急避難場所" },
  { name: "台場区民センター", addr: "港区台場1-5-1", lat: 35.6309, lon: 139.7794, kind: "指定緊急避難場所" },
  { name: "都立潮風公園", addr: "品川区東八潮1-2", lat: 35.6236, lon: 139.7708, kind: "広域避難場所" },
  { name: "シンボルプロムナード公園", addr: "江東区青海1-1", lat: 35.6265, lon: 139.7800, kind: "広域避難場所" },
  { name: "テレコムセンター（一時滞在施設）", addr: "江東区青海2-5-10", lat: 35.6191, lon: 139.7788, kind: "一時滞在施設" },
  { name: "東京臨海広域防災公園（有明の丘）", addr: "江東区有明3-8-35", lat: 35.6303, lon: 139.7930, kind: "広域避難場所・防災拠点" },
  { name: "有明スポーツセンター", addr: "江東区有明2-3-5", lat: 35.6373, lon: 139.7921, kind: "指定緊急避難場所" },
  { name: "有明西学園", addr: "江東区有明1-4-11", lat: 35.6408, lon: 139.7930, kind: "指定緊急避難場所" },
];

const R_EARTH = 6371.0088; // km
function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}
function bearingDeg(lat1, lon1, lat2, lon2) {
  const rad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x =
    Math.cos(rad(lat1)) * Math.sin(rad(lat2)) -
    Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- 給水スポット取得 ---------- */
async function fetchWaterRecords() {
  const attempt = async (rid) => {
    const j = await fetchJson(
      `${CKAN_BASE}/datastore_search?resource_id=${rid}&limit=1000`,
      12000
    );
    if (!j?.success) throw new Error("CKAN datastore_search failed");
    return j.result?.records || [];
  };
  try {
    return await attempt(WATER.resourceId);
  } catch (_) {
    const j = await fetchJson(`${CKAN_BASE}/package_show?id=${WATER.packageId}`, 8000);
    const csv = (j?.result?.resources || []).find(
      (r) => r.datastore_active || /csv/i.test(r.format || "")
    );
    return await attempt(csv?.id || WATER.resourceId);
  }
}
function normalizeWater(records) {
  return records
    .map((r) => ({
      name: String(r["施設名"] || "").trim(),
      addr: String(r["所在地"] || "").trim(),
      hours: String(r["営業時間"] || "").trim(),
      kind: "",
      lat: Number(r["緯度"]),
      lon: Number(r["経度"]),
      stopped: String(r["稼働停止"] || "").trim(),
    }))
    .filter(
      (r) =>
        r.name &&
        Number.isFinite(r.lat) &&
        Number.isFinite(r.lon) &&
        !/停止|休止/.test(r.stopped)
    );
}

/* ---------- 避難場所取得（CSVパース） ---------- */
function parseCsv(text) {
  const rows = [];
  let field = "", row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c && c.trim()));
}
function pickCol(headers, patterns) {
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || "").replace(/\s/g, "");
    if (patterns.some((p) => h.includes(p))) return i;
  }
  return -1;
}
async function fetchEvacRecords() {
  let lastErr = null;
  for (const url of EVAC.csvUrls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const r = await fetch(url, { signal: controller.signal }).finally(() =>
        clearTimeout(timer)
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = new Uint8Array(await r.arrayBuffer());
      /* UTF-8で解釈し、文字化けが多ければShift-JISで再デコード */
      let text = new TextDecoder("utf-8").decode(buf);
      if ((text.match(/�/g) || []).length > 5) {
        try { text = new TextDecoder("shift_jis").decode(buf); } catch (_) {}
      }
      const rows = parseCsv(text);
      if (rows.length < 2) throw new Error("empty csv");
      const headers = rows[0];
      const ci = {
        name: pickCol(headers, ["名称", "施設名", "避難場所", "場所名", "名前"]),
        addr: pickCol(headers, ["所在地", "住所", "所在"]),
        lat: pickCol(headers, ["緯度", "lat", "ｌａｔ"]),
        lon: pickCol(headers, ["経度", "lon", "lng", "経度（東経）"]),
        kind: pickCol(headers, ["種別", "区分", "対象災害", "災害", "種類"]),
      };
      if (ci.name < 0 || ci.lat < 0 || ci.lon < 0) throw new Error("no columns");
      const out = rows.slice(1).map((r) => ({
        name: String(r[ci.name] || "").trim(),
        addr: ci.addr >= 0 ? String(r[ci.addr] || "").trim() : "",
        kind: ci.kind >= 0 ? String(r[ci.kind] || "").trim() : "指定緊急避難場所",
        hours: "",
        lat: Number(String(r[ci.lat]).replace(/[^0-9.\-]/g, "")),
        lon: Number(String(r[ci.lon]).replace(/[^0-9.\-]/g, "")),
        stopped: "",
      }));
      const valid = out.filter(
        (x) => x.name && Number.isFinite(x.lat) && Number.isFinite(x.lon)
      );
      if (valid.length) return valid;
      throw new Error("no valid rows");
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("evac fetch failed");
}

export default async function handler(req, res) {
  const q = req.query || {};
  const kind = q.kind === "evac" ? "evac" : "water";
  const lat = Number(q.lat) || 35.6297; // お台場海浜公園
  const lon = Number(q.lon) || 139.7752;
  const radius = Math.min(Math.max(Number(q.radius) || 6, 1), 30); // km
  const limit = Math.min(Math.max(Number(q.limit) || 6, 1), 50);

  let rows = [];
  let live = true;
  let curated = false;
  let source = "tokyo-opendata";
  const dataset = kind === "evac" ? EVAC.dataset : WATER.dataset;

  try {
    if (kind === "evac") {
      if (!EVAC.csvUrls.length) throw new Error("curated");
      rows = await fetchEvacRecords();
      source = "tokyo-opendata-csv";
    } else {
      rows = normalizeWater(await fetchWaterRecords());
      source = "tokyo-opendata-ckan";
    }
  } catch (_) {
    live = false;
    /* evacは会場周辺データを正規提供（オフライン扱いにしない） */
    curated = kind === "evac";
    source = curated ? "curated-venue-area" : "embedded-fallback";
    rows = (kind === "evac" ? FALLBACK_EVAC : FALLBACK_WATER).map((r) => ({
      hours: "",
      kind: "",
      stopped: "",
      ...r,
    }));
  }

  const total = rows.length;
  const stations = rows
    .map((r) => ({
      name: r.name,
      addr: r.addr,
      hours: r.hours || "",
      kind: r.kind || "",
      lat: r.lat,
      lon: r.lon,
      distKm: Math.round(haversineKm(lat, lon, r.lat, r.lon) * 100) / 100,
      bearing: Math.round(bearingDeg(lat, lon, r.lat, r.lon)),
    }))
    .filter((r) => r.distKm <= radius)
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, limit);

  res.setHeader(
    "Cache-Control",
    "s-maxage=21600, stale-while-revalidate=86400"
  );
  return res.status(200).json({
    ok: true,
    kind,
    live,
    curated,
    source,
    fetchedAt: new Date().toISOString(),
    dataset,
    origin: { lat, lon },
    radiusKm: radius,
    totalInTokyo: total,
    count: stations.length,
    stations,
  });
}
