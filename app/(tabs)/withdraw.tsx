import { supabase } from '@/lib/supabase'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

interface BankInfo {
  id: string
  bank_name: string
  account_number: string
  account_name: string
}

interface Withdrawal {
  id: string
  amount: number
  status: string
  created_at: string
  bank: BankInfo
}

const AnimatedText = Animated.createAnimatedComponent(Text)

export default function WithdrawPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [balance, setBalance] = useState<number>(0)
  const balanceValue = useSharedValue(0)
  const [bankAccounts, setBankAccounts] = useState<BankInfo[]>([])
  const [selectedBank, setSelectedBank] = useState<BankInfo | null>(null)
  const [amount, setAmount] = useState('')
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // new bank info
  const [newBankName, setNewBankName] = useState('')
  const [newAccountNumber, setNewAccountNumber] = useState('')
  const [newAccountName, setNewAccountName] = useState('')

  // ✅ Animate balance count-up
  useEffect(() => {
    balanceValue.value = withTiming(balance, { duration: 800 })
  }, [balance])

  const animatedProps = useAnimatedProps(() => ({
    text: `₦${Math.floor(balanceValue.value).toLocaleString()}`,
  }))

  // ✅ Fetch user data
  const fetchUser = useCallback(async () => {
    const { data, error } = await supabase.auth.getUser()
    if (!error && data.user) setUserId(data.user.id)
  }, [])

  // ✅ Fetch all data (balance, banks, withdrawals)
  const fetchData = useCallback(async () => {
    if (!userId) return
    try {
      setLoading(true)

      // Balance
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', userId)
        .single()
      if (profileErr) throw profileErr
      setBalance(profile.balance)

      // Banks
      const { data: banks, error: bankErr } = await supabase
        .from('user_bank_info')
        .select('*')
        .eq('user_id', userId)
      if (bankErr) throw bankErr
      setBankAccounts(banks)
      if (banks.length > 0) setSelectedBank(banks[0])

      // Withdrawals
      const { data: wd, error: wdErr } = await supabase
        .from('withdrawals')
        .select('*, bank:bank_id(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (wdErr) throw wdErr
      setWithdrawals(wd)
    } catch (err) {
      console.error(err)
      Alert.alert('Error', 'Failed to fetch data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [userId])

  // ✅ Pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchData()
  }, [fetchData])

  useEffect(() => {
    fetchUser()
  }, [])

  useEffect(() => {
    if (userId) fetchData()
  }, [userId])

  // ✅ Withdraw
  const handleWithdraw = async () => {
    if (!amount || !selectedBank)
      return Alert.alert('Missing info', 'Enter amount and select a bank')

    const amt = parseFloat(amount)
    if (amt > balance)
      return Alert.alert('Insufficient Balance', 'Reduce your amount')

    try {
      const { error } = await supabase.from('withdrawals').insert({
        user_id: userId,
        bank_id: selectedBank.id,
        amount: amt,
        status: 'pending',
      })
      if (error) throw error

      Alert.alert('✅ Withdrawal Requested')
      setAmount('')
      setWithdrawals((prev) => [
        {
          id: Math.random().toString(),
          amount: amt,
          status: 'pending',
          created_at: new Date().toISOString(),
          bank: selectedBank!,
        },
        ...prev,
      ])
      setBalance((prev) => prev - amt)
    } catch (err) {
      console.error(err)
      Alert.alert('Error', 'Failed to submit withdrawal')
    }
  }

  // ✅ Add new bank
  const handleAddBank = async () => {
    if (!newBankName || !newAccountNumber || !newAccountName)
      return Alert.alert('Please fill all fields')

    try {
      const { data, error } = await supabase
        .from('user_bank_info')
        .insert([
          {
            user_id: userId,
            bank_name: newBankName,
            account_number: newAccountNumber,
            account_name: newAccountName,
          },
        ])
        .select()
        .single()

      if (error) throw error

      setBankAccounts((prev) => [...prev, data])
      setSelectedBank(data)
      setNewBankName('')
      setNewAccountNumber('')
      setNewAccountName('')

      Alert.alert('✅ Bank Added Successfully')
    } catch (err) {
      console.error(err)
      Alert.alert('Error', 'Failed to add bank')
    }
  }

  if (loading)
    return (
      <View style={styles.loader}>
        <ActivityIndicator size='large' color='#2563eb' />
      </View>
    )

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#2563eb']}
        />
      }
    >
      {/* Header */}
      <LinearGradient
        colors={['#2563eb', '#1d4ed8']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.headerText}>Withdraw Funds</Text>
      </LinearGradient>

      {/* Balance */}
      <View style={styles.balanceBox}>
        <Text style={styles.balanceLabel}>Current Balance</Text>
        <Text style={styles.balanceValue}>₦{balance.toLocaleString()}</Text>
      </View>

      {/* Banks */}
      <Text style={styles.sectionTitle}>Select Bank Account</Text>
      {bankAccounts.length === 0 ? (
        <Text style={styles.noBank}>No bank accounts yet</Text>
      ) : (
        bankAccounts.map((bank) => (
          <TouchableOpacity
            key={bank.id}
            onPress={() => setSelectedBank(bank)}
            style={[
              styles.bankCard,
              selectedBank?.id === bank.id && styles.bankCardSelected,
            ]}
          >
            <Text style={styles.bankText}>
              {bank.bank_name} - {bank.account_number}
            </Text>
            <Text style={styles.bankSub}>{bank.account_name}</Text>
          </TouchableOpacity>
        ))
      )}

      {/* Add new bank */}
      <Text style={styles.sectionTitle}>Add New Bank</Text>
      <TextInput
        style={styles.input}
        placeholder='Bank Name'
        placeholderTextColor='#9ca3af'
        value={newBankName}
        onChangeText={setNewBankName}
      />
      <TextInput
        style={styles.input}
        placeholder='Account Number'
        placeholderTextColor='#9ca3af'
        keyboardType='numeric'
        value={newAccountNumber}
        onChangeText={setNewAccountNumber}
      />
      <TextInput
        style={styles.input}
        placeholder='Account Name'
        placeholderTextColor='#9ca3af'
        value={newAccountName}
        onChangeText={setNewAccountName}
      />
      <TouchableOpacity onPress={handleAddBank} style={styles.actionButton}>
        <LinearGradient
          colors={['#22c55e', '#16a34a']}
          style={styles.gradientButton}
        >
          <Text style={styles.actionText}>Add Bank</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Withdraw */}
      <Text style={styles.sectionTitle}>Withdraw Funds</Text>
      <TextInput
        style={styles.input}
        placeholder='Enter Amount'
        placeholderTextColor='#9ca3af'
        keyboardType='numeric'
        value={amount}
        onChangeText={setAmount}
      />
      <TouchableOpacity onPress={handleWithdraw} style={styles.actionButton}>
        <LinearGradient
          colors={['#2563eb', '#1d4ed8']}
          style={styles.gradientButton}
        >
          <Text style={styles.actionText}>Withdraw</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* History */}
      <Text style={styles.sectionTitle}>Withdrawal History</Text>
      {withdrawals.length === 0 ? (
        <Text style={styles.noBank}>No withdrawals yet</Text>
      ) : (
        <FlatList
          data={withdrawals}
          scrollEnabled={false}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.withdrawCard}>
              <Text style={styles.withdrawAmount}>
                ₦{item.amount.toLocaleString()}
              </Text>
              <Text style={styles.withdrawBank}>
                {item.bank?.bank_name} - {item.bank?.account_number}
              </Text>
              <Text style={styles.withdrawDate}>
                {new Date(item.created_at).toLocaleString()}
              </Text>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor:
                      item.status === 'approved'
                        ? '#dcfce7'
                        : item.status === 'rejected'
                        ? '#fee2e2'
                        : '#fef9c3',
                  },
                ]}
              >
                <Text
                  style={{
                    color:
                      item.status === 'approved'
                        ? '#16a34a'
                        : item.status === 'rejected'
                        ? '#dc2626'
                        : '#ca8a04',
                    fontWeight: '600',
                  }}
                >
                  {item.status.toUpperCase()}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    borderRadius: 20,
    paddingVertical: 22,
    margin: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  headerText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  balanceBox: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    elevation: 2,
  },
  balanceLabel: { color: '#6b7280', fontSize: 15 },
  balanceValue: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111827',
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 10,
  },
  bankCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  bankCardSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  bankText: { fontWeight: '600', color: '#111827' },
  bankSub: { color: '#6b7280', marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 12,
    color: '#111827',
    fontSize: 15,
  },
  actionButton: { marginHorizontal: 20, marginBottom: 14 },
  gradientButton: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  withdrawCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  withdrawAmount: { fontWeight: '700', color: '#111827', fontSize: 16 },
  withdrawBank: { color: '#6b7280', marginTop: 4 },
  withdrawDate: { color: '#9ca3af', marginTop: 2 },
  statusBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  noBank: { color: '#6b7280', textAlign: 'center', marginTop: 10 },
})
