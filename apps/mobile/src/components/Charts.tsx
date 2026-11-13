import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useSettings } from '@/theme/settings';
import { fonts, radius, space, type } from '@/theme/tokens';

// Charts drawn with react-native-svg, matching the web: categorical slots 1 and 2 for the two
// series (validated reference palette), one hue for single-series bars, values as text so
// identity never rests on colour alone.
const SERIES = {
  light: ['#2a78d6', '#eb6834'],
  dark: ['#3987e5', '#d95926'],
};

function useSeries() {
  const { scheme } = useSettings();
  return SERIES[scheme];
}

/** Received vs resolved per week: two lines on one axis, legend above, first and last week below. */
export function TrendChart({
  data,
  receivedLabel,
  resolvedLabel,
  summary,
}: {
  data: { label: string; received: number; resolved: number }[];
  receivedLabel: string;
  resolvedLabel: string;
  summary: string;
}) {
  const { colors: c } = useSettings();
  const [s1, s2] = useSeries();
  const [w, setW] = useState(0);
  const H = 150;
  const pad = { top: 8, bottom: 8, left: 2, right: 2 };
  const max = Math.ceil(Math.max(...data.flatMap((d) => [d.received, d.resolved])) / 20) * 20;
  const x = (i: number) => pad.left + (i / (data.length - 1)) * (w - pad.left - pad.right);
  const y = (v: number) => pad.top + (1 - v / max) * (H - pad.top - pad.bottom);
  const path = (key: 'received' | 'resolved') => data.map((d, i) => `${i ? 'L' : 'M'}${x(i)} ${y(d[key])}`).join(' ');
  const last = data.length - 1;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary}>
      <View style={styles.legend}>
        <LegendItem color={s1} label={receivedLabel} />
        <LegendItem color={s2} label={resolvedLabel} dashed />
      </View>
      <View style={{ height: H }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <Svg width={w} height={H}>
            {[0, 0.5, 1].map((f) => (
              <Line key={f} x1={0} x2={w} y1={y(max * f)} y2={y(max * f)} stroke={c.line} strokeWidth={1} />
            ))}
            <Path d={path('received')} stroke={s1} strokeWidth={2} fill="none" strokeLinejoin="round" />
            <Path d={path('resolved')} stroke={s2} strokeWidth={2} fill="none" strokeDasharray="6 4" strokeLinejoin="round" />
            <Circle cx={x(last)} cy={y(data[last].received)} r={4} fill={s1} stroke={c.surface} strokeWidth={2} />
            <Circle cx={x(last)} cy={y(data[last].resolved)} r={4} fill={s2} stroke={c.surface} strokeWidth={2} />
          </Svg>
        )}
      </View>
      <View style={styles.axis}>
        <Text style={[type.small, { color: c.muted }]}>{data[0].label}</Text>
        <Text style={[type.small, { color: c.muted }]}>
          {data[last].label}: {data[last].received} / {data[last].resolved}
        </Text>
      </View>
    </View>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  const { colors: c } = useSettings();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, dashed ? { borderTopWidth: 3, borderStyle: 'dashed', borderColor: color, height: 0 } : { backgroundColor: color }]} />
      <Text style={[type.small, { color: c.ink2 }]}>{label}</Text>
    </View>
  );
}

/** Single-series magnitude: sorted bars in one hue, value at the end. */
export function CategoryBars({ items }: { items: { label: string; count: number }[] }) {
  const { colors: c } = useSettings();
  const [s1] = useSeries();
  const max = Math.max(...items.map((i) => i.count));
  return (
    <View style={styles.bars}>
      {items.map((item) => (
        <View key={item.label} style={styles.barRow} accessible accessibilityLabel={`${item.label}: ${item.count}`}>
          <Text style={[type.small, styles.barLabel, { color: c.ink2 }]} numberOfLines={1}>
            {item.label}
          </Text>
          <View style={[styles.track, { backgroundColor: c.sunk }]}>
            <View style={[styles.fill, { width: `${(item.count / max) * 100}%`, backgroundColor: s1 }]} />
          </View>
          <Text style={[styles.barValue, { color: c.ink }]}>{item.count}</Text>
        </View>
      ))}
    </View>
  );
}

/** How "Me too" support grew since posting; the current total sits at the line's end. */
export function SupportChart({ values, startLabel, endLabel, summary }: { values: number[]; startLabel: string; endLabel: string; summary: string }) {
  const { colors: c } = useSettings();
  const [s1] = useSeries();
  const [w, setW] = useState(0);
  const H = 64;
  const right = 30;
  const max = Math.max(1, ...values);
  const x = (i: number) => 2 + (i / (values.length - 1)) * (w - 2 - right);
  const y = (v: number) => 8 + (1 - v / max) * (H - 12);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' ');
  const last = values.length - 1;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary}>
      <View style={{ height: H }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <Svg width={w} height={H}>
            <Line x1={2} x2={w - right} y1={H - 4} y2={H - 4} stroke={c.line} />
            <Path d={`${line} L${x(last)} ${H - 4} L${x(0)} ${H - 4} Z`} fill={s1} opacity={0.14} />
            <Path d={line} stroke={s1} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <Circle cx={x(last)} cy={y(values[last])} r={4} fill={s1} stroke={c.surface} strokeWidth={2} />
          </Svg>
        )}
        {w > 0 && <Text style={[styles.supportValue, { color: c.ink, left: x(last) + 8, top: y(values[last]) - 10 }]}>{values[last]}</Text>}
      </View>
      <View style={styles.axis}>
        <Text style={[type.small, { color: c.muted }]}>{startLabel}</Text>
        <Text style={[type.small, { color: c.muted }]}>{endLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, marginBottom: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  swatch: { width: 18, height: 3, borderRadius: 2 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  bars: { gap: space.md },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  barLabel: { width: 118 },
  track: { flex: 1, height: 10, borderTopRightRadius: radius.sm, borderBottomRightRadius: radius.sm, overflow: 'hidden' },
  fill: { height: '100%', borderTopRightRadius: radius.sm, borderBottomRightRadius: radius.sm },
  barValue: { width: 30, textAlign: 'right', fontFamily: fonts.semibold, fontSize: 15, fontVariant: ['tabular-nums'] },
  supportValue: { position: 'absolute', fontFamily: fonts.semibold, fontSize: 14 },
});
