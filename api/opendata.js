/* ============================================================
   /api/opendata ── 東京都オープンデータ連携（給水スポット）
   ------------------------------------------------------------
   東京都オープンデータカタログ（CKAN API）から
   「Tokyowater Drinking Station 一覧」（東京都水道局・CC BY 4.0）
   を取得し、会場座標の近隣スポットを距離・方位つきで返す。

   GET /api/opendata?lat=35.646&lon=139.79&radius=6&limit=12

   データセット: https://catalog.data.metro.tokyo.lg.jp/dataset/t000019d0000000003
   ライセンス  : CC BY 4.0（出典: 東京都水道局）
   ============================================================ */

const CKAN_BASE = "https://catalog.data.metro.tokyo.lg.jp/api/3/action";
const PACKAGE_ID = "t000019d0000000003";
const RESOURCE_ID = "b91ceadc-75bd-4935-b4e1-6fe06ff5fba6";

/* 取得不可時のフォールバック（2026-08-20時点の実データ抜粋・会場周辺） */
const FALLBACK_STATIONS = [
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

async function resolveResourceId() {
  const j = await fetchJson(
    `${CKAN_BASE}/package_show?id=${PACKAGE_ID}`,
    8000
  );
  const resources = j?.result?.resources || [];
  const csv = resources.find(
    (r) => r.datastore_active || /csv/i.test(r.format || "")
  );
  return csv?.id || RESOURCE_ID;
}

async function fetchStations() {
  /* まず既知のリソースIDで取得。失敗時はpackage_showで最新IDを解決して再試行 */
  const attempt = async (rid) => {
    const j = await fetchJson(
      `${CKAN_BASE}/datastore_search?resource_id=${rid}&limit=1000`,
      12000
    );
    if (!j?.success) throw new Error("CKAN datastore_search failed");
    return j.result?.records || [];
  };
  try {
    return { records: await attempt(RESOURCE_ID), live: true };
  } catch (_) {
    const rid = await resolveResourceId();
    return { records: await attempt(rid), live: true };
  }
}

export default async function handler(req, res) {
  const q = req.query || {};
  const lat = Number(q.lat) || 35.646;
  const lon = Number(q.lon) || 139.79;
  const radius = Math.min(Math.max(Number(q.radius) || 6, 1), 30); // km
  const limit = Math.min(Math.max(Number(q.limit) || 12, 1), 50);

  let rows = [];
  let source = "tokyo-opendata-ckan";
  let live = true;

  try {
    const got = await fetchStations();
    rows = got.records
      .map((r) => ({
        name: String(r["施設名"] || "").trim(),
        addr: String(r["所在地"] || "").trim(),
        spot: String(r["水飲み栓設置場所"] || "").trim(),
        hours: String(r["営業時間"] || "").trim(),
        fee: String(r["入場料等"] || "").trim(),
        stopped: String(r["稼働停止"] || "").trim(),
        lat: Number(r["緯度"]),
        lon: Number(r["経度"]),
      }))
      .filter(
        (r) =>
          r.name &&
          Number.isFinite(r.lat) &&
          Number.isFinite(r.lon) &&
          !/停止|休止/.test(r.stopped)
      );
  } catch (_) {
    live = false;
    source = "embedded-fallback";
    rows = FALLBACK_STATIONS.map((r) => ({ ...r, spot: "", hours: "", fee: "", stopped: "" }));
  }

  const total = rows.length;
  const stations = rows
    .map((r) => ({
      ...r,
      distKm: Math.round(haversineKm(lat, lon, r.lat, r.lon) * 100) / 100,
      bearing: Math.round(bearingDeg(lat, lon, r.lat, r.lon)),
    }))
    .filter((r) => r.distKm <= radius)
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, limit)
    .map(({ stopped, ...rest }) => rest);

  res.setHeader(
    "Cache-Control",
    "s-maxage=21600, stale-while-revalidate=86400"
  );
  return res.status(200).json({
    ok: true,
    live,
    source,
    fetchedAt: new Date().toISOString(),
    dataset: {
      title: "Tokyowater Drinking Station 一覧",
      publisher: "東京都水道局",
      license: "CC BY 4.0",
      url: "https://catalog.data.metro.tokyo.lg.jp/dataset/t000019d0000000003",
    },
    origin: { lat, lon },
    radiusKm: radius,
    totalInTokyo: total,
    count: stations.length,
    stations,
  });
}
