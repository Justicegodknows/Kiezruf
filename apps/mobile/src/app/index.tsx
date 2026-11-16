// Home: map and nearby list (US-01, US-15, US-24, US-44). No account needed. The location chip names the
// tenant at the map centre, or says Kiezruf is not live here yet. The citizen's own position is asked for only
// when they tap "use my location" (US-32).
import { CATEGORIES } from '@kiezruf/shared';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type NearbyFilters, nearbyReports, routeAt } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { PUBLIC_STATUSES } from '../api/schemas';
import { useAuth } from '../auth/AuthProvider';
import { DEFAULT_CENTER, NEARBY_RADIUS_M } from '../config';
import type { LatLon } from '../lib/geo';
import { categoryName } from '../lib/format';
import { currentFix } from '../lib/location';
import { decideRoute } from '../report/onsite';
import { BottomNav } from '../ui/BottomNav';
import { Banner, Button, Chip, ErrorText, SectionTitle } from '../ui/components';
import { ReportCard } from '../ui/ReportCard';
import { ReportMap } from '../ui/ReportMap';
import { colors, radius, space } from '../ui/theme';

const AGES = [1, 7, 30] as const;

/** ~10 m grid, so small map jitters do not refetch. */
const roundPoint = (p: LatLon): LatLon => ({ lat: Math.round(p.lat * 1e4) / 1e4, lon: Math.round(p.lon * 1e4) / 1e4 });

export default function HomeScreen() {
  const { t } = useTranslation();
  const { signedIn } = useAuth();
  const cameraRef = useRef<CameraRef>(null);
  const [center, setCenter] = useState<LatLon>(DEFAULT_CENTER);
  const [filters, setFilters] = useState<NearbyFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const point = roundPoint(center);

  const route = useQuery({ queryKey: ['route', point.lat, point.lon], queryFn: () => routeAt(point) });
  const nearby = useQuery({
    queryKey: ['nearby', point.lat, point.lon, filters],
    queryFn: () => nearbyReports(point, NEARBY_RADIUS_M, filters),
  });
  const reports = [...(nearby.data?.reports ?? [])].sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
  const decision = route.data ? decideRoute(route.data) : null;

  const chipText = !decision
    ? t('home.chipChecking')
    : decision.kind === 'live'
      ? t('home.chipLive', { tenant: decision.tenantName })
      : t('home.chipNotLive');

  const useMyLocation = async () => {
    setLocating(true);
    setLocationError(null);
    try {
      const fix = await currentFix();
      setCenter({ lat: fix.lat, lon: fix.lon });
      cameraRef.current?.flyTo({ center: [fix.lon, fix.lat], duration: 600 });
    } catch (e) {
      setLocationError(errorMessage(t, e));
    } finally {
      setLocating(false);
    }
  };

  const open = (publicId: string) => router.push({ pathname: '/report/[publicId]', params: { publicId } });
  const setFilter = (patch: NearbyFilters) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>{t('home.heading')}</Text>
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={styles.title}>
            {decision?.tenantName ?? route.data?.tenant?.name ?? 'Kiezruf'}
          </Text>
          <View
            testID="home-location-chip"
            accessible
            accessibilityLabel={t('home.chipA11y', { text: chipText })}
            style={[styles.chip, decision?.kind === 'not_live' && styles.chipOff]}
          >
            <Text style={styles.chipText}>{`${decision?.kind === 'live' ? '●' : '○'} ${chipText}`}</Text>
          </View>
        </View>

        {decision?.kind === 'not_live' ? (
          <Banner tone="neutral" testID="home-not-live">
            <Text style={styles.bold}>
              {decision.tenantName ? t('home.notLiveTitle', { tenant: decision.tenantName }) : t('home.notLiveTitleUnknown')}
            </Text>
            <Text style={styles.body}>{t('home.notLiveBody')}</Text>
          </Banner>
        ) : null}

        <ReportMap
          ref={cameraRef}
          testID="home-map"
          accessibilityLabel={t('home.mapA11y')}
          center={center}
          pins={reports}
          onOpen={open}
          onCenterChanged={setCenter}
          style={styles.map}
        />
        <Button testID="home-locate" label={t('home.useMyLocation')} icon="◎" onPress={useMyLocation} busy={locating} />
        <ErrorText message={locationError} />

        <Button
          testID="home-filters-toggle"
          variant="ghost"
          label={`${t('home.filters')} ${showFilters ? '▴' : '▾'}`}
          accessibilityLabel={t('home.filters')}
          onPress={() => setShowFilters((v) => !v)}
        />
        {showFilters ? (
          <View style={styles.filters} testID="home-filters">
            <Text style={styles.filterLabel}>{t('home.filterCategory')}</Text>
            <ScrollView horizontal contentContainerStyle={styles.chipsRow} accessibilityRole="radiogroup">
              <Chip label={t('home.all')} selected={!filters.category} onPress={() => setFilter({ category: undefined })} testID="filter-category-all" />
              {CATEGORIES.map((c) => (
                <Chip
                  key={c.key}
                  testID={`filter-category-${c.key}`}
                  label={categoryName(t, c.key)}
                  selected={filters.category === c.key}
                  onPress={() => setFilter({ category: c.key })}
                />
              ))}
            </ScrollView>
            <Text style={styles.filterLabel}>{t('home.filterStatus')}</Text>
            <ScrollView horizontal contentContainerStyle={styles.chipsRow} accessibilityRole="radiogroup">
              <Chip label={t('home.all')} selected={!filters.status} onPress={() => setFilter({ status: undefined })} testID="filter-status-all" />
              {PUBLIC_STATUSES.map((s) => (
                <Chip key={s} testID={`filter-status-${s}`} label={t(`status.${s}`)} selected={filters.status === s} onPress={() => setFilter({ status: s })} />
              ))}
            </ScrollView>
            <Text style={styles.filterLabel}>{t('home.filterAge')}</Text>
            <View style={styles.chips} accessibilityRole="radiogroup">
              <Chip label={t('home.all')} selected={!filters.maxAgeDays} onPress={() => setFilter({ maxAgeDays: undefined })} testID="filter-age-all" />
              {AGES.map((d) => (
                <Chip key={d} testID={`filter-age-${d}`} label={t(`home.age${d}`)} selected={filters.maxAgeDays === d} onPress={() => setFilter({ maxAgeDays: d })} />
              ))}
            </View>
          </View>
        ) : null}

        {signedIn ? null : <Text style={styles.hint}>{t('home.guestHint')}</Text>}

        <SectionTitle>{t('home.listHeading')}</SectionTitle>
        {nearby.isPending ? <Text style={styles.body}>{t('common.loading')}</Text> : null}
        {nearby.isError ? (
          <View style={styles.gap}>
            <ErrorText message={errorMessage(t, nearby.error)} />
            <Button label={t('common.retry')} onPress={() => void nearby.refetch()} />
          </View>
        ) : null}
        {nearby.isSuccess && reports.length === 0 ? <Text style={styles.body}>{t('home.empty')}</Text> : null}
        <View style={styles.gap} testID="home-list">
          {reports.map((r) => (
            <ReportCard key={r.publicId} report={r} onPress={() => open(r.publicId)} />
          ))}
        </View>
      </ScrollView>
      <BottomNav current="home" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: space.l, gap: space.m },
  kicker: { fontSize: 14, color: colors.muted },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.s },
  title: { flex: 1, fontSize: 26, fontWeight: '700', color: colors.text },
  chip: { paddingHorizontal: space.m, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.infoBg },
  chipOff: { backgroundColor: colors.sunk, borderWidth: 1, borderColor: colors.border },
  chipText: { fontSize: 14, color: colors.text, fontWeight: '600' },
  map: { height: 280 },
  filters: { gap: space.s },
  filterLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  chipsRow: { flexDirection: 'row', gap: space.s },
  hint: { fontSize: 14, color: colors.muted },
  body: { fontSize: 15, color: colors.text },
  bold: { fontSize: 15, fontWeight: '700', color: colors.text },
  gap: { gap: space.s },
});
