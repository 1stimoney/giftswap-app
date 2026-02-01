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

export default function ChangePinPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [userId, setUserId] = useState<string | null>(null)
  const [pinHash, setPinHash] = useState<string | null>(null)

  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')

  const canSubmit = useMemo(() => {
    return (
      !!userId &&
      !!pinHash &&
      currentPin.length === 4 &&
      newPin.length === 4 &&
      confirmPin.length === 4 &&
      newPin === confirmPin &&
      !saving
    )
  }, [userId, pinHash, currentPin, newPin, confirmPin, saving])

  const load = async () => {
    try {
      setLoading(true)
      const { data } = await supabase.auth.getUser()
      const user = data.user
      if (!user) return

      setUserId(user.id)

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('withdraw_pin_hash')
        .eq('id', user.id)
        .single()

      if (error) throw error
      setPinHash(profile?.withdraw_pin_hash ?? null)
    } catch (e) {
      console.error(e)
      Alert.alert('Error', 'Failed to load PIN info')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleChangePin = async () => {
    if (!userId) return
    if (!pinHash) {
      Alert.alert(
        'No PIN yet',
        'You don’t have a withdrawal PIN set. Create one from the withdrawal screen.'
      )
      return
    }
    if (newPin !== confirmPin) {
      Alert.alert('Mismatch', 'New PIN and confirm PIN do not match')
      return
    }

    try {
      setSaving(true)

      const enteredOldHash = await sha256(`${userId}:${currentPin}`)
      if (enteredOldHash !== pinHash) {
        Alert.alert('Wrong PIN', 'Your current PIN is incorrect.')
        return
      }

      const newHash = await sha256(`${userId}:${newPin}`)

      const { error } = await supabase
        .from('profiles')
        .update({ withdraw_pin_hash: newHash, withdraw_pin_enabled: true })
        .eq('id', userId)

      if (error) throw error

      setPinHash(newHash)
      setCurrentPin('')
      setNewPin('')
      setConfirmPin('')

      Alert.alert('✅ PIN Updated', 'Your withdrawal PIN has been changed.')
      router.back()
    } catch (e: any) {
      console.error(e)
      Alert.alert('Error', e?.message || 'Failed to change PIN')
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
          <Text style={styles.title}>Change PIN</Text>
          <View style={{ width: 44 }} />
        </View>

        <Text style={styles.subtitle}>
          Enter your current PIN and choose a new one.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Current PIN</Text>
          <TextInput
            value={currentPin}
            onChangeText={(t) =>
              setCurrentPin(t.replace(/\D/g, '').slice(0, 4))
            }
            placeholder='••••'
            placeholderTextColor='#94a3b8'
            keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
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
            onPress={handleChangePin}
            disabled={!canSubmit}
            style={[styles.btn, !canSubmit && { opacity: 0.6 }]}
          >
            {saving ? (
              <View style={styles.btnRow}>
                <ActivityIndicator color='#fff' />
                <Text style={styles.btnText}>Saving…</Text>
              </View>
            ) : (
              <Text style={styles.btnText}>Update PIN</Text>
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
