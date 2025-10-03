import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Wrapper component that applies safe default padding and background color.
 * Extend this component as we refine the design system.
 */
export function ScreenContainer({ children }: PropsWithChildren) {
  return <View style={styles.container}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F8',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
});
