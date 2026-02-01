import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import * as Crypto from 'expo-crypto'
import { useRouter } from 'expo-router'
import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

async function sha256(input: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input)
}

export default function ResetPinPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string>('')

  const [password, setPassword] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')

  const canSubmit = useMemo(() => {
    return (
      !!userId &&
      !!email &&
      password.trim().length >= 6 &&
      newPin.length === 4 &&
      confirmPin.length === 4 &&
      newPin === confirmPin &&
      !saving
    )
  }, [userId, email, password, newPin, confirmPin, saving])

  const load = async () => {
    try {
      setLoading(true)
      const { data } = await supabase.auth.getUser()
      const user = data.user
      if (!user) return
      setUserId(user.id)
      setEmail(user.email ?? '')
    } catch (e) {
      console.error(e)
      Alert.alert('Error', 'Failed to load user info')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleResetPin = async () => {
    if (!userId) return
    if (newPin !== confirmPin) {
      Alert.alert('Mismatch', 'New PIN and confirm PIN do not match')
      return
    }

    try {
      setSaving(true)

      // ✅ confirm password by re-auth
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        Alert.alert('Wrong password', 'Your password is incorrect.')
        return
      }

      const newHash = await sha256(`${userId}:${newPin}`)

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ withdraw_pin_hash: newHash, withdraw_pin_enabled: true })
        .eq('id', userId)

      if (updateErr) throw updateErr

      setPassword('')
      setNewPin('')
      setConfirmPin('')

      Alert.alert('✅ PIN Reset', 'Your withdrawal PIN has been reset.')
      router.back()
    } catch (e: any) {
      console.error(e)
      Alert.alert('Error', e?.message || 'Failed to reset PIN')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size='large' color='#2563eb' />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={styles.iconBtn}
            onPress={() => router.replace('/security')}
          >
            <Ionicons name='chevron-back' size={22} color='#0f172a' />
          </Pressable>
          <Text style={styles.title}>Reset PIN</Text>
          <View style={{ width: 44 }} />
        </View>

        <Text style={styles.subtitle}>
          Forgot your PIN? Confirm your password and set a new 4-digit PIN.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder='Enter your account password'
            placeholderTextColor='#94a3b8'
            secureTextEntry
            style={styles.input}
          />

          <Text style={styles.label}>New PIN</Text>
          <TextInput
            value={newPin}
            onChangeText={(t) => setNewPin(t.replace(/\D/g, '').slice(0, 4))}
            placeholder='••••'
            placeholderTextColor='#94a3b8'
            keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
            secureTextEntry
            style={styles.input}
          />

          <Text style={styles.label}>Confirm New PIN</Text>
          <TextInput
            value={confirmPin}
            onChangeText={(t) =>
              setConfirmPin(t.replace(/\D/g, '').slice(0, 4))
            }
            placeholder='••••'
            placeholderTextColor='#94a3b8'
            keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
            secureTextEntry
            style={styles.input}
          />

          {newPin.length === 4 &&
          confirmPin.length === 4 &&
          newPin !== confirmPin ? (
            <Text style={styles.warn}>PINs do not match.</Text>
          ) : null}

          <TouchableOpacity
            onPress={handleResetPin}
            disabled={!canSubmit}
            style={[styles.btn, !canSubmit && { opacity: 0.6 }]}
          >
            {saving ? (
              <View style={styles.btnRow}>
                <ActivityIndicator color='#fff' />
                <Text style={styles.btnText}>Resetting…</Text>
              </View>
            ) : (
              <Text style={styles.btnText}>Reset PIN</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, padding: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  title: { fontSize: 18, fontWeight: '900', color: '#0f172a' },
  subtitle: { marginTop: 12, color: '#64748b', fontWeight: '800' },
  card: {
    marginTop: 14,
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  label: { marginTop: 10, color: '#0f172a', fontWeight: '900' },
  input: {
    marginTop: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#0f172a',
    fontWeight: '900',
    fontSize: 16,
  },
  warn: { marginTop: 10, color: '#dc2626', fontWeight: '900' },
  btn: {
    marginTop: 16,
    backgroundColor: '#0f172a',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
})
