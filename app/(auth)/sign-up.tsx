import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { LinearGradient } from 'expo-linear-gradient'
import { Link, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

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
  const [showPass, setShowPass] = useState(false)

  // resend cooldown
  const [cooldown, setCooldown] = useState(0)

  const otpRef = useRef<TextInput>(null)

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((c) => c - 1), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  // Focus OTP input when switching to verify step
  useEffect(() => {
    if (step !== 'verify') return
    const t = setTimeout(() => otpRef.current?.focus(), 350)
    return () => clearTimeout(t)
  }, [step])

  const showExistsAndGoLogin = () => {
    Alert.alert(
      'Account already exists',
      'A user with this email already exists. Please proceed to login.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Go to Login', onPress: () => router.replace('/(auth)/login') },
      ]
    )
  }

  const passwordScore = useMemo(() => scorePassword(password), [password])
  const passwordLabel = useMemo(() => {
    if (password.length === 0) return ' '
    if (passwordScore <= 1) return 'Weak'
    if (passwordScore === 2) return 'Okay'
    if (passwordScore === 3) return 'Good'
    return 'Strong'
  }, [password.length, passwordScore])

  const canRequestOtp = useMemo(() => {
    return (
      fullName.trim().length > 2 &&
      username.trim().length > 2 &&
      normalizedEmail.length > 5 &&
      password.length >= 6 &&
      !loading
    )
  }, [fullName, username, normalizedEmail, password, loading])

  const maskedEmail = useMemo(() => {
    const e = normalizedEmail
    const [name, domain] = e.split('@')
    if (!name || !domain) return e
    const short = name.length <= 2 ? `${name[0]}*` : `${name.slice(0, 2)}***`
    return `${short}@${domain}`
  }, [normalizedEmail])

  const requestOtp = async () => {
    if (!fullName.trim()) return Alert.alert('Missing', 'Enter your full name')
    if (!username.trim()) return Alert.alert('Missing', 'Enter a username')
    if (!normalizedEmail) return Alert.alert('Missing', 'Enter your email')
    if (!password || password.length < 6) {
      return Alert.alert(
        'Weak password',
        'Password must be at least 6 characters'
      )
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: true,
          data: { username: username.trim(), full_name: fullName.trim() },
        },
      })

      if (error) {
        const msg = (error.message || '').toLowerCase()
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
      setOtp('')
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

      const { error: passErr } = await supabase.auth.updateUser({
        password,
        data: { username: username.trim(), full_name: fullName.trim() },
      })
      if (passErr) {
        Alert.alert('Error', passErr.message)
        return
      }

      const { error: profileError } = await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email,
        full_name: fullName.trim(),
        username: username.trim(),
        balance: 0,
      })

      if (profileError) console.error('Profile upsert error:', profileError)

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

  // OTP quick paste button
  const pasteOtpFromClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync()
      const digits = (text || '').replace(/\D/g, '').slice(0, 6)
      if (!digits) {
        Alert.alert('Nothing to paste', 'Copy the code from your email first.')
        return
      }
      setOtp(digits)
      if (digits.length >= 6) {
        // auto-submit
        verifyOtpAndFinish()
      }
    } catch {
      // ignore
    }
  }

  // Auto-submit OTP when complete
  useEffect(() => {
    if (step !== 'verify') return
    if (otp.replace(/\D/g, '').length === 6 && !loading) {
      // slight delay so state settles + feels natural
      const t = setTimeout(() => verifyOtpAndFinish(), 250)
      return () => clearTimeout(t)
    }
  }, [otp, step]) // intentionally not adding loading to avoid re-triggers

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style='dark' backgroundColor='#fff' />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.safe}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps='handled'
        >
          <LinearGradient
            colors={['#0f172a', '#1d4ed8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.brandPill}>
              <Ionicons name='swap-horizontal' size={18} color='#0f172a' />
              <Text style={styles.brandText}>GiftSwap</Text>
            </View>

            <Text style={styles.heroTitle}>
              {step === 'form' ? 'Create account' : 'Verify email'}
            </Text>

            <Text style={styles.heroSub}>
              {step === 'form'
                ? 'Trade gift cards smoothly and securely.'
                : `Enter the code we sent to ${maskedEmail}`}
            </Text>
          </LinearGradient>

          <View style={styles.card}>
            {step === 'form' ? (
              <>
                <Field
                  label='Full name'
                  icon='person-outline'
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder='e.g. John Doe'
                />

                <Field
                  label='Username'
                  icon='at-outline'
                  value={username}
                  onChangeText={setUsername}
                  placeholder='e.g. giftswapking'
                  autoCapitalize='none'
                />

                <Field
                  label='Email'
                  icon='mail-outline'
                  value={email}
                  onChangeText={setEmail}
                  placeholder='you@email.com'
                  autoCapitalize='none'
                  keyboardType='email-address'
                />

                {/* Password with show/hide */}
                <Text style={styles.label}>Password</Text>
                <View style={styles.inputWrap}>
                  <Ionicons
                    name='lock-closed-outline'
                    size={18}
                    color='#94a3b8'
                  />
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder='At least 6 characters'
                    placeholderTextColor='#94a3b8'
                    secureTextEntry={!showPass}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPass((p) => !p)}
                    style={styles.iconBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={showPass ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color='#64748b'
                    />
                  </TouchableOpacity>
                </View>

                {/* Strength meter */}
                <View style={styles.strengthRow}>
                  <View style={styles.strengthTrack}>
                    <View
                      style={[
                        styles.strengthFill,
                        { width: `${(passwordScore / 4) * 100}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.strengthText}>{passwordLabel}</Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    (!canRequestOtp || loading) && { opacity: 0.6 },
                  ]}
                  onPress={requestOtp}
                  disabled={!canRequestOtp || loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color='#fff' />
                  ) : (
                    <>
                      <Text style={styles.primaryText}>Continue</Text>
                      <Ionicons name='arrow-forward' size={18} color='#fff' />
                    </>
                  )}
                </TouchableOpacity>

                <View style={styles.dividerRow}>
                  <View style={styles.divider} />
                  <Text style={styles.dividerText}>
                    Already have an account?
                  </Text>
                  <View style={styles.divider} />
                </View>

                <Link href='/(auth)/login' asChild>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.secondaryText}>Sign in</Text>
                    <Ionicons name='log-in-outline' size={18} color='#0f172a' />
                  </TouchableOpacity>
                </Link>

                <View style={styles.note}>
                  <Ionicons
                    name='shield-checkmark-outline'
                    size={18}
                    color='#0f172a'
                  />
                  <Text style={styles.noteText}>
                    We’ll send a verification code to confirm your email.
                  </Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.verifyTopRow}>
                  <Pressable
                    onPress={() => setStep('form')}
                    disabled={loading}
                    style={({ pressed }) => [
                      styles.linkBtn,
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <Ionicons name='create-outline' size={16} color='#2563eb' />
                    <Text style={styles.linkAccent}>Edit details</Text>
                  </Pressable>

                  <Pressable
                    onPress={pasteOtpFromClipboard}
                    disabled={loading}
                    style={({ pressed }) => [
                      styles.linkBtn,
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <Ionicons
                      name='clipboard-outline'
                      size={16}
                      color='#2563eb'
                    />
                    <Text style={styles.linkAccent}>Paste code</Text>
                  </Pressable>
                </View>

                <Text style={styles.otpLabel}>Verification code</Text>
                <View style={styles.otpWrap}>
                  <Ionicons name='key-outline' size={18} color='#94a3b8' />
                  <TextInput
                    ref={otpRef}
                    style={styles.otpInput}
                    placeholder='Enter 6-digit code'
                    placeholderTextColor='#94a3b8'
                    keyboardType='number-pad'
                    value={otp}
                    onChangeText={(t) =>
                      setOtp(t.replace(/\D/g, '').slice(0, 6))
                    }
                    returnKeyType='done'
                  />
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
                  onPress={verifyOtpAndFinish}
                  disabled={loading || otp.trim().length < 4}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color='#fff' />
                  ) : (
                    <>
                      <Text style={styles.primaryText}>Verify & create</Text>
                      <Ionicons name='checkmark' size={18} color='#fff' />
                    </>
                  )}
                </TouchableOpacity>

                <View style={styles.verifyRow}>
                  <Pressable
                    onPress={resendOtp}
                    disabled={loading || cooldown > 0}
                    style={({ pressed }) => [
                      styles.resendBtn,
                      (loading || cooldown > 0) && { opacity: 0.55 },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Ionicons
                      name='refresh-outline'
                      size={16}
                      color='#0f172a'
                    />
                    <Text style={styles.resendText}>
                      {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                    </Text>
                  </Pressable>
                </View>

                <Text style={styles.verifyHint}>
                  Auto-verify happens when you finish entering the 6 digits.
                </Text>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

/** Field component (simple + consistent) */
function Field(props: {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  value: string
  onChangeText: (v: string) => void
  placeholder: string
  keyboardType?: any
  autoCapitalize?: any
  secureTextEntry?: boolean
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{props.label}</Text>
      <View style={styles.inputWrap}>
        <Ionicons name={props.icon} size={18} color='#94a3b8' />
        <TextInput
          style={styles.input}
          value={props.value}
          onChangeText={props.onChangeText}
          placeholder={props.placeholder}
          placeholderTextColor='#94a3b8'
          keyboardType={props.keyboardType}
          autoCapitalize={props.autoCapitalize}
          secureTextEntry={props.secureTextEntry}
        />
      </View>
    </View>
  )
}

/** Strength scoring: 0..4 */
function scorePassword(pw: string) {
  if (!pw) return 0
  let score = 0
  if (pw.length >= 6) score++
  if (pw.length >= 10) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score++
  return Math.min(score, 4)
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  scroll: { flexGrow: 1, backgroundColor: '#ffffff', paddingBottom: 26 },

  hero: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  brandPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  brandText: { color: '#0f172a', fontWeight: '600' },

  heroTitle: {
    marginTop: 14,
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
  },
  heroSub: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 18,
  },

  card: {
    marginTop: 14,
    marginHorizontal: 18,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eef2f7',
  },

  label: { fontSize: 12, color: '#64748b', fontWeight: '500', marginBottom: 8 },

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
  input: { flex: 1, color: '#0f172a', fontWeight: '500', fontSize: 15 },
  iconBtn: { padding: 8 },

  strengthRow: {
    marginTop: 8,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  strengthTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  // keep default color (no custom) — looks clean with blue fill via primary button color
  strengthFill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#2563eb',
  },
  strengthText: {
    color: '#64748b',
    fontWeight: '500',
    fontSize: 12,
    minWidth: 50,
  },

  primaryBtn: {
    marginTop: 12,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  primaryText: { color: '#fff', fontWeight: '600', fontSize: 16 },

  dividerRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  divider: { flex: 1, height: 1, backgroundColor: '#eef2f7' },
  dividerText: { color: '#94a3b8', fontWeight: '500', fontSize: 12 },

  secondaryBtn: {
    marginTop: 14,
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
  secondaryText: { color: '#0f172a', fontWeight: '600', fontSize: 15 },

  note: {
    marginTop: 14,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#eef2f7',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  noteText: { flex: 1, color: '#0f172a', fontWeight: '500', fontSize: 12 },

  verifyTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  linkAccent: { color: '#2563eb', fontWeight: '600' },

  otpLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 8,
  },
  otpWrap: {
    height: 54,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  otpInput: {
    flex: 1,
    color: '#0f172a',
    fontWeight: '600',
    fontSize: 16,
    letterSpacing: 1,
  },

  verifyRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  resendBtn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  resendText: { color: '#0f172a', fontWeight: '600' },

  verifyHint: {
    marginTop: 10,
    color: '#94a3b8',
    fontWeight: '500',
    fontSize: 12,
    lineHeight: 18,
  },
})
