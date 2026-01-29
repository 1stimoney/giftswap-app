import { supabase } from '@/lib/supabase'
import { useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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

  // Forgot password modal state
  const [showReset, setShowReset] = useState(false)
  const [resetStep, setResetStep] = useState<1 | 2 | 3>(1)
  const [resetEmail, setResetEmail] = useState('')
  const [resetOtp, setResetOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  // 🔄 Check if user already signed in
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) router.replace('/(tabs)')
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

    if (error) Alert.alert('Login failed', error.message)
    else router.replace('/(tabs)')
  }

  // ✅ Step 1: send OTP to email
  const sendResetCode = async () => {
    const targetEmail = (resetEmail || email).trim().toLowerCase()
    if (!targetEmail) return Alert.alert('Missing email', 'Enter your email.')

    try {
      setResetting(true)

      // IMPORTANT: shouldCreateUser:false prevents creating accounts via OTP
      const { error } = await supabase.auth.signInWithOtp({
        email: targetEmail,
        options: {
          shouldCreateUser: false,
        },
      })

      if (error) {
        // If the email doesn't exist, Supabase often returns a generic error depending on settings
        return Alert.alert('Failed', error.message)
      }

      Alert.alert('Code sent', 'Check your email for the verification code.')
      setResetStep(2)
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong')
    } finally {
      setResetting(false)
    }
  }

  // ✅ Step 2: verify OTP
  const verifyResetCode = async () => {
    const targetEmail = (resetEmail || email).trim().toLowerCase()
    if (!targetEmail) return Alert.alert('Missing email', 'Enter your email.')
    if (!resetOtp.trim()) return Alert.alert('Missing code', 'Enter the code.')

    try {
      setResetting(true)

      // For email OTP, use type: 'email'
      const { data, error } = await supabase.auth.verifyOtp({
        email: targetEmail,
        token: resetOtp.trim(),
        type: 'email',
      })

      if (error) return Alert.alert('Invalid code', error.message)

      // If verified, user is now authenticated (session created)
      if (!data.session) {
        // very rare, but handle gracefully
        return Alert.alert(
          'Error',
          'Verification succeeded but session was not created. Try again.'
        )
      }

      Alert.alert('Verified', 'Now set your new password.')
      setResetStep(3)
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong')
    } finally {
      setResetting(false)
    }
  }

  // ✅ Step 3: update password (requires session)
  const setPasswordAfterOtp = async () => {
    if (!newPassword || newPassword.length < 6) {
      return Alert.alert('Weak password', 'Use at least 6 characters.')
    }
    if (newPassword !== confirmNewPassword) {
      return Alert.alert('Mismatch', 'Passwords do not match.')
    }

    try {
      setResetting(true)

      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        return Alert.alert('Session missing', 'Please verify the code again.')
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) return Alert.alert('Failed', error.message)

      Alert.alert('Success', 'Password updated. Please sign in.')
      // optional: sign out so user signs in cleanly with new password
      await supabase.auth.signOut()

      // reset modal state
      setShowReset(false)
      setResetStep(1)
      setResetOtp('')
      setNewPassword('')
      setConfirmNewPassword('')
      setResetEmail('')
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong')
    } finally {
      setResetting(false)
    }
  }

  const openReset = () => {
    setShowReset(true)
    setResetStep(1)
    setResetEmail(email) // convenience
    setResetOtp('')
    setNewPassword('')
    setConfirmNewPassword('')
  }

  const closeReset = () => {
    setShowReset(false)
    setResetStep(1)
    setResetOtp('')
    setNewPassword('')
    setConfirmNewPassword('')
    setResetEmail('')
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

            {/* ✅ Forgot Password */}
            <TouchableOpacity style={{ marginTop: 14 }} onPress={openReset}>
              <Text style={styles.linkText}>
                Forgot password? <Text style={styles.linkAccent}>Reset</Text>
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

      {/* ✅ Reset Modal */}
      <Modal visible={showReset} transparent animationType='fade'>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reset Password</Text>

            {/* Step indicator */}
            <Text style={styles.modalStep}>Step {resetStep} of 3</Text>

            {resetStep === 1 && (
              <>
                <Text style={styles.modalDesc}>
                  Enter your email. We’ll send a verification code.
                </Text>

                <TextInput
                  style={styles.input}
                  placeholder='Email'
                  placeholderTextColor='#888'
                  autoCapitalize='none'
                  keyboardType='email-address'
                  value={resetEmail}
                  onChangeText={setResetEmail}
                />

                <TouchableOpacity
                  style={[styles.button, resetting && { opacity: 0.7 }]}
                  disabled={resetting}
                  onPress={sendResetCode}
                >
                  <Text style={styles.buttonText}>
                    {resetting ? 'Sending...' : 'Send Code'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {resetStep === 2 && (
              <>
                <Text style={styles.modalDesc}>
                  Enter the code we sent to your email.
                </Text>

                <TextInput
                  style={styles.input}
                  placeholder='Verification code'
                  placeholderTextColor='#888'
                  keyboardType='number-pad'
                  value={resetOtp}
                  onChangeText={setResetOtp}
                />

                <TouchableOpacity
                  style={[styles.button, resetting && { opacity: 0.7 }]}
                  disabled={resetting}
                  onPress={verifyResetCode}
                >
                  <Text style={styles.buttonText}>
                    {resetting ? 'Verifying...' : 'Verify Code'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ marginTop: 12 }}
                  onPress={sendResetCode}
                  disabled={resetting}
                >
                  <Text style={styles.linkText}>
                    Didn’t get it? <Text style={styles.linkAccent}>Resend</Text>
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {resetStep === 3 && (
              <>
                <Text style={styles.modalDesc}>Set your new password.</Text>

                <TextInput
                  style={styles.input}
                  placeholder='New password'
                  placeholderTextColor='#888'
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
                <TextInput
                  style={styles.input}
                  placeholder='Confirm new password'
                  placeholderTextColor='#888'
                  secureTextEntry
                  value={confirmNewPassword}
                  onChangeText={setConfirmNewPassword}
                />

                <TouchableOpacity
                  style={[styles.button, resetting && { opacity: 0.7 }]}
                  disabled={resetting}
                  onPress={setPasswordAfterOtp}
                >
                  <Text style={styles.buttonText}>
                    {resetting ? 'Saving...' : 'Update Password'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={{ marginTop: 14 }} onPress={closeReset}>
              <Text style={[styles.linkText, { color: '#111827' }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#f8fafc',
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

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  modalStep: {
    color: '#6b7280',
    marginBottom: 12,
    fontSize: 13,
  },
  modalDesc: {
    color: '#374151',
    marginBottom: 10,
    fontSize: 14,
  },
})
