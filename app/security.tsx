import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

export default function SecurityPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(false)

  // UI-only for now (we’ll persist later)
  const [withdraw2FA, setWithdraw2FA] = useState(false)
  const [biometricsEnabled, setBiometricsEnabled] = useState(false)

  // Active devices count (we can later link this to your push_tokens table)
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

  // ✅ Fetch active devices count from push_tokens (optional, but nice)
  const fetchDevicesCount = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // if you’re saving device_id per device, this becomes meaningful
      const { count } = await supabase
        .from('push_tokens')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)

      setDevicesCount(count ?? 0)
    } catch (e) {
      // silent (not critical)
    }
  }

  useEffect(() => {
    fetchDevicesCount()
  }, [])

  // ✅ Change password flow (asks for current password, then sets new password)
  const handleChangePassword = async () => {
    if (!canSavePassword) return

    try {
      setLoading(true)

      const email = (await supabase.auth.getUser()).data.user?.email
      if (!email) throw new Error('No email found for this account.')

      // Step 1: verify current password by signing in again
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (signInErr) throw new Error('Current password is wrong.')

      // Step 2: update to new password
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

  // PIN items are placeholders for now

  const handleBiometricsToggle = (v: boolean) => {
    setBiometricsEnabled(v)
    Alert.alert(
      'Note',
      'Biometrics is possible, but it works by locking the app locally (FaceID/TouchID). We’ll wire this after.'
    )
  }

  const handleWithdraw2FAToggle = (v: boolean) => {
    setWithdraw2FA(v)
    Alert.alert(
      'Note',
      'This will enforce a PIN before withdrawals. We’ll implement the PIN flow next.'
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
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

      {/* Card */}
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
          label='Withdrawal 2FA'
          right={
            <Switch
              value={withdraw2FA}
              onValueChange={handleWithdraw2FAToggle}
              trackColor={{ false: '#e2e8f0', true: '#16a34a' }}
              thumbColor='#fff'
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
})
