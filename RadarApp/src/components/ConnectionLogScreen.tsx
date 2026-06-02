/**
 * ConnectionLogScreen.tsx — Visualizador completo de logs MQTT.
 *
 * Mostra todos os eventos de comunicação MQTT com timestamps,
 * categorias e cores. Suporta filtro por categoria e pesquisa de texto.
 */

import React, {useState, useCallback, useMemo, useRef, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  StyleSheet,
  Share,
  Platform,
  StatusBar,
} from 'react-native';
import type {MQTTLogEntry, MQTTLogCategory} from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  logs: MQTTLogEntry[];
  onClear: () => void;
}

const CATEGORY_LABELS: Record<MQTTLogCategory, string> = {
  CONNECTION: '🔗 Ligação',
  AVAILABILITY: '📡 Disponibilidade',
  STATUS: '📊 Estado',
  ERROR: '❌ Erro',
  RADAR_STATUS: '📶 Radar',
  RADAR_CONFIG: '⚙️ Configuração',
  RADAR_CMD: '🎯 Cmd Radar',
  CMD: '💬 Comando',
  TELEMETRY: '📦 Telemetria',
};

const CATEGORY_COLORS: Record<MQTTLogCategory, string> = {
  CONNECTION: '#60a5fa',
  AVAILABILITY: '#34d399',
  STATUS: '#a78bfa',
  ERROR: '#f87171',
  RADAR_STATUS: '#38bdf8',
  RADAR_CONFIG: '#c084fc',
  RADAR_CMD: '#fbbf24',
  CMD: '#94a3b8',
  TELEMETRY: '#6b7280',
};

const ALL_CATEGORIES: MQTTLogCategory[] = [
  'CONNECTION',
  'AVAILABILITY',
  'STATUS',
  'ERROR',
  'RADAR_STATUS',
  'RADAR_CONFIG',
  'RADAR_CMD',
  'CMD',
  'TELEMETRY',
];

const ConnectionLogScreen: React.FC<Props> = ({
  visible,
  onClose,
  logs,
  onClear,
}) => {
  const [searchText, setSearchText] = useState('');
  const [hiddenCategories, setHiddenCategories] = useState<Set<MQTTLogCategory>>(
    new Set(['TELEMETRY']),
  );
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  const toggleCategory = useCallback((cat: MQTTLogCategory) => {
    setHiddenCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }, []);

  const filteredLogs = useMemo(() => {
    let result = logs.filter(l => !hiddenCategories.has(l.category));
    if (searchText.trim()) {
      const lower = searchText.toLowerCase();
      result = result.filter(
        l =>
          l.message.toLowerCase().includes(lower) ||
          (l.radarId && l.radarId.toLowerCase().includes(lower)) ||
          (l.raw && l.raw.toLowerCase().includes(lower)),
      );
    }
    return result;
  }, [logs, hiddenCategories, searchText]);

  useEffect(() => {
    if (autoScroll && visible) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({animated: false});
      }, 50);
    }
  }, [filteredLogs.length, autoScroll, visible]);

  const exportLogs = useCallback(async () => {
    const text = filteredLogs
      .map(l => {
        const ts = new Date(l.timestamp).toISOString();
        const radar = l.radarId ? `[${l.radarId}]` : '';
        return `${ts} ${l.category} ${radar} ${l.message}${l.raw ? `\n  → ${l.raw}` : ''}`;
      })
      .join('\n');
    try {
      await Share.share({
        message: text,
        title: 'Logs MQTT RadarApp',
      });
    } catch {}
  }, [filteredLogs]);

  const formatTime = useCallback((ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('pt-PT', {hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'});
  }, []);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeBtn}>← Fechar</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Logs de Comunicação MQTT</Text>
          <Text style={styles.subtitle}>
            {filteredLogs.length} de {logs.length} eventos
          </Text>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Pesquisar nos logs..."
            placeholderTextColor="#555"
            value={searchText}
            onChangeText={setSearchText}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Category filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterContent}>
          {ALL_CATEGORIES.map(cat => {
            const isHidden = hiddenCategories.has(cat);
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.filterChip,
                  !isHidden && {
                    backgroundColor: CATEGORY_COLORS[cat] + '30',
                    borderColor: CATEGORY_COLORS[cat],
                  },
                ]}
                onPress={() => toggleCategory(cat)}>
                <Text
                  style={[
                    styles.filterChipText,
                    !isHidden && {color: CATEGORY_COLORS[cat]},
                  ]}>
                  {CATEGORY_LABELS[cat]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Log entries */}
        <ScrollView
          ref={scrollRef}
          style={styles.logScroll}
          onScrollBeginDrag={() => setAutoScroll(false)}>
          {filteredLogs.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Nenhum log encontrado.</Text>
              <Text style={styles.emptyHint}>
                Os eventos MQTT aparecerão aqui quando houver ligação.
              </Text>
            </View>
          ) : (
            filteredLogs.map((entry, idx) => (
              <View key={`${entry.timestamp}-${idx}`} style={styles.logEntry}>
                <View style={styles.logEntryHeader}>
                  <Text style={[styles.logCategory, {color: CATEGORY_COLORS[entry.category]}]}>
                    {CATEGORY_LABELS[entry.category]}
                  </Text>
                  <Text style={styles.logTimestamp}>{formatTime(entry.timestamp)}</Text>
                </View>
                {entry.radarId && (
                  <Text style={styles.logRadarId}>{entry.radarId}</Text>
                )}
                <Text style={styles.logMessage}>{entry.message}</Text>
                {entry.raw && (
                  <Text style={styles.logRaw} numberOfLines={3}>
                    {entry.raw}
                  </Text>
                )}
              </View>
            ))
          )}
        </ScrollView>

        {/* Bottom actions */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.bottomBtn, autoScroll && styles.bottomBtnActive]}
            onPress={() => {
              setAutoScroll(!autoScroll);
              if (!autoScroll) {
                scrollRef.current?.scrollToEnd({animated: true});
              }
            }}>
            <Text style={styles.bottomBtnText}>
              {autoScroll ? '⏬ Auto-scroll' : '⏸ Pausado'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomBtn} onPress={exportLogs}>
            <Text style={styles.bottomBtnText}>📤 Exportar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bottomBtn, styles.bottomBtnDanger]}
            onPress={onClear}>
            <Text style={[styles.bottomBtnText, styles.bottomBtnDangerText]}>
              🗑 Limpar
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingTop:
      Platform.OS === 'android'
        ? (StatusBar.currentHeight || 30) + 8
        : 50,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  closeBtn: {color: '#00aaff', fontSize: 15, marginBottom: 6},
  title: {fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 2},
  subtitle: {color: '#888', fontSize: 12},
  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchInput: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 14,
  },
  filterRow: {
    maxHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  filterContent: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 6,
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#111',
  },
  filterChipText: {
    color: '#666',
    fontSize: 11,
    fontWeight: '600',
  },
  logScroll: {
    flex: 1,
    paddingHorizontal: 12,
  },
  emptyState: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {color: '#666', fontSize: 15, marginBottom: 6},
  emptyHint: {color: '#444', fontSize: 12, textAlign: 'center', paddingHorizontal: 40},
  logEntry: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#1e1e1e',
    borderRadius: 8,
    padding: 10,
    marginVertical: 3,
  },
  logEntryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  logCategory: {
    fontSize: 11,
    fontWeight: '700',
  },
  logTimestamp: {
    color: '#555',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  logRadarId: {
    color: '#38bdf8',
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  logMessage: {
    color: '#ccc',
    fontSize: 12,
    lineHeight: 18,
  },
  logRaw: {
    color: '#666',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 4,
    backgroundColor: '#0d0d0d',
    padding: 6,
    borderRadius: 4,
  },
  bottomBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#222',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  bottomBtn: {
    flex: 1,
    backgroundColor: '#1a2233',
    borderWidth: 1,
    borderColor: '#335577',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  bottomBtnActive: {
    backgroundColor: '#0f2a1f',
    borderColor: '#0f8f7f',
  },
  bottomBtnText: {color: '#88cfff', fontSize: 12, fontWeight: '600'},
  bottomBtnDanger: {
    backgroundColor: '#221111',
    borderColor: '#664422',
  },
  bottomBtnDangerText: {color: '#ff8866'},
});

export default ConnectionLogScreen;
