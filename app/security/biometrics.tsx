import { canUseBiometrics, promptBiometric } from '@/lib/biometrics'
import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type SettingsRow = {
  biometric_login: boolean
  biometric_withdraw: boolean
}

const DEVICE_BIO_KEY = 'biometric_enabled_on_device_v1'

export default function BiometricsPage() {
  const router = useRouter()

  const [supported, setSupported] = useState<{
    ok: boolean
    hasHardware: boolean
    isEnrolled: boolean
  }>({ ok: false, hasHardware: false, isEnrolled: false })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [settings, setSettings] = useState<SettingsRow>({
    biometric_login: false,
    biometric_withdraw: false,
  })

  const bioLabel = useMemo(() => {
    // iOS: Face ID / Touch ID will display automatically
    // Android: Biometrics
    return 'Biometrics'
  }, [])

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const check = await canUseBiometrics()
      setSupported(check)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // Load row (or create default)
      const { data, error } = await supabase
        .from('security_settings')
        .select('biometric_login, biometric_withdraw')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) throw error

      if (!data) {
        // Create default row
        const { error: insErr } = await supabase
          .from('security_settings')
          .insert({
            user_id: user.id,
            biometric_login: false,
            biometric_withdraw: false,
          })
        if (insErr) throw insErr
        setSettings({ biometric_login: false, biometric_withdraw: false })
      } else {
        setSettings({
          biometric_login: !!data.biometric_login,
          biometric_withdraw: !!data.biometric_withdraw,
        })
      }
    } catch (e: any) {
      console.log(e)
      Alert.alert('Error', e?.message || 'Failed to load biometrics settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  const saveSettings = async (next: SettingsRow) => {
    setSaving(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('security_settings')
        .update(next)
        .eq('user_id', user.id)

      if (error) throw error
      setSettings(next)
    } catch (e: any) {
      console.log(e)
      Alert.alert('Error', e?.message || 'Failed to update settings')
    } finally {
      setSaving(false)
    }
  }

  const requireBiometricThen = async (fn: () => Promise<void>) => {
    if (!supported.ok) {
      Alert.alert(
        'Biometrics not available',
        supported.hasHardware
          ? 'No biometrics enrolled on this device. Please set up Face ID / Touch ID in your phone settings.'
          : 'This device does not support biometrics.'
      )
      return
    }

    const res = await promptBiometric('Confirm to change security settings')
    if (!res.success) return

    await fn()
  }

  const toggleLogin = async (v: boolean) => {
    if (saving) return

    // turning ON should require biometric confirmation
    if (v) {
      await requireBiometricThen(async () => {
        await SecureStore.setItemAsync(DEVICE_BIO_KEY, 'true')
        await saveSettings({ ...settings, biometric_login: true })
      })
      return
    }

    // turning OFF can still require biometric (recommended)
    await requireBiometricThen(async () => {
      await saveSettings({ ...settings, biometric_login: false })
    })
  }

  const toggleWithdraw = async (v: boolean) => {
    if (saving) return

    if (v) {
      await requireBiometricThen(async () => {
        await SecureStore.setItemAsync(DEVICE_BIO_KEY, 'true')
        await saveSettings({ ...settings, biometric_withdraw: true })
      })
      return
    }

    await requireBiometricThen(async () => {
      await saveSettings({ ...settings, biometric_withdraw: false })
    })
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style='dark' backgroundColor='#fff' />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name='chevron-back' size={22} color='#0f172a' />
          </Pressable>

          <Text style={styles.headerTitle}>{bioLabel}</Text>

          <View style={{ width: 44 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Use biometrics</Text>
            <Text style={styles.cardSub}>
              Enable Face ID / Touch ID for extra security. Biometrics never
              leave your device.
            </Text>

            <View style={styles.divider} />

            {/* Toggle: Login */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.iconBox}>
                  <Ionicons name='log-in-outline' size={18} color='#0f172a' />
                </View>
                <View>
                  <Text style={styles.rowTitle}>Login unlock</Text>
                  <Text style={styles.rowDesc}>
                    Require biometrics to open the app when a session exists.
                  </Text>
                </View>
              </View>

              <Switch
                value={settings.biometric_login}
                onValueChange={toggleLogin}
                disabled={loading || saving}
                trackColor={{ false: '#e2e8f0', true: '#16a34a' }}
                thumbColor='#ffffff'
              />
            </View>

            {/* Toggle: Withdraw */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.iconBox}>
                  <Ionicons name='cash-outline' size={18} color='#0f172a' />
                </View>
                <View>
                  <Text style={styles.rowTitle}>Withdraw confirmation</Text>
                  <Text style={styles.rowDesc}>
                    Require biometrics before submitting withdrawals.
                  </Text>
                </View>
              </View>

              <Switch
                value={settings.biometric_withdraw}
                onValueChange={toggleWithdraw}
                disabled={loading || saving}
                trackColor={{ false: '#e2e8f0', true: '#16a34a' }}
                thumbColor='#ffffff'
              />
            </View>
          </View>

          {!supported.ok ? (
            <View style={styles.warn}>
              <Ionicons name='warning-outline' size={18} color='#b45309' />
              <Text style={styles.warnText}>
                Biometrics not ready.{' '}
                {supported.hasHardware
                  ? 'Enroll Face ID / Touch ID in device settings.'
                  : 'Device does not support biometrics.'}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 14 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#0f172a' },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  cardSub: { marginTop: 6, fontSize: 13, color: '#64748b', fontWeight: '700' },

  divider: {
    height: 1,
    backgroundColor: '#eef2f7',
    marginVertical: 14,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 12,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  rowDesc: { marginTop: 2, fontSize: 12, color: '#94a3b8', fontWeight: '700' },

  warn: {
    marginTop: 14,
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    borderWidth: 1,
    padding: 12,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  warnText: { flex: 1, color: '#b45309', fontWeight: '800', fontSize: 12 },
})
