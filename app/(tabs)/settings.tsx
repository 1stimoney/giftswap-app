import { supabase } from '@/lib/supabase'
import { FLOATING_TAB_HEIGHT } from '@/lib/ui'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

type Profile = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url?: string | null
  is_suspended?: boolean | null
}

export default function SettingsTab() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const bottomSpace = FLOATING_TAB_HEIGHT + insets.bottom + 12

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const [notifEnabled, setNotifEnabled] = useState(true)

  // ✅ delete state
  const [deletingAccount, setDeletingAccount] = useState(false)

  // ✅ auth info for email + created_at
  const [authEmail, setAuthEmail] = useState<string>('')
  const [memberSince, setMemberSince] = useState<string>('')

  const fetchProfile = async () => {
    try {
      setLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setProfile(null)
        setAuthEmail('')
        setMemberSince('')
        return
      }

      setAuthEmail(user.email ?? '')
      if (user.created_at) {
        setMemberSince(new Date(user.created_at).toLocaleDateString())
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, is_suspended')
        .eq('id', user.id)
        .single()

      if (error) throw error
      setProfile(data as Profile)
    } catch (e) {
      console.log(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfile()
  }, [])

  const onToggleNotif = (v: boolean) => {
    setNotifEnabled(v)
    // Later: call registerForPushAndSave() when ON,
    // and delete device token row when OFF if you want.
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
  }

  const confirmDeleteAccount = () => {
    if (deletingAccount) return

    Alert.alert(
      'Delete Account?',
      'This will permanently delete your account and you will lose access.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              'Are you 100% sure? This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete My Account',
                  style: 'destructive',
                  onPress: handleDeleteAccount,
                },
              ]
            )
          },
        },
      ]
    )
  }

  const handleDeleteAccount = async () => {
    try {
      setDeletingAccount(true)

      const { data, error } = await supabase.functions.invoke(
        'delete-account',
        {
          body: {},
        }
      )

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      Alert.alert('Account Deleted', 'Your account has been deleted ✅')

      await supabase.auth.signOut()
      router.replace('/(auth)/login')
    } catch (err: any) {
      console.error(err)
      Alert.alert(
        'Error',
        err?.message ||
          'Failed to delete account. Make sure the delete-account function is deployed.'
      )
    } finally {
      setDeletingAccount(false)
    }
  }

  const name = profile?.username || profile?.full_name || 'User'

  const statusLabel = useMemo(() => {
    if (profile?.is_suspended) return 'Suspended'
    return 'Active'
  }, [profile?.is_suspended])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <StatusBar style='dark' backgroundColor='#fff' />
      <View style={styles.container}>
        {/* Header (fixed) */}
        <View style={styles.header}>
          <Pressable
            style={styles.menuBtn}
            onPress={() => router.push('/chat')}
          >
            <Ionicons
              name='chatbubble-ellipses-outline'
              size={22}
              color='#0f172a'
            />
          </Pressable>

          <Text style={styles.headerTitle}>Settings</Text>

          <Pressable
            style={styles.mailBtn}
            onPress={() => router.push('/notifications')}
          >
            <Ionicons name='notifications-outline' size={20} color='#0f172a' />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size='large' color='#2563eb' />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: bottomSpace }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps='handled'
          >
            {/* User card */}
            <View style={styles.userCard}>
              <View style={styles.userRow}>
                <View style={styles.avatar}>
                  {profile?.avatar_url ? (
                    <Image
                      source={{ uri: profile.avatar_url }}
                      style={styles.avatarImg}
                    />
                  ) : (
                    <Ionicons name='person' size={20} color='#0f172a' />
                  )}
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.usernameText}>{name}</Text>

                  {/* ✅ Replaces level/progress */}
                  <View style={styles.metaWrap}>
                    {!!authEmail ? (
                      <Text style={styles.metaText} numberOfLines={1}>
                        {authEmail}
                      </Text>
                    ) : null}

                    <View style={styles.metaRow}>
                      {!!memberSince ? (
                        <View style={styles.pill}>
                          <Ionicons
                            name='calendar-outline'
                            size={14}
                            color='#0f172a'
                          />
                          <Text style={styles.pillText}>
                            Since {memberSince}
                          </Text>
                        </View>
                      ) : null}

                      <View
                        style={[
                          styles.pill,
                          profile?.is_suspended
                            ? styles.pillWarn
                            : styles.pillOk,
                        ]}
                      >
                        <Ionicons
                          name={
                            profile?.is_suspended
                              ? 'warning-outline'
                              : 'checkmark-circle-outline'
                          }
                          size={14}
                          color={profile?.is_suspended ? '#b45309' : '#166534'}
                        />
                        <Text
                          style={[
                            styles.pillText,
                            {
                              color: profile?.is_suspended
                                ? '#b45309'
                                : '#166534',
                            },
                          ]}
                        >
                          {statusLabel}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* Items */}
            <View style={styles.list}>
              <SettingsRow
                icon='person-outline'
                label='Profile'
                onPress={() => router.push('/profile')}
              />

              <SettingsRow
                icon='notifications-outline'
                label='Notifications'
                right={
                  <View style={styles.rightInline}>
                    <Ionicons
                      name='information-circle-outline'
                      size={16}
                      color='#94a3b8'
                    />
                    <Switch
                      value={notifEnabled}
                      onValueChange={onToggleNotif}
                      trackColor={{ false: '#e2e8f0', true: '#16a34a' }}
                      thumbColor='#ffffff'
                    />
                  </View>
                }
                onPress={() => {}}
              />

              <SettingsRow
                icon='lock-closed-outline'
                label='Security'
                onPress={() => router.push('/security')}
              />

              <SettingsRow
                icon='card-outline'
                label='Linked Bank Accounts'
                right={
                  <Ionicons name='chevron-forward' size={16} color='#94a3b8' />
                }
                onPress={() => router.push('/linked-accounts')}
              />

              <SettingsRow
                icon='chatbubble-ellipses-outline'
                label='Chat with us'
                onPress={() => router.push('/chat')}
              />

              {/* Delete account */}
              <Pressable
                style={[
                  styles.row,
                  styles.deleteRow,
                  deletingAccount && { opacity: 0.7 },
                ]}
                onPress={confirmDeleteAccount}
                disabled={deletingAccount}
              >
                <View style={styles.rowLeft}>
                  <View style={[styles.iconBox, styles.deleteIconBox]}>
                    <Ionicons name='trash-outline' size={18} color='#b91c1c' />
                  </View>
                  <Text style={styles.deleteText}>
                    {deletingAccount ? 'Deleting Account...' : 'Delete Account'}
                  </Text>
                </View>
              </Pressable>

              {/* Logout */}
              <Pressable style={styles.logoutBtn} onPress={handleLogout}>
                <Text style={styles.logoutText}>Logout</Text>
              </Pressable>

              <View style={{ height: 18 }} />
            </View>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  )
}

function SettingsRow({
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
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 14 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  mailBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },

  userCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },

  usernameText: { fontSize: 16, fontWeight: '700', color: '#0f172a' },

  metaWrap: { marginTop: 6 },
  metaText: { fontSize: 12.5, color: '#64748b', fontWeight: '400' },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },

  pill: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  pillOk: { backgroundColor: '#dcfce7' },
  pillWarn: { backgroundColor: '#fffbeb' },
  pillText: { fontSize: 12, fontWeight: '400', color: '#0f172a' },

  list: { gap: 12 },

  row: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rightInline: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  deleteRow: {
    borderWidth: 1,
    borderColor: '#fee2e2',
    backgroundColor: '#fff1f2',
  },
  deleteIconBox: { backgroundColor: '#fee2e2' },
  deleteText: { fontSize: 15, fontWeight: '600', color: '#b91c1c' },

  logoutBtn: {
    marginTop: 8,
    backgroundColor: '#0f172a',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: { color: '#ffffff', fontWeight: '700' },
})
