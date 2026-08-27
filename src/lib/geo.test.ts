import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { distanceMeters, paceLabel, smoothTrack, totalDistanceKm, trackToPath } from './geo.ts';

describe('distanceMeters', () => {
  it('同じ地点なら0', () => {
    const point = { lat: 35.681236, lng: 139.767125 };
    assert.equal(distanceMeters(point, point), 0);
  });

  it('東京駅から皇居までは約1.5km', () => {
    const tokyo = { lat: 35.681236, lng: 139.767125 };
    const palace = { lat: 35.685175, lng: 139.7528 };
    const meters = distanceMeters(tokyo, palace);
    assert.ok(meters > 1300 && meters < 1600, `${meters}m`);
  });

  it('緯度1度はおよそ111km', () => {
    const meters = distanceMeters({ lat: 35, lng: 139 }, { lat: 36, lng: 139 });
    assert.ok(meters > 110_000 && meters < 112_000, `${meters}m`);
  });
});

describe('totalDistanceKm', () => {
  it('点が1つ以下なら0', () => {
    assert.equal(totalDistanceKm([]), 0);
    assert.equal(totalDistanceKm([{ lat: 35, lng: 139 }]), 0);
  });

  it('区間を足し合わせる', () => {
    const km = totalDistanceKm([
      { lat: 35.0, lng: 139.0 },
      { lat: 35.01, lng: 139.0 },
      { lat: 35.02, lng: 139.0 },
    ]);
    assert.ok(km > 2.1 && km < 2.3, `${km}km`);
  });

  it('立ち止まったときの揺れは距離に数えない', () => {
    // 5m未満の揺れを繰り返しても0のまま
    const jitter = Array.from({ length: 50 }, (_, i) => ({
      lat: 35 + (i % 2) * 0.00002,
      lng: 139,
    }));
    assert.equal(totalDistanceKm(jitter), 0);
  });
});

describe('smoothTrack', () => {
  it('揺れの点を落とす', () => {
    const points = [
      { lat: 35.0, lng: 139.0 },
      { lat: 35.000005, lng: 139.0 }, // 0.5m程度
      { lat: 35.001, lng: 139.0 }, // 100m以上
    ];
    assert.equal(smoothTrack(points).length, 2);
  });

  it('空の入力は空のまま', () => {
    assert.deepEqual(smoothTrack([]), []);
  });
});

describe('paceLabel', () => {
  it('5kmを30分なら6分/km', () => {
    assert.equal(paceLabel(5, 30), `6'00"/km`);
  });

  it('秒が繰り上がっても60秒表記にしない', () => {
    // 1kmを 7分59.7秒 → 8'00"
    assert.equal(paceLabel(1, 7 + 59.7 / 60), `8'00"/km`);
  });

  it('距離が短すぎるときは出さない', () => {
    assert.equal(paceLabel(0.01, 5), null);
    assert.equal(paceLabel(5, 0), null);
  });
});

describe('trackToPath', () => {
  it('箱の中に収まる', () => {
    const points = [
      { lat: 35.0, lng: 139.0 },
      { lat: 35.01, lng: 139.01 },
      { lat: 35.02, lng: 139.0 },
    ];
    const path = trackToPath(points, 200, 100);
    for (const point of path) {
      assert.ok(point.x >= 0 && point.x <= 200, `x=${point.x}`);
      assert.ok(point.y >= 0 && point.y <= 100, `y=${point.y}`);
    }
  });

  it('北が上になる（緯度が大きいほどyは小さい）', () => {
    const path = trackToPath(
      [
        { lat: 35.0, lng: 139.0 },
        { lat: 35.02, lng: 139.01 },
      ],
      200,
      100,
    );
    assert.ok(path[1].y < path[0].y);
  });

  it('1点だけでも落ちない', () => {
    const path = trackToPath([{ lat: 35, lng: 139 }], 200, 100);
    assert.equal(path.length, 1);
    assert.ok(Number.isFinite(path[0].x) && Number.isFinite(path[0].y));
  });

  it('空なら空', () => {
    assert.deepEqual(trackToPath([], 200, 100), []);
  });
});
