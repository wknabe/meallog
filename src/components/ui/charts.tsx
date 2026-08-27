/**
 * グラフ部品。
 *
 * 既存のグラフライブラリは Skia などのネイティブ依存を持ち込むものが多く、
 * Expo Go での動作確認ができなくなるため、必要な2種類だけ react-native-svg で自作している。
 */
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { colors, fontSize, spacing } from '@/theme/colors';

const CHART_HEIGHT = 180;
const PADDING = { top: 12, right: 8, bottom: 24, left: 40 };

/** 目盛りの区切りとして自然な値（1,2,5 の倍数）に丸める */
function niceStep(rawStep: number): number {
  if (rawStep <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function buildScale(max: number, min = 0, tickCount = 4) {
  const span = Math.max(max - min, 1);
  const step = niceStep(span / tickCount);
  const top = Math.ceil(max / step) * step;
  const bottom = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let value = bottom; value <= top + step / 2; value += step) ticks.push(value);
  return { top, bottom, ticks };
}

function useChartWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  return { width, onLayout };
}

// ── 棒グラフ（摂取カロリーと消費カロリーの比較）──

export type BarPoint = {
  label: string;
  /** 摂取カロリー */
  primary: number;
  /** 消費カロリー */
  secondary: number;
};

export function GroupedBarChart({
  data,
  primaryColor = colors.chartIntake,
  secondaryColor = colors.chartBurn,
  primaryLabel = '摂取',
  secondaryLabel = '消費',
}: {
  data: BarPoint[];
  primaryColor?: string;
  secondaryColor?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
}) {
  const { width, onLayout } = useChartWidth();

  if (data.length === 0) {
    return <EmptyChart onLayout={onLayout} />;
  }

  const max = Math.max(...data.flatMap((point) => [point.primary, point.secondary]), 1);
  const scale = buildScale(max);
  const plotWidth = Math.max(width - PADDING.left - PADDING.right, 1);
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const slot = plotWidth / data.length;
  // 1日ぶんの枠の中に2本並べる。棒が細くなりすぎない範囲で間隔を取る
  const barWidth = Math.max(Math.min(slot / 2 - 2, 14), 2);

  const toY = (value: number) =>
    PADDING.top +
    plotHeight -
    ((value - scale.bottom) / (scale.top - scale.bottom || 1)) * plotHeight;

  // ラベルが重なるときは間引く
  const labelStep = Math.ceil(data.length / 7);

  return (
    <View onLayout={onLayout}>
      <Legend
        items={[
          { color: primaryColor, label: primaryLabel },
          { color: secondaryColor, label: secondaryLabel },
        ]}
      />
      {width > 0 && (
        <Svg width={width} height={CHART_HEIGHT}>
          {scale.ticks.map((tick) => (
            <G key={tick}>
              <Line
                x1={PADDING.left}
                y1={toY(tick)}
                x2={width - PADDING.right}
                y2={toY(tick)}
                stroke={colors.chartGrid}
                strokeWidth={1}
              />
              <SvgText
                x={PADDING.left - 6}
                y={toY(tick) + 4}
                fontSize={9}
                fill={colors.textFaint}
                textAnchor="end"
              >
                {tick >= 1000 ? `${tick / 1000}k` : String(tick)}
              </SvgText>
            </G>
          ))}

          {data.map((point, index) => {
            const center = PADDING.left + slot * index + slot / 2;
            const baseY = toY(scale.bottom);
            return (
              <G key={`${point.label}-${index}`}>
                <Rect
                  x={center - barWidth - 1}
                  y={toY(point.primary)}
                  width={barWidth}
                  height={Math.max(baseY - toY(point.primary), 0)}
                  fill={primaryColor}
                  rx={2}
                />
                <Rect
                  x={center + 1}
                  y={toY(point.secondary)}
                  width={barWidth}
                  height={Math.max(baseY - toY(point.secondary), 0)}
                  fill={secondaryColor}
                  rx={2}
                />
                {index % labelStep === 0 && (
                  <SvgText
                    x={center}
                    y={CHART_HEIGHT - 8}
                    fontSize={9}
                    fill={colors.textFaint}
                    textAnchor="middle"
                  >
                    {point.label}
                  </SvgText>
                )}
              </G>
            );
          })}
        </Svg>
      )}
    </View>
  );
}

// ── 折れ線グラフ（体重の推移）──

export type LinePoint = {
  label: string;
  value: number | null;
};

export function LineChartView({
  data,
  color = colors.chartWeight,
  unit = '',
}: {
  data: LinePoint[];
  color?: string;
  unit?: string;
}) {
  const { width, onLayout } = useChartWidth();
  const values = data.map((point) => point.value).filter((value): value is number => value != null);

  if (values.length === 0) {
    return <EmptyChart onLayout={onLayout} />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  // 体重は変動が小さいので、上下に少し余白を作らないと直線に見えてしまう
  const margin = Math.max((max - min) * 0.2, 0.5);
  const scale = buildScale(max + margin, min - margin);

  const plotWidth = Math.max(width - PADDING.left - PADDING.right, 1);
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const stepX = data.length > 1 ? plotWidth / (data.length - 1) : 0;

  const toX = (index: number) => PADDING.left + stepX * index;
  const toY = (value: number) =>
    PADDING.top +
    plotHeight -
    ((value - scale.bottom) / (scale.top - scale.bottom || 1)) * plotHeight;

  // 記録がない日は線を切らずに前後をつなぐ（体重は毎日測るとは限らないため）
  const points = data
    .map((point, index) => ({ index, value: point.value }))
    .filter((point): point is { index: number; value: number } => point.value != null);

  const path = points
    .map((point, order) => `${order === 0 ? 'M' : 'L'} ${toX(point.index)} ${toY(point.value)}`)
    .join(' ');

  const labelStep = Math.ceil(data.length / 6);

  return (
    <View onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={CHART_HEIGHT}>
          {scale.ticks.map((tick) => (
            <G key={tick}>
              <Line
                x1={PADDING.left}
                y1={toY(tick)}
                x2={width - PADDING.right}
                y2={toY(tick)}
                stroke={colors.chartGrid}
                strokeWidth={1}
              />
              <SvgText
                x={PADDING.left - 6}
                y={toY(tick) + 4}
                fontSize={9}
                fill={colors.textFaint}
                textAnchor="end"
              >
                {Number(tick.toFixed(1))}
              </SvgText>
            </G>
          ))}

          <Path d={path} stroke={color} strokeWidth={2} fill="none" />

          {points.map((point) => (
            <Circle
              key={point.index}
              cx={toX(point.index)}
              cy={toY(point.value)}
              r={3}
              fill={color}
            />
          ))}

          {data.map((point, index) =>
            index % labelStep === 0 ? (
              <SvgText
                key={`${point.label}-${index}`}
                x={toX(index)}
                y={CHART_HEIGHT - 8}
                fontSize={9}
                fill={colors.textFaint}
                textAnchor="middle"
              >
                {point.label}
              </SvgText>
            ) : null,
          )}
        </Svg>
      )}
      {unit !== '' && <Text style={styles.unit}>単位: {unit}</Text>}
    </View>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <View style={styles.legend}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: item.color }]} />
          <Text style={styles.legendLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── 円グラフ（目標に対する進み具合）──

export type ProgressRingProps = {
  value: number;
  /** 1周ぶんの量。これを超えると2周目に入る */
  max: number;
  size?: number;
  thickness?: number;
  /** 1周目の色 */
  color?: string;
  /** 2周目（超過ぶん）の色 */
  overColor?: string;
  /** 輪の中に置くもの */
  children?: ReactNode;
};

/**
 * 目標を1周として、達成度を輪で表す。
 *
 * 棒グラフだと目標を超えたぶんが伸びる先を失って頭打ちに見えるが、
 * 輪なら2周目に入るだけなので「どれだけ超えたか」がそのまま形に出る。
 * 2周目は色を変えて、超えていることがひと目で分かるようにする。
 */
export function ProgressRing({
  value,
  max,
  size = 168,
  thickness = 14,
  color = colors.primary,
  overColor = colors.danger,
  children,
}: ProgressRingProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const ratio = max > 0 ? value / max : 0;
  const first = Math.max(0, Math.min(1, ratio));
  // 2周目。3周目以降は輪では表せないので、満ちたまま止めて数字で見せる
  const second = Math.max(0, Math.min(1, ratio - 1));

  /** 進み具合を、上（12時の位置）から時計回りの弧にする */
  const arc = (fraction: number) => ({
    strokeDasharray: `${circumference} ${circumference}`,
    strokeDashoffset: circumference * (1 - fraction),
  });

  return (
    <View style={[styles.ring, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${center}, ${center}`}>
          {/* 目盛りの土台 */}
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={colors.surfaceMuted}
            strokeWidth={thickness}
            fill="none"
          />
          {first > 0 && (
            <Circle
              cx={center}
              cy={center}
              r={radius}
              // 2周目に入ったら1周目は控えめにして、超過ぶんを目立たせる
              stroke={second > 0 ? colors.border : color}
              strokeWidth={thickness}
              fill="none"
              strokeLinecap="round"
              {...arc(first)}
            />
          )}
          {second > 0 && (
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={overColor}
              strokeWidth={thickness}
              fill="none"
              strokeLinecap="round"
              {...arc(second)}
            />
          )}
        </G>
      </Svg>
      <View style={styles.ringCenter}>{children}</View>
    </View>
  );
}

function EmptyChart({ onLayout }: { onLayout: (event: LayoutChangeEvent) => void }) {
  return (
    <View onLayout={onLayout} style={styles.empty}>
      <Text style={styles.emptyText}>この期間の記録がありません</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 10, height: 10, borderRadius: 2 },
  legendLabel: { fontSize: fontSize.xs, color: colors.textSub },
  unit: { fontSize: fontSize.xs, color: colors.textFaint, textAlign: 'right' },
  ring: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  ringCenter: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { height: CHART_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: fontSize.sm, color: colors.textFaint },
});
