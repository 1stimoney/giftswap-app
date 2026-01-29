import { supabase } from '@/lib/supabase'
import { Link, useRouter } from 'expo-router'
import React, { useEffect, useMemo, useState } from 'react'
import {
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

type Step = 'form' | 'verify'

export default function SignUp() {
  const router = useRouter()

  const [step, setStep] = useState<Step>('form')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')

  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)

  // resend cooldown
  const [cooldown, setCooldown] = useState(0)

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((c) => c - 1), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  const showExistsAndGoLogin = () => {
    Alert.alert(
      'Account already exists',
      'A user with this email already exists. Please proceed to login.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Go to Login',
          onPress: () => router.replace('/(auth)/login'),
        },
      ]
    )
  }

  const requestOtp = async () => {
    if (!fullName.trim()) return Alert.alert('Missing', 'Enter your full name')
    if (!username.trim()) return Alert.alert('Missing', 'Enter a username')
    if (!normalizedEmail) return Alert.alert('Missing', 'Enter your email')
    if (!password || password.length < 6)
      return Alert.alert(
        'Weak password',
        'Password must be at least 6 characters'
      )

    setLoading(true)
    try {
      // OTP signup flow (code-based verification)
      // shouldCreateUser=true means if user doesn't exist, Supabase will create it.
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: true,
          data: { username: username.trim(), full_name: fullName.trim() },
        },
      })

      if (error) {
        const msg = (error.message || '').toLowerCase()

        // common "already exists" patterns
        if (
          msg.includes('already registered') ||
          msg.includes('already exists') ||
          msg.includes('user already') ||
          msg.includes('email address already')
        ) {
          showExistsAndGoLogin()
          return
        }

        Alert.alert('Signup failed', error.message)
        return
      }

      setStep('verify')
      setCooldown(30)
      Alert.alert(
        'Verification code sent',
        `We sent a code to ${normalizedEmail}`
      )
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to send verification code')
    } finally {
      setLoading(false)
    }
  }

  const verifyOtpAndFinish = async () => {
    if (!otp.trim())
      return Alert.alert('Missing', 'Enter the verification code')

    setLoading(true)
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: otp.trim(),
        type: 'email',
      })

      if (error) {
        Alert.alert('Invalid code', error.message)
        return
      }

      const user = data.user
      if (!user) {
        Alert.alert('Error', 'No user returned after verification.')
        return
      }

      // Set password AFTER OTP verification (so user can log in with password)
      const { error: passErr } = await supabase.auth.updateUser({
        password,
        data: { username: username.trim(), full_name: fullName.trim() },
      })
      if (passErr) {
        Alert.alert('Error', passErr.message)
        return
      }

      // Create profile row
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email,
        full_name: fullName.trim(),
        username: username.trim(),
        balance: 0,
      })

      if (profileError) {
        // not blocking, but helpful to know
        console.error('Profile upsert error:', profileError)
      }

      Alert.alert('✅ Success', 'Your email is verified. Welcome to GiftSwap!')
      router.replace('/(tabs)')
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  const resendOtp = async () => {
    if (cooldown > 0) return
    setOtp('')
    await requestOtp()
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
          <Text style={styles.title}>
            {step === 'form' ? 'Create Your Account' : 'Verify Your Email'}
          </Text>
          <Text style={styles.subtitle}>
            {step === 'form'
              ? 'Join GiftSwap and start trading smarter 💳'
              : `Enter the code sent to ${normalizedEmail}`}
          </Text>

          <View style={styles.formCard}>
            {step === 'form' ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder='Full Name'
                  value={fullName}
                  onChangeText={setFullName}
                  placeholderTextColor={'#888'}
                />
                <TextInput
                  style={styles.input}
                  placeholder='Username'
                  value={username}
                  onChangeText={setUsername}
                  placeholderTextColor={'#888'}
                  autoCapitalize='none'
                />
                <TextInput
                  style={styles.input}
                  placeholder='Email'
                  keyboardType='email-address'
                  value={email}
                  onChangeText={setEmail}
                  placeholderTextColor={'#888'}
                  autoCapitalize='none'
                />
                <TextInput
                  style={styles.input}
                  placeholder='Password'
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  placeholderTextColor={'#888'}
                />

                <TouchableOpacity
                  style={[styles.button, loading && { opacity: 0.7 }]}
                  onPress={requestOtp}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>
                    {loading ? 'Sending code...' : 'Continue'}
                  </Text>
                </TouchableOpacity>

                <Link href='/(auth)/login' asChild>
                  <TouchableOpacity style={{ marginTop: 16 }}>
                    <Text style={styles.linkText}>
                      Already have an account?{' '}
                      <Text style={styles.linkAccent}>Sign in</Text>
                    </Text>
                  </TouchableOpacity>
                </Link>
              </>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  placeholder='Verification code'
                  value={otp}
                  onChangeText={setOtp}
                  placeholderTextColor={'#888'}
                  keyboardType='number-pad'
                />

                <TouchableOpacity
                  style={[styles.button, loading && { opacity: 0.7 }]}
                  onPress={verifyOtpAndFinish}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>
                    {loading ? 'Verifying...' : 'Verify & Create Account'}
                  </Text>
                </TouchableOpacity>

                <View style={styles.verifyRow}>
                  <TouchableOpacity
                    onPress={() => setStep('form')}
                    disabled={loading}
                    style={{ paddingVertical: 10, paddingHorizontal: 6 }}
                  >
                    <Text style={styles.linkAccent}>← Edit details</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={resendOtp}
                    disabled={loading || cooldown > 0}
                    style={{ paddingVertical: 10, paddingHorizontal: 6 }}
                  >
                    <Text
                      style={[
                        styles.linkAccent,
                        (loading || cooldown > 0) && { opacity: 0.6 },
                      ]}
                    >
                      {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
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
    marginBottom: 14,
    borderColor: '#e5e7eb',
    borderWidth: 1,
    width: '100%',
    fontSize: 15,
    color: '#000',
    backgroundColor: '#f9fafb',
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
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
  verifyRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
})
