/**
 * DebugPanel.tsx — Debug log viewer modal.
 */

import React from 'react';
import {View, Text, TouchableOpacity, ScrollView, Modal, StyleSheet} from 'react-native';

interface DebugPanelProps {
  visible: boolean;
  onClose: () => void;
  logs: string[];
  onClear: () => void;
  mqttMsgCount: number;
  frameCount: number;
  activeTargetCount: number;
}

const DebugPanel: React.FC<DebugPanelProps> = ({
  visible,
  onClose,
  logs,
  onClear,
  mqttMsgCount,
  frameCount,
  activeTargetCount,
}) => (
  <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Debug Log</Text>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
            <TouchableOpacity onPress={onClear}>
              <Text style={{color: '#ff6666', fontSize: 14, fontWeight: 'bold'}}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.close}>X</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8}}>
          <Text style={styles.stat}>Messages: {mqttMsgCount}</Text>
          <Text style={styles.stat}>Frames: {frameCount}</Text>
          <Text style={styles.stat}>Targets: {activeTargetCount}</Text>
        </View>
        <ScrollView style={{maxHeight: 400}} showsVerticalScrollIndicator={true}>
          {logs.map((log, i) => (
            <Text
              key={i}
              style={{
                color: log.includes('\u2713')
                  ? '#00ff88'
                  : log.includes('\u2717')
                  ? '#ff6666'
                  : '#aaa',
                fontSize: 11,
                fontFamily: 'monospace',
                marginBottom: 2,
              }}>
              {log}
            </Text>
          ))}
          {logs.length === 0 && (
            <Text style={{color: '#666', fontSize: 12, fontStyle: 'italic'}}>
              No debug logs yet. Connect to MQTT and wait for telemetry.
            </Text>
          )}
        </ScrollView>
      </View>
    </View>
  </Modal>
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
    maxHeight: '80%',
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
  stat: {color: '#888', fontSize: 12},
});

export default DebugPanel;
