import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { palette, spacing, typography } from './theme';
import StatusBadge from './StatusBadge';

type Props = {
  title: string;
  subtitle?: string;
  meta?: string;
  status?: 'online' | 'offline' | 'alert' | 'warn' | 'info';
  onPress?: () => void;
  selected?: boolean;
};

const ListItem: React.FC<Props> = ({ title, subtitle, meta, status, onPress, selected }) => {
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={[styles.row, selected && styles.selected]} disabled={!onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
      {status ? <StatusBadge status={status} /> : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm
  },
  selected: {
    borderColor: palette.primary,
    backgroundColor: '#e0f2fe'
  },
  title: { ...typography.subtitle },
  subtitle: { ...typography.body, color: palette.textMuted, marginTop: 2 },
  meta: { ...typography.muted, marginTop: 4 }
});

export default ListItem;
