import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { login, normalizeBase } from '../api/backend';
import { persistAuthToken } from '../services/settingsStorage';
import { palette, radii, spacing, typography } from '../ui/theme';

interface LoginScreenProps {
  onLoginSuccess: (token: string, user: any) => void;
  initialApiBase?: string;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, initialApiBase }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [apiBase, setApiBase] = useState(normalizeBase(initialApiBase));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      setError('Por favor preencha todos os campos');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = await login(apiBase, username.trim(), password);
      await persistAuthToken(payload.token);
      onLoginSuccess(payload.token, payload.user);
    } catch (err: any) {
      setError(err?.message || 'Falha na autenticação. Verifique as suas credenciais.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoText}>📡</Text>
            </View>
            <Text style={styles.title}>Radar Care</Text>
            <Text style={styles.subtitle}>Hospital Management Command</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Servidor API</Text>
              <TextInput
                style={styles.input}
                value={apiBase}
                onChangeText={setApiBase}
                placeholder="Ex: http://backend-host:4000"
                placeholderTextColor="#666"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Utilizador</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="Introduza o seu utilizador"
                placeholderTextColor="#666"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Palavra-passe</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#666"
                secureTextEntry
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginBtnText}>Entrar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Versão 2.1.0 • Multi-Hospital Isolation</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050505',
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl * 2,
  },
  logoBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: '#222',
  },
  logoText: {
    fontSize: 40,
  },
  title: {
    ...typography.title,
    fontSize: 32,
    color: '#fff',
    textAlign: 'center',
  },
  subtitle: {
    ...typography.muted,
    fontSize: 16,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  form: {
    backgroundColor: '#0d0d0d',
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
    marginLeft: 4,
  },
  input: {
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: '#fff',
    fontSize: 16,
  },
  loginBtn: {
    backgroundColor: '#0070f3',
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    shadowColor: '#0070f3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorText: {
    color: '#ff4d4d',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  footer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  footerText: {
    color: '#333',
    fontSize: 12,
  },
});

export default LoginScreen;
