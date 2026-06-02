/**
 * RadarPickerModal.tsx — Modal to select which discovered radar to view.
 */

import React from 'react';
import {View, Text, TouchableOpacity, ScrollView, Modal, StyleSheet} from 'react-native';
import {DiscoveredRadar} from '../types';

interface RadarPickerModalProps {
  visible: boolean;
  onClose: () => void;
  discoveredRadars: DiscoveredRadar[];
  selectedRadarId: string | null;
  onSelectRadar: (radarId: string) => void;
}

const RadarPickerModal: React.FC<RadarPickerModalProps> = ({
  visible,
  onClose,
  discoveredRadars,
  selectedRadarId,
  onSelectRadar,
}) => (
  <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Select Radar</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.close}>X</Text>
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {discoveredRadars.length === 0 ? (
            <View style={{padding: 20, alignItems: 'center'}}>
              <Text style={{color: '#999', fontSize: 16}}>No radars discovered yet...</Text>
              <Text style={{color: '#666', fontSize: 14, marginTop: 8}}>
                Waiting for radars to announce availability
              </Text>
            </View>
          ) : (
            discoveredRadars.map(radar => (
              <TouchableOpacity
                key={radar.id}
                style={[
                  styles.item,
                  selectedRadarId === radar.id && styles.itemSelected,
                ]}
                onPress={() => onSelectRadar(radar.id)}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
                  <View
                    style={[
                      styles.dot,
                      {backgroundColor: radar.online ? '#4CAF50' : '#777'},
                    ]}
                  />
                  <View style={{flex: 1}}>
                    <Text style={styles.itemTitle}>{radar.id}</Text>
                    <Text style={styles.itemSubtitle}>
                      {radar.online ? 'Online' : 'Offline'}
                    </Text>
                  </View>
                  {selectedRadarId === radar.id && (
                    <Text style={{color: '#4CAF50', fontSize: 18}}>✓</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))
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
    maxHeight: '60%',
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
  item: {
    backgroundColor: '#2a2a2a',
    padding: 16,
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  itemSelected: {
    backgroundColor: '#1a3a2a',
    borderColor: '#4CAF50',
  },
  itemTitle: {color: '#fff', fontSize: 18, fontWeight: 'bold'},
  itemSubtitle: {color: '#999', fontSize: 14, marginTop: 4},
  dot: {width: 12, height: 12, borderRadius: 6},
});

export default RadarPickerModal;
