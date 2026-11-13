import { ICON_PATHS, type IconName } from '@kiezruf/shared';
import Svg, { Path } from 'react-native-svg';

// The shared stroke icon set (packages/shared/src/icons.ts), same as the web.
// Decorative by default; the surrounding control carries the accessible label.
export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={ICON_PATHS[name]} stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
