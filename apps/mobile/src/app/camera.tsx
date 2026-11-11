// Camera (US-03, US-06, US-16, US-32, US-44). Opens in one tap from the map. The location is asked for at
// the moment of capture only, in the foreground. Accuracy worse than 100 m asks to wait or step outside.
// Gallery photos only if taken on site within 48 h. Up to 3 photos. Outside a live tenant: "not live here yet".
import { MAX_PHOTOS } from '@kiezruf/shared';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { routeAt } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { currentFix, currentFixOrNull } from '../lib/location';
import { useDraft } from '../report/DraftProvider';
import { type Capture, decideCameraCapture, decideGalleryPhoto, decideRoute, type DeviceFix, readExif } from '../report/onsite';
import { Button } from '../ui/components';
import { colors, radius, space, TOUCH } from '../ui/theme';

interface Shot {
  uri: string;
  width: number;
  height: number;
}

let photoSeq = 0;
const nextPhotoId = () => `photo-${Date.now()}-${++photoSeq}`;

export default function CameraScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const adding = mode === 'add';
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const { draft, anchor, addPhoto, update, reset } = useDraft();
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState<{ shot: Shot; accuracyM: number | null } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastFix, setLastFix] = useState<DeviceFix | null>(null);

  // A new report starts from an empty draft; "add photo" from the compose screen keeps it.
  useEffect(() => {
    if (!adding) reset();
  }, [adding, reset]);

  const remaining = MAX_PHOTOS - draft.photos.length;

  const done = () => (adding ? router.back() : router.replace('/compose'));

  /** Checks the tenant for the first photo; returns false when it navigated to "not live here yet". */
  async function routeFirst(capture: Capture): Promise<boolean> {
    const decision = decideRoute(await routeAt(capture));
    if (decision.kind === 'not_live') {
      router.replace({
        pathname: '/not-live',
        params: { tenant: decision.tenantName ?? '', lat: String(capture.lat), lon: String(capture.lon) },
      });
      return false;
    }
    update({ route: { tenantName: decision.tenantName, office: decision.office } });
    return true;
  }

  async function evaluateShot(shot: Shot, fix: DeviceFix) {
    setLastFix(fix);
    const decision = decideCameraCapture(fix, new Date(), anchor);
    if (decision.kind === 'wait_accuracy') {
      setWaiting({ shot, accuracyM: decision.accuracyM });
      return;
    }
    setWaiting(null);
    if (decision.kind === 'rejected') {
      setMessage(t(`gallery.${decision.reason}`));
      return;
    }
    if (!anchor && !(await routeFirst(decision.capture))) return;
    addPhoto({ id: nextPhotoId(), ...shot, capture: decision.capture, source: 'camera' });
    done();
  }

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
    } catch (e) {
      setMessage(errorMessage(t, e));
    } finally {
      setBusy(false);
    }
  };

  const shoot = () =>
    run(async () => {
      if (remaining <= 0) return setMessage(t('camera.maxPhotos', { max: MAX_PHOTOS }));
      const camera = cameraRef.current;
      if (!camera) return;
      // Photo and location at the same moment (US-03). The picture's own EXIF is not needed.
      const [picture, fix] = await Promise.all([camera.takePictureAsync({ quality: 0.9 }), currentFix()]);
      await evaluateShot({ uri: picture.uri, width: picture.width, height: picture.height }, fix);
    });

  const retryFix = () =>
    run(async () => {
      if (!waiting) return;
      await evaluateShot(waiting.shot, await currentFix());
    });

  const pickFromGallery = () =>
    run(async () => {
      if (remaining <= 0) return setMessage(t('camera.maxPhotos', { max: MAX_PHOTOS }));
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        exif: true,
        allowsMultipleSelection: remaining > 1,
        selectionLimit: remaining,
        quality: 1,
      });
      if (result.canceled) return;

      let device: DeviceFix | null | undefined;
      let currentAnchor = anchor;
      let accepted = 0;
      const problems: string[] = [];
      for (const asset of result.assets) {
        const exif = readExif(asset.exif);
        // Only photos without GPS accuracy need the device's position (see decideGalleryPhoto).
        if (exif.accuracyM === null && exif.lat !== null && device === undefined) device = await currentFixOrNull();
        const decision = decideGalleryPhoto(exif, device ?? null, new Date(), currentAnchor);
        if (decision.kind === 'wait_accuracy') {
          problems.push(t('camera.accuracyBody', { accuracy: Math.round(decision.accuracyM ?? 0) }));
          continue;
        }
        if (decision.kind === 'rejected') {
          problems.push(t(`gallery.${decision.reason}`));
          continue;
        }
        if (!currentAnchor && !(await routeFirst(decision.capture))) return;
        addPhoto({ id: nextPhotoId(), uri: asset.uri, width: asset.width, height: asset.height, capture: decision.capture, source: 'gallery' });
        currentAnchor = currentAnchor ?? decision.capture;
        accepted += 1;
      }
      if (accepted === 0) return setMessage(problems.join('\n'));
      if (problems.length) Alert.alert(t('camera.rejected'), problems.join('\n'));
      done();
    });

  const close = () => (adding ? router.back() : router.dismissTo('/'));

  const placeLabel = draft.route?.tenantName ?? '…';

  return (
    <View style={styles.screen}>
      {permission?.granted ? (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" testID="camera-viewfinder" accessibilityLabel={t('nav.newReport')} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.permission]} testID="camera-permission">
          <Text accessibilityRole="header" style={styles.permissionTitle}>
            {t('camera.permissionTitle')}
          </Text>
          <Text style={styles.permissionBody}>{t('camera.permissionBody')}</Text>
          {permission ? (
            <Button testID="camera-permission-grant" variant="primary" label={t('camera.permissionGrant')} onPress={() => void requestPermission()} />
          ) : null}
        </View>
      )}

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.top}>
          <Pressable testID="camera-close" onPress={close} accessibilityRole="button" accessibilityLabel={t('camera.close')} style={styles.round}>
            <Text style={styles.icon}>✕</Text>
          </Pressable>
          <View style={styles.chip} accessible accessibilityLiveRegion="polite" testID="camera-gps">
            <Text style={styles.chipText}>
              {busy
                ? t('camera.locating')
                : lastFix?.accuracyM != null
                  ? t('camera.gpsChip', { place: placeLabel, accuracy: Math.round(lastFix.accuracyM) })
                  : t('camera.photosCount', { count: draft.photos.length, max: MAX_PHOTOS })}
            </Text>
          </View>
        </View>

        <View style={styles.bottom}>
          {waiting ? (
            <View style={styles.panel} testID="camera-accuracy" accessibilityRole="alert" accessibilityLiveRegion="assertive">
              <Text style={styles.panelTitle}>{t('camera.accuracyTitle')}</Text>
              <Text style={styles.panelBody}>{t('camera.accuracyBody', { accuracy: Math.round(waiting.accuracyM ?? 0) })}</Text>
              <Button testID="camera-accuracy-retry" variant="primary" label={t('camera.accuracyRetry')} onPress={retryFix} busy={busy} />
            </View>
          ) : null}
          {message ? (
            <View style={styles.panel} accessibilityRole="alert" accessibilityLiveRegion="assertive" testID="camera-message">
              <Text style={styles.panelBody}>{message}</Text>
            </View>
          ) : null}
          <View style={styles.controls}>
            <Pressable
              testID="camera-gallery"
              onPress={pickFromGallery}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('camera.gallery')}
              accessibilityHint={t('camera.galleryHint')}
              accessibilityState={{ disabled: busy }}
              style={styles.round}
            >
              <Text style={styles.icon}>🖼</Text>
            </Pressable>
            <Pressable
              testID="camera-shutter"
              onPress={shoot}
              disabled={busy || !permission?.granted}
              accessibilityRole="button"
              accessibilityLabel={t('camera.shutter')}
              accessibilityState={{ disabled: busy || !permission?.granted, busy }}
              style={[styles.shutter, (busy || !permission?.granted) && styles.dim]}
            />
            <View style={styles.round} />
          </View>
          <Text style={styles.hint}>{t('camera.galleryHint')}</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, justifyContent: 'space-between' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.l, gap: space.s },
  bottom: { padding: space.l, gap: space.m, alignItems: 'stretch' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: {
    width: TOUCH + 8,
    height: TOUCH + 8,
    borderRadius: (TOUCH + 8) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  icon: { color: '#fff', fontSize: 22 },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 6, borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.35)' },
  dim: { opacity: 0.5 },
  chip: { flexShrink: 1, paddingHorizontal: space.m, paddingVertical: space.s, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.7)' },
  chipText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  hint: { color: '#fff', fontSize: 14, textAlign: 'center', textShadowColor: '#000', textShadowRadius: 4 },
  panel: { backgroundColor: colors.surface, borderRadius: radius.m, padding: space.l, gap: space.s },
  panelTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  panelBody: { fontSize: 15, color: colors.text },
  permission: { alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.m, backgroundColor: colors.text },
  permissionTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  permissionBody: { fontSize: 15, color: '#fff', textAlign: 'center' },
});
