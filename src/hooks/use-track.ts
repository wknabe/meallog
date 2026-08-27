/**
 * ウォーキング・ランニングの距離をGPSで測る。
 *
 * 位置情報は画面を開いている間だけ取る（バックグラウンド追跡はしない）。
 * 常時追跡はストアの審査でも扱いが重く、電池も食うため、
 * 「記録するときだけ画面を開いておく」割り切りにしている。
 */
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import { smoothTrack, totalDistanceKm, type Point } from '@/lib/geo';

export type TrackingState = 'idle' | 'running' | 'paused' | 'denied';

export type TrackedPoint = Point & { recordedAt: string };

export function useTrack() {
  const [state, setState] = useState<TrackingState>('idle');
  const [points, setPoints] = useState<TrackedPoint[]>([]);
  /** 計測を始めてからの経過秒。一時停止中は増えない */
  const [elapsedSec, setElapsedSec] = useState(0);

  const subscription = useRef<Location.LocationSubscription | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopWatching = useCallback(() => {
    subscription.current?.remove();
    subscription.current = null;
    if (timer.current != null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  // 画面を離れたら必ず止める。止め忘れると電池を食い続ける
  useEffect(() => stopWatching, [stopWatching]);

  const start = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setState('denied');
      return;
    }

    subscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        // 5m進むごと、または3秒ごと。細かすぎると揺れを拾い、粗すぎると角を曲がれない
        distanceInterval: 5,
        timeInterval: 3000,
      },
      (location) => {
        setPoints((previous) => [
          ...previous,
          {
            lat: location.coords.latitude,
            lng: location.coords.longitude,
            recordedAt: new Date(location.timestamp).toISOString(),
          },
        ]);
      },
    );

    timer.current = setInterval(() => setElapsedSec((value) => value + 1), 1000);
    setState('running');
  }, []);

  const pause = useCallback(() => {
    stopWatching();
    setState('paused');
  }, [stopWatching]);

  const stop = useCallback(() => {
    stopWatching();
    setState('idle');
  }, [stopWatching]);

  const reset = useCallback(() => {
    stopWatching();
    setPoints([]);
    setElapsedSec(0);
    setState('idle');
  }, [stopWatching]);

  const smoothed = smoothTrack(points);

  return {
    state,
    /** 揺れを取り除いた座標。距離の計算と軌跡の描画で同じものを使う */
    points: smoothed,
    rawPoints: points,
    distanceKm: totalDistanceKm(points),
    elapsedSec,
    start,
    pause,
    stop,
    reset,
  };
}

/** 経過時間を 12:34 の形にする。1時間を超えたら 1:02:03 */
export function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(rest).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
