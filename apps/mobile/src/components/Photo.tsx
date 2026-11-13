import { PHOTOS, type PhotoKey } from '@kiezruf/shared';
import { useTranslation } from 'react-i18next';
import { Image, Linking, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSettings } from '@/theme/settings';
import { fonts, radius } from '@/theme/tokens';

// Bundled location photos (assets/photos), credited per packages/shared/src/photos.ts.
const SOURCES: Record<PhotoKey, number> = {
  rathaus: require('../../assets/photos/rathaus.jpg'),
  hermannstrasse: require('../../assets/photos/hermannstrasse.jpg'),
  weserstrasse: require('../../assets/photos/weserstrasse.jpg'),
  sonnenallee: require('../../assets/photos/sonnenallee.jpg'),
  hermannplatz: require('../../assets/photos/hermannplatz.jpg'),
  lipschitzallee: require('../../assets/photos/lipschitzallee.jpg'),
};

/** A location photo with an optional overlay tag and the credit its licence asks for. */
export function Photo({
  photo,
  alt,
  aspectRatio = 16 / 9,
  label,
  credit = false,
  rounded = true,
  style,
}: {
  photo: PhotoKey;
  alt: string;
  aspectRatio?: number;
  label?: string;
  credit?: boolean;
  rounded?: boolean;
  style?: ViewStyle;
}) {
  const { t } = useTranslation();
  const { colors: c } = useSettings();
  const meta = PHOTOS[photo];
  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.frame, { aspectRatio, backgroundColor: c.sunk }, rounded && { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line }]}>
        <Image source={SOURCES[photo]} style={styles.img} resizeMode="cover" accessible accessibilityRole="image" accessibilityLabel={alt} />
        {label && (
          <View style={styles.label}>
            <Text style={styles.labelText}>{label}</Text>
          </View>
        )}
      </View>
      {credit && (
        <Pressable onPress={() => Linking.openURL(meta.source)} accessibilityRole="link" hitSlop={6}>
          <Text style={[styles.credit, { color: c.muted }]}>{t('report.photoBy', { author: meta.author, license: meta.license })}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  frame: { width: '100%', overflow: 'hidden' },
  // Explicit size: on web an absolute-fill Image alone renders at the file's natural size.
  img: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  label: { position: 'absolute', left: 10, top: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: 'rgba(22,32,42,0.78)' },
  labelText: { fontFamily: fonts.semibold, fontSize: 13, color: '#fff' },
  credit: { fontFamily: fonts.regular, fontSize: 12, textDecorationLine: 'underline' },
});
