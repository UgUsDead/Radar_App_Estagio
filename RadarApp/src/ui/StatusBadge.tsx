import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette, radii, spacing, typography } from './theme';

type Status = 'online' | 'offline' | 'alert' | 'warn' | 'info';

type Props = {
  status: Status;
  label?: string;
};

const statusColors: Record<Status, { bg: string; text: string }> = {
  online: { bg: '#dcfce7', text: '#166534' },
  offline: { bg: '#e2e8f0', text: '#475569' },
  alert: { bg: '#fee2e2', text: '#b91c1c' },
  warn: { bg: '#fef9c3', text: '#92400e' },
  info: { bg: '#e0f2fe', text: '#075985' }
};

const StatusBadge: React.FC<Props> = ({ status, label }) => {
  const paletteForStatus = statusColors[status];
  return (
    <View style={[styles.base, { backgroundColor: paletteForStatus.bg }]}> 
      <View style={[styles.dot, { backgroundColor: paletteForStatus.text }]} />
      <Text style={[styles.text, { color: paletteForStatus.text }]}>{label || status}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
    alignSelf: 'flex-start'
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    marginRight: spacing.xs
  },
  text: {
    ...typography.muted,
    fontWeight: '700'
  }
});

export default StatusBadge;
