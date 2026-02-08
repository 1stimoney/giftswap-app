import { useAuth } from '@/authContext'
import { promptBiometric } from '@/lib/biometrics'
import { getSecureItem } from '@/lib/deviceSecure'
import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

const DEVICE_BIO_KEY = 'biometric_enabled_on_device_v1'

export default function BiometricGate({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { session, initializing } = useAuth()

  const [locked, setLocked] = useState(false)
  const [prompting, setPrompting] = useState(false)

  const promptingRef = useRef(false)

  const goToLogin = async () => {
    try {
      // End session so the app doesn't instantly re-lock/re-open
      await supabase.auth.signOut()
    } catch {}
    setLocked(false)
    // replace so user can't go back into locked app
    router.replace('/(auth)/login')
  }

  const runLockCheck = async () => {
    if (!session?.user) return
    if (promptingRef.current) return

    // web-safe
    if (Platform.OS === 'web') return

    const enabledOnDevice = (await getSecureItem(DEVICE_BIO_KEY)) === 'true'
    if (!enabledOnDevice) return

    const { data, error } = await supabase
      .from('security_settings')
      .select('biometric_login')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (error) return
    if (!data?.biometric_login) return

    setLocked(true)
    promptingRef.current = true
    setPrompting(true)

    const res = await promptBiometric('Unlock GiftSwap')

    setPrompting(false)
    promptingRef.current = false

    if (res.success) {
      setLocked(false)
    } else {
      // if user cancels or fails → take them to login
      await goToLogin()
    }
  }

  useEffect(() => {
    if (initializing) return
    if (session?.user) runLockCheck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initializing, session?.user?.id])

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        runLockCheck()
      }
    }
    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  // Loading state (initial auth boot)
  if (initializing) {
    return (
      <View style={styles.fullCenter}>
        <View style={styles.bootCard}>
          <View style={styles.bootIcon}>
            <Ionicons
              name='shield-checkmark-outline'
              size={20}
              color='#0f172a'
            />
          </View>
          <Text style={styles.bootTitle}>Loading GiftSwap</Text>
          <Text style={styles.bootSub}>Preparing your secure session…</Text>
          <View style={{ height: 14 }} />
          <ActivityIndicator />
        </View>
      </View>
    )
  }

  // Locked screen
  if (locked) {
    return (
      <View style={styles.lockWrap}>
        <View style={styles.lockCard}>
          <View style={styles.lockIcon}>
            <Ionicons name='finger-print-outline' size={26} color='#0f172a' />
          </View>

          <Text style={styles.lockTitle}>App Locked</Text>
          <Text style={styles.lockSub}>
            Use Face ID / Fingerprint to continue.
          </Text>

          <View style={{ height: 14 }} />

          <Pressable
            onPress={runLockCheck}
            disabled={prompting}
            style={[styles.unlockBtn, prompting && { opacity: 0.7 }]}
          >
            {prompting ? (
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <ActivityIndicator color='#fff' />
                <Text style={styles.unlockText}>Unlocking…</Text>
              </View>
            ) : (
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <Ionicons name='lock-open-outline' size={18} color='#fff' />
                <Text style={styles.unlockText}>Unlock</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={goToLogin}
            disabled={prompting}
            style={styles.logoutBtn}
          >
            <Text style={styles.logoutText}>Use password instead</Text>
          </Pressable>

          <Text style={styles.tiny}>
            If you cancel biometrics, you’ll be returned to login.
          </Text>
        </View>
      </View>
    )
  }

  return <>{children}</>
}

const styles = StyleSheet.create({
  fullCenter: {
    flex: 1,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  bootCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#eef2f7',
    alignItems: 'center',
  },
  bootIcon: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  bootTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  bootSub: {
    marginTop: 6,
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    textAlign: 'center',
  },

  lockWrap: {
    flex: 1,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  lockCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#eef2f7',
    alignItems: 'center',
  },
  lockIcon: {
    width: 56,
    height: 56,
    borderRadius: 22,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  lockTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  lockSub: {
    marginTop: 6,
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
    textAlign: 'center',
  },

  unlockBtn: {
    width: '100%',
    height: 52,
    borderRadius: 16,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unlockText: { color: '#fff', fontWeight: '700' },

  logoutBtn: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 10 },
  logoutText: { color: '#2563eb', fontWeight: '600' },

  tiny: {
    marginTop: 10,
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
    textAlign: 'center',
  },
})
