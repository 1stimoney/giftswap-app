import { canUseBiometrics, promptBiometric } from '@/lib/biometrics'
import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useMemo, useState } from 'react'
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
import { SafeAreaView } from 'react-native-safe-area-context'

const DEVICE_BIO_KEY = 'biometric_enabled_on_device_v1'

type ScreenMode = 'checking' | 'signin' | 'unlock'

export default function SignIn() {
  const router = useRouter()

  const [mode, setMode] = useState<ScreenMode>('checking')

  // Normal sign-in fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Unlock-mode fields (session already exists)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [sessionEmail, setSessionEmail] = useState<string>('') // for display + password fallback
  const [sessionUserId, setSessionUserId] = useState<string>('')

  const [signingIn, setSigningIn] = useState(false)
  const [showPass, setShowPass] = useState(false)

  // Forgot password modal state
  const [showReset, setShowReset] = useState(false)
  const [resetStep, setResetStep] = useState<1 | 2 | 3>(1)
  const [resetEmail, setResetEmail] = useState('')
  const [resetOtp, setResetOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  const canSubmit = useMemo(() => {
    return email.trim().length > 3 && password.length >= 6 && !signingIn
  }, [email, password, signingIn])

  const canUnlockWithPassword = useMemo(() => {
    return unlockPassword.length >= 6 && !signingIn
  }, [unlockPassword, signingIn])

  // ✅ Decide screen mode on load
  useEffect(() => {
    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const session = data.session

        if (!session) {
          setMode('signin')
          return
        }

        // session exists: get user
        const { data: u } = await supabase.auth.getUser()
        const user = u?.user
        if (!user) {
          setMode('signin')
          return
        }

        setSessionEmail(user.email ?? '')
        setSessionUserId(user.id)

        // check local device flag first
        const enabledOnDevice =
          (await SecureStore.getItemAsync(DEVICE_BIO_KEY)) === 'true'
        if (!enabledOnDevice) {
          // If session exists and device flag is off, just go in
          router.replace('/(tabs)')
          return
        }

        // check DB toggle
        const { data: sec } = await supabase
          .from('security_settings')
          .select('biometric_login')
          .eq('user_id', user.id)
          .maybeSingle()

        const biometricLoginEnabled = !!sec?.biometric_login

        if (biometricLoginEnabled) {
          // ✅ show unlock screen, don't redirect
          setMode('unlock')
          return
        }

        // biometric not enabled in DB -> allow entry
        router.replace('/(tabs)')
      } catch (e) {
        setMode('signin')
      }
    }

    init()
  }, [router])

  // -------------------- AUTH ACTIONS --------------------
  const handleSignIn = async () => {
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) return Alert.alert('Missing email', 'Enter your email')
    if (!password) return Alert.alert('Missing password', 'Enter your password')

    try {
      setSigningIn(true)

      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      })

      if (error) return Alert.alert('Login failed', error.message)

      router.replace('/(tabs)')
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong')
    } finally {
      setSigningIn(false)
    }
  }

  const unlockWithBiometrics = async () => {
    try {
      setSigningIn(true)

      const support = await canUseBiometrics()
      if (!support.ok) {
        Alert.alert(
          'Biometrics not ready',
          support.hasHardware
            ? 'Please enroll Face ID / Touch ID in your device settings.'
            : 'This device does not support biometrics.'
        )
        return
      }

      const res = await promptBiometric('Unlock GiftSwap')
      if (!res.success) return

      router.replace('/(tabs)')
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not use biometrics')
    } finally {
      setSigningIn(false)
    }
  }

  // Password fallback for unlock mode (session exists)
  const unlockWithPassword = async () => {
    if (!sessionEmail) {
      Alert.alert(
        'Error',
        'Could not detect session email. Use another account.'
      )
      return
    }
    if (!unlockPassword)
      return Alert.alert('Missing password', 'Enter your password')

    try {
      setSigningIn(true)

      // Re-auth using existing email + entered password
      const { error } = await supabase.auth.signInWithPassword({
        email: sessionEmail.trim().toLowerCase(),
        password: unlockPassword,
      })

      if (error) return Alert.alert('Wrong password', error.message)

      router.replace('/(tabs)')
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong')
    } finally {
      setSigningIn(false)
    }
  }

  const useAnotherAccount = async () => {
    try {
      setSigningIn(true)
      await supabase.auth.signOut()
      setUnlockPassword('')
      setEmail('')
      setPassword('')
      setMode('signin')
    } finally {
      setSigningIn(false)
    }
  }

  // -------------------- RESET PASSWORD --------------------
  const sendResetCode = async () => {
    const targetEmail = (resetEmail || email || sessionEmail)
      .trim()
      .toLowerCase()
    if (!targetEmail) return Alert.alert('Missing email', 'Enter your email.')

    try {
      setResetting(true)

      const { error } = await supabase.auth.signInWithOtp({
        email: targetEmail,
        options: { shouldCreateUser: false },
      })

      if (error) return Alert.alert('Failed', error.message)

      Alert.alert('Code sent', 'Check your email for the verification code.')
      setResetStep(2)
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong')
    } finally {
      setResetting(false)
    }
  }

  const verifyResetCode = async () => {
    const targetEmail = (resetEmail || email || sessionEmail)
      .trim()
      .toLowerCase()
    if (!targetEmail) return Alert.alert('Missing email', 'Enter your email.')
    if (!resetOtp.trim()) return Alert.alert('Missing code', 'Enter the code.')

    try {
      setResetting(true)

      const { data, error } = await supabase.auth.verifyOtp({
        email: targetEmail,
        token: resetOtp.trim(),
        type: 'email',
      })

      if (error) return Alert.alert('Invalid code', error.message)

      if (!data.session) {
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
      await supabase.auth.signOut()

      closeReset()
      setMode('signin')
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong')
    } finally {
      setResetting(false)
    }
  }

  const openReset = () => {
    setShowReset(true)
    setResetStep(1)
    setResetEmail((email || sessionEmail).trim())
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

  // -------------------- UI --------------------
  if (mode === 'checking') {
    return (
      <View style={styles.loader}>
        <StatusBar style='dark' backgroundColor='#fff' />
        <ActivityIndicator size='large' color='#2563eb' />
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <StatusBar style='dark' backgroundColor='#fff' />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.safe}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps='handled'
        >
          {/* Header */}
          <View style={styles.headerCard}>
            <View style={styles.brandRow}>
              <View style={styles.logoCircle}>
                <Ionicons name='swap-horizontal' size={18} color='#fff' />
              </View>
              <Text style={styles.brandName}>GiftSwap</Text>
            </View>

            <Text style={styles.title}>
              {mode === 'unlock' ? 'Unlock your account' : 'Welcome back'}
            </Text>
            <Text style={styles.subtitle}>
              {mode === 'unlock'
                ? 'Use biometrics or your password to continue.'
                : 'Sign in to trade gift cards and manage withdrawals.'}
            </Text>
          </View>

          {/* Main Card */}
          <View style={styles.card}>
            {mode === 'unlock' ? (
              <>
                {/* Account hint */}
                <View style={styles.accountPill}>
                  <Ionicons
                    name='person-circle-outline'
                    size={18}
                    color='#0f172a'
                  />
                  <Text style={styles.accountText} numberOfLines={1}>
                    {sessionEmail || 'Signed in session'}
                  </Text>
                </View>

                {/* Password only */}
                <View style={styles.field}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons
                      name='lock-closed-outline'
                      size={18}
                      color='#94a3b8'
                    />
                    <TextInput
                      style={styles.input}
                      placeholder='Enter your password'
                      placeholderTextColor='#94a3b8'
                      secureTextEntry={!showPass}
                      value={unlockPassword}
                      onChangeText={setUnlockPassword}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPass((p) => !p)}
                      style={styles.eyeBtn}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={showPass ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color='#64748b'
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Biometrics button */}
                <TouchableOpacity
                  style={[styles.primaryBtn, signingIn && { opacity: 0.65 }]}
                  onPress={unlockWithBiometrics}
                  disabled={signingIn}
                  activeOpacity={0.85}
                >
                  {signingIn ? (
                    <ActivityIndicator color='#fff' />
                  ) : (
                    <>
                      <Ionicons
                        name='finger-print-outline'
                        size={20}
                        color='#fff'
                      />
                      <Text style={styles.primaryText}>
                        Unlock with biometrics
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Password fallback */}
                <TouchableOpacity
                  style={[
                    styles.secondaryBtn,
                    (!canUnlockWithPassword || signingIn) && { opacity: 0.6 },
                  ]}
                  onPress={unlockWithPassword}
                  disabled={!canUnlockWithPassword || signingIn}
                  activeOpacity={0.85}
                >
                  <Ionicons name='key-outline' size={18} color='#0f172a' />
                  <Text style={styles.secondaryText}>Unlock with password</Text>
                </TouchableOpacity>

                <View style={styles.linksRow}>
                  <TouchableOpacity onPress={openReset} activeOpacity={0.7}>
                    <Text style={styles.linkText}>
                      Forgot password?{' '}
                      <Text style={styles.linkAccent}>Reset</Text>
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={useAnotherAccount}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.linkText}>
                      Use another account{' '}
                      <Text style={styles.linkAccent}>Sign out</Text>
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                {/* Normal Sign in */}
                <View style={styles.field}>
                  <Text style={styles.label}>Email</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons name='mail-outline' size={18} color='#94a3b8' />
                    <TextInput
                      style={styles.input}
                      placeholder='you@email.com'
                      placeholderTextColor='#94a3b8'
                      keyboardType='email-address'
                      autoCapitalize='none'
                      value={email}
                      onChangeText={setEmail}
                    />
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons
                      name='lock-closed-outline'
                      size={18}
                      color='#94a3b8'
                    />
                    <TextInput
                      style={styles.input}
                      placeholder='Your password'
                      placeholderTextColor='#94a3b8'
                      secureTextEntry={!showPass}
                      value={password}
                      onChangeText={setPassword}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPass((p) => !p)}
                      style={styles.eyeBtn}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={showPass ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color='#64748b'
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    (!canSubmit || signingIn) && { opacity: 0.6 },
                  ]}
                  onPress={handleSignIn}
                  disabled={!canSubmit || signingIn}
                  activeOpacity={0.85}
                >
                  {signingIn ? (
                    <ActivityIndicator color='#fff' />
                  ) : (
                    <>
                      <Text style={styles.primaryText}>Sign in</Text>
                      <Ionicons name='arrow-forward' size={18} color='#fff' />
                    </>
                  )}
                </TouchableOpacity>

                <View style={styles.linksRow}>
                  <TouchableOpacity onPress={openReset} activeOpacity={0.7}>
                    <Text style={styles.linkText}>
                      Forgot password?{' '}
                      <Text style={styles.linkAccent}>Reset</Text>
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => router.push('/(auth)/sign-up')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.linkText}>
                      New here?{' '}
                      <Text style={styles.linkAccent}>Create account</Text>
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.tipBox}>
                  <Ionicons
                    name='shield-checkmark-outline'
                    size={18}
                    color='#0f172a'
                  />
                  <Text style={styles.tipText}>
                    Enable <Text style={{ fontWeight: '800' }}>Biometrics</Text>{' '}
                    in Security for faster, safer login.
                  </Text>
                </View>
              </>
            )}
          </View>
        </ScrollView>

        {/* ✅ Reset Modal */}
        <Modal visible={showReset} transparent animationType='fade'>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Reset password</Text>
                <TouchableOpacity onPress={closeReset} activeOpacity={0.7}>
                  <Ionicons name='close' size={22} color='#0f172a' />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalStep}>Step {resetStep} of 3</Text>

              {resetStep === 1 && (
                <>
                  <Text style={styles.modalDesc}>
                    Enter your email and we’ll send a verification code.
                  </Text>

                  <View style={styles.inputWrapModal}>
                    <Ionicons name='mail-outline' size={18} color='#94a3b8' />
                    <TextInput
                      style={styles.inputModal}
                      placeholder='Email'
                      placeholderTextColor='#94a3b8'
                      autoCapitalize='none'
                      keyboardType='email-address'
                      value={resetEmail}
                      onChangeText={setResetEmail}
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryBtn, resetting && { opacity: 0.7 }]}
                    disabled={resetting}
                    onPress={sendResetCode}
                    activeOpacity={0.85}
                  >
                    {resetting ? (
                      <ActivityIndicator color='#fff' />
                    ) : (
                      <>
                        <Text style={styles.primaryText}>Send code</Text>
                        <Ionicons name='mail' size={18} color='#fff' />
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {resetStep === 2 && (
                <>
                  <Text style={styles.modalDesc}>
                    Enter the code sent to your email.
                  </Text>

                  <View style={styles.inputWrapModal}>
                    <Ionicons name='key-outline' size={18} color='#94a3b8' />
                    <TextInput
                      style={styles.inputModal}
                      placeholder='Verification code'
                      placeholderTextColor='#94a3b8'
                      keyboardType='number-pad'
                      value={resetOtp}
                      onChangeText={setResetOtp}
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryBtn, resetting && { opacity: 0.7 }]}
                    disabled={resetting}
                    onPress={verifyResetCode}
                    activeOpacity={0.85}
                  >
                    {resetting ? (
                      <ActivityIndicator color='#fff' />
                    ) : (
                      <>
                        <Text style={styles.primaryText}>Verify</Text>
                        <Ionicons name='checkmark' size={18} color='#fff' />
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{ marginTop: 12 }}
                    onPress={sendResetCode}
                    disabled={resetting}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.linkText}>
                      Didn’t get it?{' '}
                      <Text style={styles.linkAccent}>Resend</Text>
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {resetStep === 3 && (
                <>
                  <Text style={styles.modalDesc}>Set your new password.</Text>

                  <View style={styles.inputWrapModal}>
                    <Ionicons
                      name='lock-closed-outline'
                      size={18}
                      color='#94a3b8'
                    />
                    <TextInput
                      style={styles.inputModal}
                      placeholder='New password'
                      placeholderTextColor='#94a3b8'
                      secureTextEntry
                      value={newPassword}
                      onChangeText={setNewPassword}
                    />
                  </View>

                  <View style={styles.inputWrapModal}>
                    <Ionicons
                      name='lock-closed-outline'
                      size={18}
                      color='#94a3b8'
                    />
                    <TextInput
                      style={styles.inputModal}
                      placeholder='Confirm new password'
                      placeholderTextColor='#94a3b8'
                      secureTextEntry
                      value={confirmNewPassword}
                      onChangeText={setConfirmNewPassword}
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryBtn, resetting && { opacity: 0.7 }]}
                    disabled={resetting}
                    onPress={setPasswordAfterOtp}
                    activeOpacity={0.85}
                  >
                    {resetting ? (
                      <ActivityIndicator color='#fff' />
                    ) : (
                      <>
                        <Text style={styles.primaryText}>Update password</Text>
                        <Ionicons name='save-outline' size={18} color='#fff' />
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={{ marginTop: 14 }}
                onPress={closeReset}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.linkText,
                    { color: '#0f172a', fontWeight: '800' },
                  ]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 18 },

  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },

  headerCard: {
    backgroundColor: '#0f172a',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  logoCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { color: '#fff', fontWeight: '700', fontSize: 14 },

  title: { fontSize: 24, fontWeight: '700', color: '#fff' },
  subtitle: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '500',
    fontSize: 13,
  },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eef2f7',
  },

  accountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  accountText: { flex: 1, color: '#0f172a', fontWeight: '600' },

  field: { marginBottom: 12 },
  label: { fontSize: 12, color: '#64748b', fontWeight: '600', marginBottom: 8 },

  inputWrap: {
    height: 54,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: { flex: 1, color: '#0f172a', fontWeight: '600' },
  eyeBtn: { padding: 8 },

  primaryBtn: {
    marginTop: 10,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  secondaryBtn: {
    marginTop: 10,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  secondaryText: { color: '#0f172a', fontWeight: '700', fontSize: 14 },

  linksRow: { marginTop: 14, gap: 10, alignItems: 'center' },
  linkText: { color: '#64748b', fontWeight: '600' },
  linkAccent: { color: '#2563eb', fontWeight: '700' },

  tipBox: {
    marginTop: 14,
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  tipText: { flex: 1, color: '#0f172a', fontWeight: '600', fontSize: 12 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.55)',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 22, padding: 16 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  modalStep: {
    marginTop: 6,
    color: '#64748b',
    fontWeight: '600',
    fontSize: 12,
  },
  modalDesc: {
    marginTop: 10,
    color: '#334155',
    fontWeight: '600',
    fontSize: 13,
  },

  inputWrapModal: {
    marginTop: 12,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inputModal: { flex: 1, color: '#0f172a', fontWeight: '600' },
})
