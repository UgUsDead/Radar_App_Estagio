/**
 * SettingsModal.tsx — App settings modal (thresholds, room size, safe zone).
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
} from 'react-native';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  speedThreshold: number;
  fallZThreshold: number;
  settingsSaved: boolean;
  onSpeedThresholdChange: (val: number) => void;
  onFallZThresholdChange: (val: number) => void;
  onSave: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  onClose,
  speedThreshold,
  fallZThreshold,
  settingsSaved,
  onSpeedThresholdChange,
  onFallZThresholdChange,
  onSave,
}) => (
  <Modal
    visible={visible}
    animationType="fade"
    transparent={true}
    onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.close}>X</Text>
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          <SettingsRow
            label="Speed Alert Threshold"
            value={`${speedThreshold.toFixed(1)} m/s`}
            onDecrement={() => onSpeedThresholdChange(speedThreshold - 0.1)}
            onIncrement={() => onSpeedThresholdChange(speedThreshold + 0.1)}
          />
          <SettingsRow
            label="Fall Height Threshold"
            value={`${fallZThreshold.toFixed(1)} m`}
            onDecrement={() => onFallZThresholdChange(fallZThreshold - 0.1)}
            onIncrement={() => onFallZThresholdChange(fallZThreshold + 0.1)}
          />
          <View style={styles.divider} />

          <TouchableOpacity style={styles.actionBtn} onPress={onSave}>
            <Text style={styles.actionBtnText}>
              {settingsSaved ? '✓ Saved' : '💾 Save Settings'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  </Modal>
);

const SettingsRow: React.FC<{
  label: string;
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
}> = ({label, value, onDecrement, onIncrement}) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.control}>
      <TouchableOpacity style={styles.pmBtn} onPress={onDecrement}>
        <Text style={styles.pmBtnText}>−</Text>
      </TouchableOpacity>
      <Text style={styles.value}>{value}</Text>
      <TouchableOpacity style={styles.pmBtn} onPress={onIncrement}>
        <Text style={styles.pmBtnText}>+</Text>
      </TouchableOpacity>
    </View>
  </View>
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    width: '85%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: '#333',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {fontSize: 20, fontWeight: 'bold', color: '#fff'},
  close: {fontSize: 18, color: '#888', fontWeight: 'bold', padding: 4},
  row: {marginBottom: 18},
  label: {color: '#aaa', fontSize: 13, marginBottom: 8, fontWeight: '600'},
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    minWidth: 80,
    textAlign: 'center',
  },
  pmBtn: {
    backgroundColor: '#2a2a2a',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  pmBtnText: {fontSize: 22, color: '#fff', fontWeight: 'bold'},
  divider: {height: 1, backgroundColor: '#2a2a2a', marginVertical: 10},
  actionBtn: {
    backgroundColor: '#00554a',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00aa88',
  },
  actionBtnText: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default SettingsModal;
