import { supabase } from '@/lib/supabase'
import { useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  Alert,
  Dimensions,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

interface Bank {
  id: string
  bank_name: string
  account_number: string
  account_name: string
}

export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [userProfile, setUserProfile] = useState<any>({
    username: '',
    full_name: '',
    email: '',
    balance: 0,
  })
  const [banks, setBanks] = useState<Bank[]>([])
  const [selectedBank, setSelectedBank] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [newBank, setNewBank] = useState({
    bank_name: '',
    account_number: '',
    account_name: '',
  })

  const [deletingBankId, setDeletingBankId] = useState<string | null>(null)
  const [deletingAccount, setDeletingAccount] = useState(false)

  // Animated balance (kept)
  const balance = useSharedValue(0)
  const animatedBalance = useSharedValue('0')
  const animatedProps = useAnimatedProps(() => ({
    text: `₦${Number(animatedBalance.value).toLocaleString()}`,
  }))

  const fetchProfileData = async () => {
    setLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileData) setUserProfile(profileData)

      const { data: bankData } = await supabase
        .from('user_bank_info')
        .select('*')
        .eq('user_id', user.id)

      setBanks(bankData || [])
      if (bankData && bankData.length > 0) setSelectedBank(bankData[0].id)
      else setSelectedBank(null)

      // Animate balance
      const bal = Number(profileData?.balance ?? 0)
      balance.value = withTiming(bal, { duration: 1500 })
      animatedBalance.value = bal.toString()
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfileData()
    const interval = setInterval(fetchProfileData, 10000) // Auto-refresh every 10s
    return () => clearInterval(interval)
  }, [])

  const handleUpdateProfile = async () => {
    setUpdating(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('profiles')
        .update({
          username: userProfile.username,
          full_name: userProfile.full_name,
        })
        .eq('id', user.id)

      if (error) throw error
      Alert.alert('Success', 'Profile updated successfully!')
    } catch (err) {
      console.error(err)
      Alert.alert('Error', 'Failed to update profile')
    } finally {
      setUpdating(false)
    }
  }

  const handleAddBank = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('user_bank_info')
        .insert([{ user_id: user.id, ...newBank }])

      if (error) throw error
      Alert.alert('Success', 'Bank added successfully!')
      setNewBank({ bank_name: '', account_number: '', account_name: '' })
      setShowModal(false)
      fetchProfileData()
    } catch (err) {
      console.error(err)
      Alert.alert('Error', 'Failed to add bank')
    }
  }

  // ✅ Delete a bank
  const confirmDeleteBank = (bank: Bank) => {
    Alert.alert(
      'Delete Bank Account?',
      `Are you sure you want to delete:\n\n${bank.bank_name} - ${bank.account_number}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => handleDeleteBank(bank.id),
        },
      ]
    )
  }

  const handleDeleteBank = async (bankId: string) => {
    try {
      setDeletingBankId(bankId)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // Important: also match user_id so users can only delete their own bank
      const { error } = await supabase
        .from('user_bank_info')
        .delete()
        .eq('id', bankId)
        .eq('user_id', user.id)

      if (error) throw error

      // Update UI immediately
      setBanks((prev) => prev.filter((b) => b.id !== bankId))
      if (selectedBank === bankId) setSelectedBank(null)

      Alert.alert('Deleted', 'Bank account deleted successfully ✅')
    } catch (err: any) {
      console.error(err)
      Alert.alert('Error', err?.message || 'Failed to delete bank')
    } finally {
      setDeletingBankId(null)
    }
  }

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      router.replace('/(auth)/login')
    } catch (err) {
      console.error(err)
      Alert.alert('Error', 'Failed to logout')
    }
  }

  // ✅ Delete account (calls an Edge Function)
  const confirmDeleteAccount = () => {
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

      // This must be done server-side (Edge Function) using service role
      const { data, error } = await supabase.functions.invoke(
        'delete-account',
        { body: {} }
      )

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      Alert.alert('Account Deleted', 'Your account has been deleted ✅')

      // Sign out + route to login
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

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={fetchProfileData}
          colors={['#2563eb']}
        />
      }
    >
      {' '}
      <ScrollView contentContainerStyle={styles.container}>
        {/* Balance Section */}
        <View style={styles.balanceBox}>
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <Text style={styles.balanceValue}>
            ₦{userProfile.balance?.toLocaleString?.() ?? '0'}
          </Text>
        </View>

        {/* Profile Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          {['full_name', 'username'].map((field) => (
            <TextInput
              key={field}
              value={userProfile[field] || ''}
              onChangeText={(text) =>
                setUserProfile({ ...userProfile, [field]: text })
              }
              placeholder={field.replace('_', ' ')}
              style={styles.input}
              placeholderTextColor={'#555'}
            />
          ))}
          <TextInput
            value={userProfile.email || ''}
            editable={false}
            style={[
              styles.input,
              { backgroundColor: '#f0f0f0', color: '#777' },
            ]}
          />
          <TouchableOpacity
            style={styles.button}
            onPress={handleUpdateProfile}
            disabled={updating}
          >
            <Text style={styles.buttonText}>
              {updating ? 'Updating...' : 'Update Profile'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Linked Banks Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Linked Bank Accounts</Text>

          <FlatList
            data={banks}
            horizontal
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 10 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => setSelectedBank(item.id)}
                activeOpacity={0.9}
                style={[
                  styles.bankCard,
                  selectedBank === item.id && styles.selectedBankCard,
                ]}
              >
                <View style={styles.bankHeader}>
                  <View style={styles.bankAvatar}>
                    <Text style={styles.bankInitials}>
                      {item.bank_name.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bankName}>{item.bank_name}</Text>
                    <Text style={styles.bankAccount}>
                      {item.account_number}
                    </Text>
                  </View>
                </View>

                <View style={styles.bankDetails}>
                  <Text style={styles.bankHolder}>{item.account_name}</Text>
                </View>

                {/* ✅ Delete bank button */}
                <TouchableOpacity
                  onPress={() => confirmDeleteBank(item)}
                  disabled={deletingBankId === item.id}
                  style={[
                    styles.deleteMiniBtn,
                    deletingBankId === item.id && { opacity: 0.6 },
                  ]}
                >
                  <Text style={styles.deleteMiniText}>
                    {deletingBankId === item.id ? 'Deleting...' : 'Delete'}
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            )}
            ListFooterComponent={
              <TouchableOpacity
                onPress={() => setShowModal(true)}
                style={styles.addBankCard}
              >
                <Text style={styles.addBankText}>+ Add Bank</Text>
              </TouchableOpacity>
            }
          />
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        {/* ✅ Delete Account Button */}
        <TouchableOpacity
          style={styles.deleteAccountButton}
          onPress={confirmDeleteAccount}
          disabled={deletingAccount}
        >
          <Text style={styles.deleteAccountText}>
            {deletingAccount ? 'Deleting Account...' : 'Delete Account'}
          </Text>
        </TouchableOpacity>

        {/* Add Bank Modal */}
        <Modal visible={showModal} transparent animationType='slide'>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Add Bank</Text>
              {['bank_name', 'account_number', 'account_name'].map((field) => (
                <TextInput
                  key={field}
                  value={newBank[field as keyof typeof newBank]}
                  onChangeText={(text) =>
                    setNewBank({ ...newBank, [field]: text })
                  }
                  placeholder={field.replace('_', ' ')}
                  placeholderTextColor={'#000'}
                  style={styles.input}
                />
              ))}
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  onPress={() => setShowModal(false)}
                  style={[styles.button, { backgroundColor: '#ccc' }]}
                >
                  <Text>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAddBank} style={styles.button}>
                  <Text style={{ color: '#fff' }}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </ScrollView>
  )
}

const { width } = Dimensions.get('window')

const styles = StyleSheet.create({
  container: { padding: 20 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  balanceBox: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    marginBottom: 25,
    shadowColor: '#2563eb',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  balanceLabel: { color: '#1e3a8a', fontSize: 16, fontWeight: '500' },
  balanceValue: {
    color: '#1e40af',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 4,
  },

  section: { marginBottom: 30 },
  sectionTitle: {
    fontWeight: 'bold',
    fontSize: 20,
    marginBottom: 15,
    color: '#111827',
  },

  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    fontSize: 16,
    color: '#000',
  },

  button: {
    backgroundColor: '#2563eb',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  logoutButton: {
    backgroundColor: '#ef4444',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  logoutText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  // ✅ Delete account button
  deleteAccountButton: {
    backgroundColor: '#111827',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 40,
  },
  deleteAccountText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  bankCard: {
    width: width * 0.62,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 15,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  selectedBankCard: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
    shadowColor: '#2563eb',
    shadowOpacity: 0.25,
    elevation: 5,
  },
  bankHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  bankAvatar: {
    width: 38,
    height: 38,
    borderRadius: 20,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  bankInitials: { color: '#fff', fontWeight: '700', fontSize: 16 },
  bankName: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  bankDetails: { marginTop: 4 },
  bankAccount: { fontSize: 14, color: '#374151', fontWeight: '500' },
  bankHolder: { fontSize: 13, color: '#6b7280' },

  // ✅ delete button on each bank card
  deleteMiniBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  deleteMiniText: { color: '#b91c1c', fontWeight: '700', fontSize: 13 },

  addBankCard: {
    width: width * 0.5,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 15,
    marginRight: 12,
    backgroundColor: '#f8fafc',
    borderStyle: 'dashed',
  },
  addBankText: { fontSize: 15, fontWeight: 'bold', color: '#2563eb' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
})
