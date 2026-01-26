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

export default function SignIn() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)

  // 🔄 Check if user already signed in
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        router.replace('/(tabs)')
      }
      setLoading(false)
    }
    checkSession()
  }, [])

  const handleSignIn = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    setLoading(false)

    if (error) {
      Alert.alert('Login failed', error.message)
    } else {
      router.replace('/(tabs)')
    }
  }

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size='large' color='#2563eb' />
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
          <Text style={styles.title}>Welcome Back 👋</Text>
          <Text style={styles.subtitle}>Sign in to continue to GiftSwap</Text>

          <View style={styles.formCard}>
            <TextInput
              style={styles.input}
              placeholder='Email'
              placeholderTextColor='#888'
              keyboardType='email-address'
              autoCapitalize='none'
              onChangeText={setEmail}
              value={email}
            />

            <TextInput
              style={styles.input}
              placeholder='Password'
              placeholderTextColor='#888'
              secureTextEntry
              onChangeText={setPassword}
              value={password}
            />

            <TouchableOpacity
              style={[styles.button, loading && { opacity: 0.7 }]}
              onPress={handleSignIn}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ marginTop: 16 }}
              onPress={() => router.push('/(auth)/sign-up')}
            >
              <Text style={styles.linkText}>
                Don’t have an account?{' '}
                <Text style={styles.linkAccent}>Sign up</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#f8fafc', // light neutral background
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    color: '#6b7280',
    marginBottom: 20,
    fontSize: 14,
    textAlign: 'center',
  },
  formCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
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
    marginBottom: 14,
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
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  linkText: {
    color: '#6b7280',
    textAlign: 'center',
    fontSize: 14,
  },
  linkAccent: {
    color: '#2563eb',
    fontWeight: '600',
  },
})
