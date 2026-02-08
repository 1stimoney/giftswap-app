import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const OTP_LEN = 6
const RESEND_COOLDOWN = 30

const onlyDigits = (s: string) => (s || '').replace(/\D/g, '')

export default function SecurityPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)

  // settings
  const [withdraw2FA, setWithdraw2FA] = useState(false)
  const [devicesCount, setDevicesCount] = useState<number>(0)

  // Change password modal
  const [showPwdModal, setShowPwdModal] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const canSavePassword = useMemo(() => {
    return (
      currentPassword.length >= 6 &&
      newPassword.length >= 6 &&
      newPassword === confirmNewPassword
    )
  }, [currentPassword, newPassword, confirmNewPassword])

  // ---- Withdraw 2FA verify modal ----
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LEN).fill(''))
  const otpRefs = useRef<(TextInput | null)[]>([])
  const otpValue = useMemo(() => otpDigits.join(''), [otpDigits])
  const otpComplete = useMemo(
    () => otpDigits.every((d) => d.length === 1),
    [otpDigits]
  )

  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((c) => c - 1), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  const resetOtp = () => setOtpDigits(Array(OTP_LEN).fill(''))

  const closeVerifyModalAndRevert = () => {
    setVerifyOpen(false)
    resetOtp()
    setCooldown(0)
    // user cancelled enabling => keep it OFF
    setWithdraw2FA(false)
  }

  // load settings
  const init = async () => {
    try {
      setPageLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // ensure row exists then fetch
      await supabase
        .from('security_settings')
        .upsert({ user_id: user.id }, { onConflict: 'user_id' })

      const { data: sec } = await supabase
        .from('security_settings')
        .select('withdraw_2fa_enabled')
        .eq('user_id', user.id)
        .maybeSingle()

      setWithdraw2FA(!!sec?.withdraw_2fa_enabled)

      // devices count (optional)
      const { count } = await supabase
        .from('push_tokens')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)

      setDevicesCount(count ?? 0)
    } finally {
      setPageLoading(false)
    }
  }

  useEffect(() => {
    init()
  }, [])

  // ✅ Change password flow
  const handleChangePassword = async () => {
    if (!canSavePassword) return

    try {
      setLoading(true)

      const email = (await supabase.auth.getUser()).data.user?.email
      if (!email) throw new Error('No email found for this account.')

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (signInErr) throw new Error('Current password is wrong.')

      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      })
      if (updateErr) throw updateErr

      Alert.alert('Success', 'Password updated successfully ✅')
      setShowPwdModal(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  // ---------- OTP UI handlers ----------
  const focusOtp = (idx: number) => otpRefs.current?.[idx]?.focus?.()

  const handleOtpChange = (idx: number, v: string) => {
    const digits = onlyDigits(v)

    // paste support (multiple digits)
    if (digits.length > 1) {
      const arr = digits.slice(0, OTP_LEN).split('')
      setOtpDigits((prev) => prev.map((_, i) => arr[i] ?? ''))
      const next = Math.min(arr.length, OTP_LEN) - 1
      setTimeout(() => focusOtp(Math.max(next, 0)), 10)
      return
    }

    const digit = digits.slice(-1)
    setOtpDigits((prev) => {
      const next = [...prev]
      next[idx] = digit
      return next
    })

    if (digit && idx < OTP_LEN - 1) setTimeout(() => focusOtp(idx + 1), 10)
  }

  const handleOtpKeyPress = (idx: number, key: string) => {
    if (key !== 'Backspace') return

    if (otpDigits[idx]) {
      setOtpDigits((prev) => {
        const next = [...prev]
        next[idx] = ''
        return next
      })
      return
    }

    if (idx > 0) {
      setTimeout(() => focusOtp(idx - 1), 10)
      setOtpDigits((prev) => {
        const next = [...prev]
        next[idx - 1] = ''
        return next
      })
    }
  }

  const pasteOtp = async () => {
    const text = await Clipboard.getStringAsync()
    const digits = onlyDigits(text).slice(0, OTP_LEN)
    if (!digits) {
      Alert.alert('Nothing to paste', 'Copy the code from your email first.')
      return
    }
    const arr = digits.split('')
    setOtpDigits((prev) => prev.map((_, i) => arr[i] ?? ''))
    if (digits.length < OTP_LEN) focusOtp(digits.length)
  }

  // ---------- Withdraw 2FA (Email OTP using Supabase Auth) ----------
  const sendEnableCode = async () => {
    try {
      setVerifying(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      const email = user?.email
      if (!email) throw new Error('No email found for this account.')

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      })
      if (error) throw error

      setCooldown(RESEND_COOLDOWN)
      setVerifyOpen(true)
      resetOtp()
      setTimeout(() => focusOtp(0), 350)

      Alert.alert('Code sent', 'Check your email for the verification code.')
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to send code')
      // sending failed => revert toggle
      setWithdraw2FA(false)
      setVerifyOpen(false)
      resetOtp()
      setCooldown(0)
    } finally {
      setVerifying(false)
    }
  }

  const verifyEnableCode = async () => {
    if (!otpComplete) {
      Alert.alert('Missing', 'Enter the 6-digit code.')
      return
    }

    try {
      setVerifying(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      const email = user?.email
      if (!email) throw new Error('No email found for this account.')

      // verify OTP
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otpValue,
        type: 'email',
      })
      if (error) throw error

      // persist in your table
      await supabase.from('security_settings').upsert(
        {
          user_id: user.id,
          withdraw_2fa_enabled: true,
          withdraw_2fa_verified_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

      setWithdraw2FA(true)
      setVerifyOpen(false)
      resetOtp()
      setCooldown(0)

      Alert.alert('✅ Enabled', 'Withdrawal 2FA is now active.')
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Wrong/expired code')
    } finally {
      setVerifying(false)
    }
  }

  const resendEnableCode = async () => {
    if (cooldown > 0 || verifying) return
    resetOtp()
    await sendEnableCode()
  }

  const disableWithdraw2FA = async () => {
    Alert.alert('Disable Withdrawal 2FA?', 'You can enable it again anytime.', [
      { text: 'Cancel', style: 'cancel', onPress: () => setWithdraw2FA(true) },
      {
        text: 'Disable',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true)
            const {
              data: { user },
            } = await supabase.auth.getUser()
            if (!user) return

            const { error } = await supabase
              .from('security_settings')
              .update({ withdraw_2fa_enabled: false })
              .eq('user_id', user.id)

            if (error) throw error

            setWithdraw2FA(false)
            Alert.alert('Disabled', 'Withdrawal 2FA has been turned off.')
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Failed to disable 2FA')
            setWithdraw2FA(true)
          } finally {
            setLoading(false)
          }
        },
      },
    ])
  }

  const handleWithdraw2FAToggle = async (v: boolean) => {
    if (loading || verifying) return

    // turning off
    if (!v) {
      disableWithdraw2FA()
      return
    }

    // turning on: do NOT set ON permanently yet; only after verification
    setWithdraw2FA(true) // visual switch ON while modal is active
    await sendEnableCode()
  }

  if (pageLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loader}>
          <ActivityIndicator size='large' color='#2563eb' />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style='dark' backgroundColor='#fff' />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.replace('/(tabs)/settings')}
        >
          <Ionicons name='chevron-back' size={22} color='#0f172a' />
        </Pressable>

        <Text style={styles.headerTitle}>Security</Text>
        <View style={{ width: 44 }} />
      </View>

      <Text style={styles.subText}>
        The safety of your account is our priority 🪪
      </Text>

      <View style={styles.card}>
        <SecurityRow
          icon='key-outline'
          label='Change Password'
          onPress={() => setShowPwdModal(true)}
        />
        <SecurityRow
          icon='alert-circle-outline'
          label='Reset Pin'
          onPress={() => router.push('/security/reset-pin')}
        />
        <SecurityRow
          icon='grid-outline'
          label='Change Pin'
          onPress={() => router.push('/security/change-pin')}
        />
        <SecurityRow
          icon='finger-print-outline'
          label='Biometrics'
          onPress={() => router.push('/security/biometrics')}
        />

        <SecurityRow
          icon='keypad-outline'
          label='Withdrawal 2FA (Email)'
          right={
            <Switch
              value={withdraw2FA}
              onValueChange={handleWithdraw2FAToggle}
              trackColor={{ false: '#e2e8f0', true: '#16a34a' }}
              thumbColor='#fff'
              disabled={loading || verifying}
            />
          }
          onPress={() => {}}
        />

        <SecurityRow
          icon='phone-portrait-outline'
          label='Active Devices'
          right={<Text style={styles.countText}>{devicesCount}</Text>}
          onPress={() =>
            Alert.alert(
              'Active Devices',
              'We’ll create a page that lists devices from push_tokens (device_id + platform).'
            )
          }
        />
      </View>

      {/* Change Password Modal */}
      <Modal visible={showPwdModal} transparent animationType='slide'>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => !loading && setShowPwdModal(false)}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Change Password</Text>

            <Text style={styles.fieldLabel}>Current password</Text>
            <TextInput
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              placeholder='Enter current password'
              placeholderTextColor='#94a3b8'
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>New password</Text>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholder='Enter new password'
              placeholderTextColor='#94a3b8'
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>Confirm new password</Text>
            <TextInput
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
              secureTextEntry
              placeholder='Confirm new password'
              placeholderTextColor='#94a3b8'
              style={styles.input}
            />

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                (!canSavePassword || loading) && { opacity: 0.6 },
              ]}
              disabled={!canSavePassword || loading}
              onPress={handleChangePassword}
            >
              {loading ? (
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 10,
                    alignItems: 'center',
                  }}
                >
                  <ActivityIndicator color='#fff' />
                  <Text style={styles.primaryText}>Updating…</Text>
                </View>
              ) : (
                <Text style={styles.primaryText}>Update Password</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              disabled={loading}
              onPress={() => setShowPwdModal(false)}
            >
              <Text style={styles.secondaryText}>Cancel</Text>
            </TouchableOpacity>

            {newPassword.length > 0 &&
            confirmNewPassword.length > 0 &&
            newPassword !== confirmNewPassword ? (
              <Text style={styles.hintError}>Passwords do not match.</Text>
            ) : (
              <Text style={styles.hint}>Minimum 6 characters.</Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Withdrawal 2FA Verify Modal */}
      <Modal
        visible={verifyOpen}
        transparent
        animationType='fade'
        onRequestClose={() => !verifying && closeVerifyModalAndRevert()}
      >
        <Pressable
          style={styles.verifyOverlay}
          onPress={() => !verifying && closeVerifyModalAndRevert()}
        >
          <Pressable style={styles.verifyCard} onPress={() => {}}>
            <View style={styles.verifyTop}>
              <Text style={styles.verifyTitle}>Verify your email</Text>
              <TouchableOpacity
                disabled={verifying}
                onPress={closeVerifyModalAndRevert}
              >
                <Ionicons name='close' size={22} color='#0f172a' />
              </TouchableOpacity>
            </View>

            <Text style={styles.verifySub}>
              Enter the 6-digit code we sent to your email.
            </Text>

            <View style={styles.otpRow}>
              {otpDigits.map((d, i) => (
                <TextInput
                  key={i}
                  ref={(r) => {
                    otpRefs.current[i] = r
                  }}
                  value={d}
                  onChangeText={(t) => handleOtpChange(i, t)}
                  onKeyPress={({ nativeEvent }) =>
                    handleOtpKeyPress(i, nativeEvent.key)
                  }
                  keyboardType='number-pad'
                  maxLength={1}
                  style={[styles.otpBox, d ? styles.otpBoxFilled : null]}
                  placeholder='•'
                  placeholderTextColor='#cbd5e1'
                  textAlign='center'
                />
              ))}
            </View>

            <TouchableOpacity
              style={[
                styles.verifyBtn,
                (!otpComplete || verifying) && { opacity: 0.6 },
              ]}
              disabled={!otpComplete || verifying}
              onPress={verifyEnableCode}
            >
              {verifying ? (
                <ActivityIndicator color='#fff' />
              ) : (
                <Text style={styles.verifyBtnText}>Confirm</Text>
              )}
            </TouchableOpacity>

            <View style={styles.verifyLinks}>
              <Pressable
                style={styles.smallLink}
                onPress={pasteOtp}
                disabled={verifying}
              >
                <Ionicons name='clipboard-outline' size={16} color='#2563eb' />
                <Text style={styles.smallLinkText}>Paste</Text>
              </Pressable>

              <Pressable
                style={styles.smallLink}
                onPress={resendEnableCode}
                disabled={verifying || cooldown > 0}
              >
                <Ionicons name='refresh-outline' size={16} color='#2563eb' />
                <Text
                  style={[
                    styles.smallLinkText,
                    (verifying || cooldown > 0) && { opacity: 0.6 },
                  ]}
                >
                  {cooldown > 0 ? `Resend ${cooldown}s` : 'Resend'}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.verifyNote}>
              If you didn’t get the code, check Spam/Junk.
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

function SecurityRow({
  icon,
  label,
  right,
  onPress,
}: {
  icon: any
  label: string
  right?: React.ReactNode
  onPress: () => void
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowLeft}>
        <View style={styles.iconBox}>
          <Ionicons name={icon} size={18} color='#0f172a' />
        </View>
        <Text style={styles.rowText}>{label}</Text>
      </View>

      <View style={styles.rowRight}>
        {right ?? <Ionicons name='chevron-forward' size={18} color='#94a3b8' />}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#0f172a' },

  subText: {
    paddingHorizontal: 18,
    marginTop: 8,
    marginBottom: 14,
    color: '#94a3b8',
    fontWeight: '800',
  },

  card: {
    marginHorizontal: 18,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
    gap: 10,
  },

  row: {
    backgroundColor: '#f1f5f9',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { fontSize: 15, fontWeight: '900', color: '#0f172a' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  countText: { fontWeight: '900', color: '#0f172a' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 22,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 10,
  },
  fieldLabel: {
    color: '#334155',
    fontWeight: '900',
    marginTop: 10,
    marginBottom: 6,
    fontSize: 12,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#0f172a',
    fontWeight: '700',
  },

  primaryBtn: {
    marginTop: 16,
    backgroundColor: '#0f172a',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '900' },

  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  secondaryText: { color: '#0f172a', fontWeight: '900' },

  hint: {
    marginTop: 10,
    color: '#94a3b8',
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'center',
  },
  hintError: {
    marginTop: 10,
    color: '#b91c1c',
    fontWeight: '900',
    fontSize: 12,
    textAlign: 'center',
  },

  // Verify modal (fintech)
  verifyOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.55)',
    justifyContent: 'center',
    padding: 18,
  },
  verifyCard: { backgroundColor: '#fff', borderRadius: 22, padding: 16 },
  verifyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  verifyTitle: { fontSize: 18, fontWeight: '900', color: '#0f172a' },
  verifySub: { marginTop: 8, color: '#64748b', fontWeight: '700' },

  otpRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  otpBox: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    color: '#0f172a',
    fontWeight: '900',
    fontSize: 18,
  },
  otpBoxFilled: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },

  verifyBtn: {
    marginTop: 14,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyBtnText: { color: '#fff', fontWeight: '900', fontSize: 16 },

  verifyLinks: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  smallLink: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  smallLinkText: { color: '#2563eb', fontWeight: '900' },
  verifyNote: {
    marginTop: 10,
    textAlign: 'center',
    color: '#94a3b8',
    fontWeight: '800',
  },
})
