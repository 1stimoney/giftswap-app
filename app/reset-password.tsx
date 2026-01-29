// app/reset-password.tsx
import { supabase } from '@/lib/supabase'
import { useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

export default function ResetPassword() {
  const router = useRouter()

  const [checking, setChecking] = useState(true)
  const [saving, setSaving] = useState(false)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // ✅ Ensure we actually have a recovery session before allowing reset
  useEffect(() => {
    let mounted = true

    const check = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        // If user opened this screen without a recovery flow,
        // they won't have a session -> send them back to login.
        if (!data.session) {
          Alert.alert(
            'Reset link required',
            'Please use the password reset link sent to your email.'
          )
          router.replace('/(auth)/login')
          return
        }
      } finally {
        if (mounted) setChecking(false)
      }
    }

    check()
    return () => {
      mounted = false
    }
  }, [])

  const handleSave = async () => {
    if (!password || password.length < 6) {
      return Alert.alert(
        'Weak password',
        'Password must be at least 6 characters.'
      )
    }
    if (password !== confirmPassword) {
      return Alert.alert('Passwords mismatch', 'Both passwords must match.')
    }

    try {
      setSaving(true)

      // ✅ This works during PASSWORD_RECOVERY session
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error

      Alert.alert('✅ Success', 'Password updated successfully!')

      // Sign out the recovery session (recommended), then go login
      await supabase.auth.signOut()
      router.replace('/(auth)/login')
    } catch (e: any) {
      console.error(e)
      Alert.alert('Error', e?.message || 'Failed to update password')
    } finally {
      setSaving(false)
    }
  }

  if (checking) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size='large' color='#2563eb' />
        <Text style={styles.loaderText}>Preparing password reset…</Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.wrapper}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        keyboardShouldPersistTaps='handled'
      >
        <View style={styles.container}>
          <Text style={styles.title}>Set New Password</Text>
          <Text style={styles.subtitle}>
            Choose a strong password you’ll remember.
          </Text>

          <View style={styles.card}>
            <TextInput
              style={styles.input}
              placeholder='New password'
              placeholderTextColor='#888'
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <TextInput
              style={styles.input}
              placeholder='Confirm new password'
              placeholderTextColor='#888'
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />

            <TouchableOpacity
              style={[styles.button, saving && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color='#fff' />
              ) : (
                <Text style={styles.buttonText}>Save Password</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={{ marginTop: 14 }}
              onPress={() => router.replace('/(auth)/login')}
              disabled={saving}
            >
              <Text style={styles.linkText}>
                Back to <Text style={styles.linkAccent}>Login</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#f8fafc' },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    color: '#6b7280',
    marginBottom: 18,
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 340,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  input: {
    borderRadius: 10,
    padding: 12,
    color: '#111827',
    marginBottom: 12,
    borderColor: '#e5e7eb',
    borderWidth: 1,
    width: '100%',
    fontSize: 15,
    backgroundColor: '#f9fafb',
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  linkText: { color: '#6b7280', textAlign: 'center', fontSize: 14 },
  linkAccent: { color: '#2563eb', fontWeight: '700' },
  loader: {
    flex: 1,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: { marginTop: 10, color: '#6b7280', fontWeight: '600' },
})
