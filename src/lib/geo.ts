/**
 * GPSで測った移動距離。
 *
 * 地図は出さない。地図を出すには外部サービスの登録と鍵が要るうえ、
 * 知りたいのは「何km歩いたか」なので、座標の列から距離を出せば足りる。
 * 軌跡の形は、緯度経度をそのまま比率で描いた簡易な線図で見せる。
 */

export type Point = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;

const toRad = (degrees: number): number => (degrees * Math.PI) / 180;

/** 2点間の距離（メートル）。地球を球とみなすハバーサイン公式 */
export function distanceMeters(a: Point, b: Point): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 立ち止まっているときのGPSの揺れを距離に数えないための下限（メートル）。
 * スマホのGPSは静止していても数メートル動いて見えるため、
 * これを入れないと信号待ちの数分で数百メートル増えてしまう。
 */
const MIN_STEP_M = 5;

/** 座標の列から合計距離（km）を出す */
export function totalDistanceKm(points: Point[]): number {
  let meters = 0;
  for (let i = 1; i < points.length; i++) {
    const step = distanceMeters(points[i - 1], points[i]);
    if (step >= MIN_STEP_M) meters += step;
  }
  return meters / 1000;
}

/**
 * 揺れを取り除いた座標の列を返す。
 * 距離の計算と軌跡の描画で同じ点を使うため、ここでまとめて間引く。
 */
export function smoothTrack<T extends Point>(points: T[]): T[] {
  if (points.length === 0) return [];
  const result: T[] = [points[0]];
  for (const point of points.slice(1)) {
    if (distanceMeters(result[result.length - 1], point) >= MIN_STEP_M) {
      result.push(point);
    }
  }
  return result;
}

/** ペース（1kmあたりの分秒）。距離が短すぎるときは null */
export function paceLabel(distanceKm: number, minutes: number): string | null {
  if (distanceKm < 0.05 || minutes <= 0) return null;
  const minutesPerKm = minutes / distanceKm;
  const wholeMinutes = Math.floor(minutesPerKm);
  const seconds = Math.round((minutesPerKm - wholeMinutes) * 60);
  // 59.6秒が「7分60秒」にならないよう繰り上げる
  if (seconds === 60) return `${wholeMinutes + 1}'00"/km`;
  return `${wholeMinutes}'${String(seconds).padStart(2, '0')}"/km`;
}

/**
 * 軌跡を描くための座標に直す。
 * 緯度経度をそのまま使うと、日本付近では経度1度のほうが短いため横に潰れる。
 * 緯度に応じて経度を縮め、指定した箱の中に収める。
 */
export function trackToPath(
  points: Point[],
  width: number,
  height: number,
  padding = 8,
): { x: number; y: number }[] {
  if (points.length === 0) return [];

  const meanLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const lngScale = Math.cos(toRad(meanLat));

  const xs = points.map((p) => p.lng * lngScale);
  const ys = points.map((p) => p.lat);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  // 縦横の比率を保ったまま収める。1点だけ・直線のときは0除算を避ける
  const scale = Math.min(
    spanX > 0 ? (width - padding * 2) / spanX : Infinity,
    spanY > 0 ? (height - padding * 2) / spanY : Infinity,
  );
  const usable = Number.isFinite(scale) ? scale : 0;

  const offsetX = (width - spanX * usable) / 2;
  const offsetY = (height - spanY * usable) / 2;

  return points.map((point, index) => ({
    x: offsetX + (xs[index] - minX) * usable,
    // SVGは下向きが正なので、北が上になるよう反転する
    y: height - offsetY - (ys[index] - minY) * usable,
  }));
}
