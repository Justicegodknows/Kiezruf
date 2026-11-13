import type { Subcategory } from '@kiezruf/shared';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { Palette } from '@/theme/tokens';

// Flat placeholder scenes until real (blurred) photos come from the API. Same drawings as the web.
export function ReportScene({ subcategory, label, colors: c }: { subcategory: Subcategory; label: string; colors: Palette }) {
  return (
    // The label sits on a View: react-native-svg passes accessibility props through to the DOM on web.
    <View style={StyleSheet.absoluteFill} accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width="100%" height="100%" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
        <Rect width={320} height={180} fill={c.sceneSky} />
        <Rect y={128} width={320} height={52} fill={c.sceneGround} />
        <Path d="M0 128h320" stroke={c.sceneLine} strokeWidth={2} />
        <Scene subcategory={subcategory} c={c} />
      </Svg>
    </View>
  );
}

function Scene({ subcategory, c }: { subcategory: Subcategory; c: Palette }) {
  switch (subcategory) {
    case 'trafficLight':
      return (
        <G>
          <Rect x={150} y={70} width={6} height={60} fill={c.sceneObj} />
          <Rect x={138} y={30} width={30} height={52} rx={8} fill={c.sceneObj} />
          <Circle cx={153} cy={45} r={7} fill={c.sceneOff} />
          <Circle cx={153} cy={67} r={7} fill={c.sceneOff} />
          <Path d="M120 150h80" stroke={c.sceneMark} strokeWidth={6} strokeDasharray="12 10" />
        </G>
      );
    case 'pothole':
    case 'bikeLane':
      return (
        <G>
          <Path d="M0 150h320" stroke={c.sceneMark} strokeWidth={4} strokeDasharray="18 12" />
          {subcategory === 'pothole' ? (
            <Ellipse cx={170} cy={156} rx={34} ry={9} fill={c.sceneObj} />
          ) : (
            <G>
              <Rect x={130} y={96} width={96} height={44} rx={6} fill={c.sceneObj} />
              <Rect x={196} y={104} width={22} height={16} rx={3} fill={c.sceneSky} />
              <Circle cx={150} cy={142} r={9} fill={c.sceneOff} />
              <Circle cx={206} cy={142} r={9} fill={c.sceneOff} />
            </G>
          )}
        </G>
      );
    case 'playground':
      return (
        <G stroke={c.sceneObj} strokeWidth={5} fill="none" strokeLinecap="round">
          <Path d="M110 128L135 50h50l25 78" />
          <Path d="M145 50v52" />
          <Path d="M175 50v40" />
          <Path d="M138 102h18" stroke={c.signal} strokeWidth={6} />
        </G>
      );
    case 'youthCentre':
    case 'toilet':
      return (
        <G>
          <Rect x={100} y={48} width={120} height={80} rx={4} fill={c.sceneObj} />
          <Rect x={146} y={84} width={28} height={44} rx={2} fill={c.sceneSky} />
          <Rect x={114} y={62} width={22} height={16} rx={2} fill={c.sceneSky} />
          <Rect x={184} y={62} width={22} height={16} rx={2} fill={c.sceneSky} />
          <Path d="M160 40l70 12H90z" fill={c.sceneObj} />
        </G>
      );
  }
}
