import React from 'react';
import { ActivityIndicator, GestureResponderEvent, StyleProp, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { palette, radii, spacing, typography } from './theme';

type ButtonVariant = 'primary' | 'ghost' | 'neutral';

type Props = {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

const Button: React.FC<Props> = ({ label, onPress, variant = 'primary', disabled, loading, style }) => {
  const isDisabled = disabled || loading;
  const baseStyle = [styles.base, variant === 'ghost' ? styles.ghost : variant === 'neutral' ? styles.neutral : styles.primary, isDisabled && styles.disabled, style];
  return (
    <TouchableOpacity activeOpacity={0.9} style={baseStyle} onPress={onPress} disabled={isDisabled}>
      {loading ? <ActivityIndicator color={variant === 'ghost' ? palette.text : '#fff'} /> : <Text style={[styles.label, variant === 'ghost' ? styles.labelGhost : null]}>{label}</Text>}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radii.lg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row'
  },
  primary: {
    backgroundColor: palette.primary,
    shadowColor: palette.shadow,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  neutral: {
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: palette.border
  },
  disabled: {
    opacity: 0.6
  },
  label: {
    ...typography.subtitle,
    color: '#fff'
  },
  labelGhost: {
    color: palette.text
  }
});

export default Button;
