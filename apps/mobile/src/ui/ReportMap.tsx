// MapLibre map (ENG-13). Style URL from EXPO_PUBLIC_MAP_STYLE_URL. Pins are neutral: one look for every
// report, no score or level (US-24). Each pin is a button with a spoken label; the list below the map offers
// the same reports for screen-reader users who do not want to explore the map.
import { Camera, type CameraRef, Map, Marker } from '@maplibre/maplibre-react-native';
import { forwardRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { MAP_STYLE_URL } from '../config';
import type { LatLon } from '../lib/geo';
import { categoryName } from '../lib/format';
import { colors } from './theme';

export interface MapPin {
  publicId: string;
  category: string;
  status: string;
  lat: number;
  lon: number;
}

interface Props {
  center: LatLon;
  zoom?: number;
  pins?: MapPin[];
  onOpen?: (publicId: string) => void;
  onCenterChanged?: (center: LatLon) => void;
  onPress?: (point: LatLon) => void;
  style?: ViewStyle;
  accessibilityLabel: string;
  testID?: string;
  children?: ReactNode;
}

export const ReportMap = forwardRef<CameraRef, Props>(function ReportMap(
  { center, zoom = 14, pins = [], onOpen, onCenterChanged, onPress, style, accessibilityLabel, testID, children },
  cameraRef,
) {
  const { t } = useTranslation();
  return (
    <View style={[styles.wrap, style]} testID={testID} accessibilityLabel={accessibilityLabel}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLE_URL}
        attribution
        logo={false}
        compass={false}
        onRegionDidChange={(e) => {
          const [lon, lat] = e.nativeEvent.center;
          if (e.nativeEvent.userInteraction) onCenterChanged?.({ lat, lon });
        }}
        onPress={(e) => {
          const [lon, lat] = e.nativeEvent.lngLat as [number, number];
          onPress?.({ lat, lon });
        }}
      >
        <Camera ref={cameraRef} initialViewState={{ center: [center.lon, center.lat], zoom }} />
        {pins.map((pin) => (
          <Marker key={pin.publicId} id={pin.publicId} lngLat={[pin.lon, pin.lat]} anchor="bottom">
            <Pressable
              testID={`pin-${pin.publicId}`}
              accessibilityRole="button"
              accessibilityLabel={t('home.pinA11y', { category: categoryName(t, pin.category), status: t(`status.${pin.status}`) })}
              onPress={() => onOpen?.(pin.publicId)}
              hitSlop={12}
              style={styles.pin}
            >
              <View style={styles.pinDot} />
            </Pressable>
          </Marker>
        ))}
        {children}
      </Map>
    </View>
  );
});

/** A fixed point on the map (the compose screen's capture point and pin). */
export function PointMarker({ id, at, kind }: { id: string; at: LatLon; kind: 'capture' | 'pin' }) {
  return (
    <Marker id={id} lngLat={[at.lon, at.lat]} anchor={kind === 'pin' ? 'bottom' : 'center'}>
      <View style={kind === 'pin' ? styles.pin : styles.capture} importantForAccessibility="no-hide-descendants">
        {kind === 'pin' ? <View style={styles.pinDot} /> : null}
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', borderRadius: 12, backgroundColor: colors.sunk },
  pin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.pin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.pin },
  capture: { width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: colors.primary, backgroundColor: colors.surface },
});
