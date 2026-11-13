import type { IconName, Status } from '@kiezruf/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSettings } from '@/theme/settings';
import { fonts, radius } from '@/theme/tokens';
import { Icon } from './Icon';

const ICON: Record<Status, IconName> = { open: 'inbox', acknowledged: 'bell', inProgress: 'clock', resolved: 'check' };

/** Status as icon plus text, never colour alone (BITV 2.0). */
export function StatusBadge({ status }: { status: Status }) {
  const { t } = useTranslation();
  const { colors: c } = useSettings();
  const tone = {
    open: [c.open, c.openSoft],
    acknowledged: [c.acknowledged, c.acknowledgedSoft],
    inProgress: [c.inProgress, c.inProgressSoft],
    resolved: [c.resolved, c.resolvedSoft],
  }[status];
  return (
    <View style={[styles.badge, { backgroundColor: tone[1] }]}>
      <Icon name={ICON[status]} size={14} color={tone[0]} />
      <Text style={[styles.text, { color: tone[0] }]}>{t(`status.${status}`)}</Text>
    </View>
  );
}

/** Neutral outlined tag, e.g. "Safety related". */
export function Tag({ icon, label }: { icon: IconName; label: string }) {
  const { colors: c } = useSettings();
  return (
    <View style={[styles.badge, { borderWidth: 1, borderColor: c.lineStrong }]}>
      <Icon name={icon} size={14} color={c.ink2} />
      <Text style={[styles.text, { color: c.ink2 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingLeft: 7, paddingRight: 9, borderRadius: radius.sm, alignSelf: 'flex-start' },
  text: { fontFamily: fonts.semibold, fontSize: 14 },
});
