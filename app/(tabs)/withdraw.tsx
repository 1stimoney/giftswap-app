import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import * as Crypto from 'expo-crypto'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

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

type ProfilePins = {
  withdraw_pin_hash: string | null
  withdraw_pin_enabled: boolean
  email: string | null
  balance: number
}

const money = (n: number) => `₦${Number(n || 0).toLocaleString()}`

async function sha256(input: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input)
}

export default function WithdrawPage() {
  const router = useRouter()

  const [userId, setUserId] = useState<string | null>(null)
  const [profileEmail, setProfileEmail] = useState<string>('')
  const [balance, setBalance] = useState<number>(0)

  const [bankAccounts, setBankAccounts] = useState<BankInfo[]>([])
  const [selectedBank, setSelectedBank] = useState<BankInfo | null>(null)

  const [amount, setAmount] = useState('')
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // PIN fields from profile
  const [pinHash, setPinHash] = useState<string | null>(null)
  const [pinEnabled, setPinEnabled] = useState<boolean>(true)

  // ---- PIN & password modals state ----
  const [showPwdModal, setShowPwdModal] = useState(false)
  const [pwd, setPwd] = useState('')

  const [showSetPinModal, setShowSetPinModal] = useState(false)
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')

  const [showEnterPinModal, setShowEnterPinModal] = useState(false)
  const [pinEntry, setPinEntry] = useState('')

  // Keep a “pending withdraw” intent so after PIN setup we proceed
  const [pendingWithdraw, setPendingWithdraw] = useState(false)

  const parsedAmount = useMemo(() => {
    const clean = amount.replace(/[^0-9.]/g, '')
    const n = Number(clean)
    return Number.isFinite(n) ? n : 0
  }, [amount])

  const canWithdraw = useMemo(() => {
    return (
      !!selectedBank &&
      parsedAmount > 0 &&
      parsedAmount <= balance &&
      !submitting
    )
  }, [selectedBank, parsedAmount, balance, submitting])

  // ✅ Fetch user id
  const fetchUser = useCallback(async () => {
    const { data, error } = await supabase.auth.getUser()
    if (error) return
    if (data.user) setUserId(data.user.id)
  }, [])

  // ✅ Fetch all data
  const fetchData = useCallback(async () => {
    if (!userId) return
    try {
      setLoading(true)

      // Profile
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('balance, withdraw_pin_hash, withdraw_pin_enabled, email')
        .eq('id', userId)
        .single()

      if (profileErr) throw profileErr
      const p = profile as ProfilePins

      setBalance(Number(p.balance || 0))
      setPinHash(p.withdraw_pin_hash ?? null)
      setPinEnabled(p.withdraw_pin_enabled ?? true)
      setProfileEmail(p.email ?? '')

      // Banks
      const { data: banks, error: bankErr } = await supabase
        .from('user_bank_info')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (bankErr) throw bankErr

      const list = (banks || []).filter((b: any) => !b?.is_hidden)
      setBankAccounts(list)

      if (list.length > 0) {
        // keep selected if still exists
        setSelectedBank((prev) => {
          if (!prev) return list[0]
          const still = list.find((x: BankInfo) => x.id === prev.id)
          return still ?? list[0]
        })
      } else {
        setSelectedBank(null)
      }

      // Withdrawals
      const { data: wd, error: wdErr } = await supabase
        .from('withdrawals')
        .select('*, bank:bank_id(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (wdErr) throw wdErr
      setWithdrawals(wd || [])
    } catch (err) {
      console.error(err)
      Alert.alert('Error', 'Failed to fetch withdrawal data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [userId])

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

  // ---------------- PIN helpers ----------------
  const requirePinBeforeWithdraw = useMemo(() => {
    // If you want PIN always enforced on withdrawals, keep this true.
    // If you want it toggle-based, use: return pinEnabled === true
    return pinEnabled === true
  }, [pinEnabled])

  const openPinGate = () => {
    // New user: no pin hash set yet
    if (!pinHash) {
      setPendingWithdraw(true)
      setShowPwdModal(true)
      return
    }

    // Existing: ask for pin to proceed
    setPendingWithdraw(true)
    setShowEnterPinModal(true)
  }

  const verifyCurrentPassword = async () => {
    try {
      if (!pwd.trim()) {
        Alert.alert('Missing', 'Enter your password to continue')
        return
      }

      setSubmitting(true)

      const email = (await supabase.auth.getUser()).data.user?.email
      if (!email) throw new Error('No email found')

      // Re-auth to confirm password
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: pwd,
      })
      if (error) throw new Error('Wrong password. Please try again.')

      // success -> move to set PIN
      setShowPwdModal(false)
      setPwd('')
      setShowSetPinModal(true)
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Password verification failed')
    } finally {
      setSubmitting(false)
    }
  }

  const saveNewPin = async () => {
    if (!userId) return

    try {
      if (pin.length !== 4 || pin2.length !== 4) {
        Alert.alert('Invalid PIN', 'PIN must be exactly 4 digits')
        return
      }
      if (pin !== pin2) {
        Alert.alert('Mismatch', 'PINs do not match')
        return
      }

      setSubmitting(true)

      const hash = await sha256(`${userId}:${pin}`)

      const { error } = await supabase
        .from('profiles')
        .update({ withdraw_pin_hash: hash, withdraw_pin_enabled: true })
        .eq('id', userId)

      if (error) throw error

      setPinHash(hash)
      setPinEnabled(true)

      setShowSetPinModal(false)
      setPin('')
      setPin2('')

      Alert.alert('✅ PIN Created', 'Your withdrawal PIN is set.')

      // continue withdrawal if it was waiting
      if (pendingWithdraw) {
        setPendingWithdraw(false)
        // we can still ask for pin entry now (optional)
        setShowEnterPinModal(true)
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save PIN')
    } finally {
      setSubmitting(false)
    }
  }

  const verifyPinAndWithdraw = async () => {
    if (!userId) return
    try {
      if (pinEntry.length !== 4) {
        Alert.alert('Invalid', 'Enter your 4-digit PIN')
        return
      }
      if (!pinHash) {
        Alert.alert('Missing PIN', 'Please create a PIN first')
        return
      }

      setSubmitting(true)

      const enteredHash = await sha256(`${userId}:${pinEntry}`)
      if (enteredHash !== pinHash) {
        throw new Error('Wrong PIN. Try again.')
      }

      setShowEnterPinModal(false)
      setPinEntry('')
      setPendingWithdraw(false)

      await submitWithdrawal()
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'PIN verification failed')
    } finally {
      setSubmitting(false)
    }
  }

  // ---------------- Withdrawal ----------------
  const submitWithdrawal = async () => {
    if (!userId) return
    if (!selectedBank) {
      Alert.alert('No bank selected', 'Please select a bank account.')
      return
    }

    const amt = parsedAmount

    if (!amt || amt <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid amount.')
      return
    }

    if (amt > balance) {
      Alert.alert('Insufficient Balance', 'Reduce your amount.')
      return
    }

    try {
      setSubmitting(true)

      const { error } = await supabase.from('withdrawals').insert({
        user_id: userId,
        bank_id: selectedBank.id,
        amount: amt,
        status: 'pending',
      })

      if (error) throw error

      Alert.alert('✅ Withdrawal Requested', 'Your request is being processed.')

      setAmount('')
      setWithdrawals((prev) => [
        {
          id: Math.random().toString(),
          amount: amt,
          status: 'pending',
          created_at: new Date().toISOString(),
          bank: selectedBank,
        },
        ...prev,
      ])
      setBalance((prev) => prev - amt)
    } catch (e) {
      console.error(e)
      Alert.alert('Error', 'Failed to submit withdrawal')
    } finally {
      setSubmitting(false)
    }
  }

  const handleWithdrawPressed = async () => {
    if (!canWithdraw) return

    // If you require PIN, gate it
    if (requirePinBeforeWithdraw) {
      openPinGate()
      return
    }

    await submitWithdrawal()
  }

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size='large' color='#2563eb' />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      contentContainerStyle={{ paddingBottom: 30 }}
    >
      {/* Header */}
      <LinearGradient
        colors={['#0f172a', '#1d4ed8']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name='chevron-back' size={22} color='#ffffff' />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Withdraw</Text>
          <Text style={styles.headerSub}>
            Fast payouts • Secure withdrawals
          </Text>
        </View>

        <Pressable
          style={styles.manageBtn}
          onPress={() => router.push('/linked-accounts')} // 🔁 change route if needed
        >
          <Ionicons name='card-outline' size={18} color='#0f172a' />
          <Text style={styles.manageText}>Manage</Text>
        </Pressable>
      </LinearGradient>

      {/* Balance card */}
      <View style={styles.balanceCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceValue}>{money(balance)}</Text>
        </View>

        <View style={styles.pill}>
          <Ionicons name='shield-checkmark-outline' size={16} color='#16a34a' />
          <Text style={styles.pillText}>
            {pinHash ? 'PIN Active' : 'Set PIN'}
          </Text>
        </View>
      </View>

      {/* Bank picker */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Payout account</Text>
          <TouchableOpacity
            onPress={() => router.push('/linked-accounts')}
            style={styles.linkBtn}
          >
            <Text style={styles.linkText}>Manage account</Text>
            <Ionicons name='chevron-forward' size={16} color='#2563eb' />
          </TouchableOpacity>
        </View>

        {bankAccounts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name='card-outline' size={22} color='#94a3b8' />
            <Text style={styles.emptyTitle}>No bank account added</Text>
            <Text style={styles.emptySub}>
              Add a payout account to withdraw earnings.
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/linked-accounts')}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>Add bank account</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.bankWrap}>
            {bankAccounts.map((b) => {
              const selected = selectedBank?.id === b.id
              return (
                <Pressable
                  key={b.id}
                  onPress={() => setSelectedBank(b)}
                  style={[styles.bankCard, selected && styles.bankCardSelected]}
                >
                  <View style={styles.bankIcon}>
                    <Ionicons
                      name='card-outline'
                      size={18}
                      color={selected ? '#2563eb' : '#0f172a'}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.bankName}>{b.bank_name}</Text>
                    <Text style={styles.bankMeta}>
                      {b.account_number} • {b.account_name}
                    </Text>
                  </View>

                  {selected ? (
                    <Ionicons
                      name='checkmark-circle'
                      size={20}
                      color='#2563eb'
                    />
                  ) : (
                    <Ionicons
                      name='ellipse-outline'
                      size={20}
                      color='#cbd5e1'
                    />
                  )}
                </Pressable>
              )
            })}
          </View>
        )}
      </View>

      {/* Amount + Withdraw */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Withdrawal amount</Text>

        <View style={styles.amountBox}>
          <Text style={styles.currency}>₦</Text>
          <TextInput
            style={styles.amountInput}
            placeholder='0'
            placeholderTextColor='#94a3b8'
            keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
            value={amount}
            onChangeText={setAmount}
          />
        </View>

        <Text style={styles.hint}>
          {parsedAmount > balance
            ? 'Amount exceeds your balance.'
            : 'Withdrawals are processed within 0–24 hours.'}
        </Text>

        <TouchableOpacity
          onPress={handleWithdrawPressed}
          disabled={!canWithdraw}
          style={[styles.withdrawBtn, !canWithdraw && { opacity: 0.55 }]}
        >
          <LinearGradient
            colors={['#2563eb', '#1d4ed8']}
            style={styles.withdrawBtnInner}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {submitting ? (
              <View
                style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}
              >
                <ActivityIndicator color='#fff' />
                <Text style={styles.withdrawText}>Processing…</Text>
              </View>
            ) : (
              <Text style={styles.withdrawText}>Withdraw</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* History */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Withdrawal history</Text>

        {withdrawals.length === 0 ? (
          <Text style={styles.noHistory}>No withdrawals yet</Text>
        ) : (
          <FlatList
            data={withdrawals}
            scrollEnabled={false}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <View style={styles.historyCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyAmount}>{money(item.amount)}</Text>
                  <Text style={styles.historyMeta}>
                    {item.bank?.bank_name} • {item.bank?.account_number}
                  </Text>
                  <Text style={styles.historyDate}>
                    {new Date(item.created_at).toLocaleString()}
                  </Text>
                </View>

                <View
                  style={[
                    styles.badge,
                    item.status === 'approved'
                      ? styles.badgeApproved
                      : item.status === 'rejected'
                      ? styles.badgeRejected
                      : styles.badgePending,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      item.status === 'approved'
                        ? { color: '#16a34a' }
                        : item.status === 'rejected'
                        ? { color: '#dc2626' }
                        : { color: '#ca8a04' },
                    ]}
                  >
                    {item.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            )}
          />
        )}
      </View>

      {/* -------- Password confirm modal -------- */}
      <Modal visible={showPwdModal} transparent animationType='slide'>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => !submitting && setShowPwdModal(false)}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Confirm password</Text>
            <Text style={styles.sheetSub}>
              For your safety, confirm your password to create a withdrawal PIN.
            </Text>

            <TextInput
              value={pwd}
              onChangeText={setPwd}
              secureTextEntry
              placeholder='Enter your password'
              placeholderTextColor='#94a3b8'
              style={styles.sheetInput}
            />

            <TouchableOpacity
              style={[
                styles.sheetBtn,
                (!pwd || submitting) && { opacity: 0.6 },
              ]}
              disabled={!pwd || submitting}
              onPress={verifyCurrentPassword}
            >
              <Text style={styles.sheetBtnText}>
                {submitting ? 'Verifying…' : 'Continue'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetCancel}
              disabled={submitting}
              onPress={() => setShowPwdModal(false)}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* -------- Set PIN modal -------- */}
      <Modal visible={showSetPinModal} transparent animationType='slide'>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => !submitting && setShowSetPinModal(false)}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Create withdrawal PIN</Text>
            <Text style={styles.sheetSub}>
              Set a 4-digit PIN you’ll use for withdrawals.
            </Text>

            <TextInput
              value={pin}
              onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 4))}
              placeholder='Enter 4-digit PIN'
              placeholderTextColor='#94a3b8'
              keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
              secureTextEntry
              style={styles.sheetInput}
            />

            <TextInput
              value={pin2}
              onChangeText={(t) => setPin2(t.replace(/\D/g, '').slice(0, 4))}
              placeholder='Confirm PIN'
              placeholderTextColor='#94a3b8'
              keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
              secureTextEntry
              style={styles.sheetInput}
            />

            <TouchableOpacity
              style={[
                styles.sheetBtn,
                (pin.length !== 4 || pin2.length !== 4 || submitting) && {
                  opacity: 0.6,
                },
              ]}
              disabled={pin.length !== 4 || pin2.length !== 4 || submitting}
              onPress={saveNewPin}
            >
              <Text style={styles.sheetBtnText}>
                {submitting ? 'Saving…' : 'Save PIN'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetCancel}
              disabled={submitting}
              onPress={() => setShowSetPinModal(false)}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* -------- Enter PIN modal -------- */}
      <Modal visible={showEnterPinModal} transparent animationType='slide'>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => !submitting && setShowEnterPinModal(false)}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Enter PIN</Text>
            <Text style={styles.sheetSub}>
              Confirm your withdrawal with your 4-digit PIN.
            </Text>

            <TextInput
              value={pinEntry}
              onChangeText={(t) =>
                setPinEntry(t.replace(/\D/g, '').slice(0, 4))
              }
              placeholder='••••'
              placeholderTextColor='#94a3b8'
              keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
              secureTextEntry
              style={styles.sheetInput}
            />

            <TouchableOpacity
              style={[
                styles.sheetBtn,
                (pinEntry.length !== 4 || submitting) && { opacity: 0.6 },
              ]}
              disabled={pinEntry.length !== 4 || submitting}
              onPress={verifyPinAndWithdraw}
            >
              <Text style={styles.sheetBtnText}>
                {submitting ? 'Checking…' : 'Confirm Withdrawal'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetCancel}
              disabled={submitting}
              onPress={() => setShowEnterPinModal(false)}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    margin: 16,
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  headerSub: {
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
    fontWeight: '800',
  },

  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
  },
  manageText: { color: '#0f172a', fontWeight: '800' },

  balanceCard: {
    marginHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  balanceLabel: { color: '#64748b', fontWeight: '800' },
  balanceValue: {
    marginTop: 6,
    fontSize: 28,
    fontWeight: '900',
    color: '#0f172a',
  },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  pillText: { color: '#16a34a', fontWeight: '900' },

  section: { marginTop: 16, marginHorizontal: 16 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: '#0f172a' },

  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { color: '#2563eb', fontWeight: '900' },

  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  emptyTitle: { fontWeight: '900', color: '#0f172a', marginTop: 4 },
  emptySub: { color: '#64748b', fontWeight: '800', textAlign: 'center' },

  primaryBtn: {
    marginTop: 8,
    backgroundColor: '#0f172a',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  primaryBtnText: { color: '#fff', fontWeight: '900' },

  bankWrap: { gap: 10 },
  bankCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  bankCardSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  bankIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankName: { fontWeight: '700', color: '#0f172a' },
  bankMeta: { marginTop: 3, color: '#64748b', fontWeight: '600', fontSize: 12 },

  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 10,
  },
  currency: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
    marginRight: 8,
  },
  amountInput: { flex: 1, fontSize: 18, fontWeight: '600', color: '#0f172a' },

  hint: { marginTop: 8, color: '#94a3b8', fontWeight: '600' },

  withdrawBtn: { marginTop: 12 },
  withdrawBtnInner: {
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#1d4ed8',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 4,
  },
  withdrawText: { color: '#fff', fontWeight: '900', fontSize: 16 },

  noHistory: {
    marginTop: 10,
    color: '#94a3b8',
    fontWeight: '800',
    textAlign: 'center',
  },

  historyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  historyAmount: { fontWeight: '700', color: '#0f172a', fontSize: 16 },
  historyMeta: { marginTop: 4, color: '#64748b', fontWeight: '800' },
  historyDate: {
    marginTop: 2,
    color: '#94a3b8',
    fontWeight: '800',
    fontSize: 12,
  },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgePending: { backgroundColor: '#fef9c3' },
  badgeApproved: { backgroundColor: '#dcfce7' },
  badgeRejected: { backgroundColor: '#fee2e2' },
  badgeText: { fontWeight: '900' },

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
  sheetTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  sheetSub: { marginTop: 6, color: '#64748b', fontWeight: '800' },
  sheetInput: {
    marginTop: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#0f172a',
    fontWeight: '800',
  },
  sheetBtn: {
    marginTop: 14,
    backgroundColor: '#0f172a',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sheetBtnText: { color: '#fff', fontWeight: '900' },
  sheetCancel: {
    marginTop: 10,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sheetCancelText: { color: '#0f172a', fontWeight: '900' },
})
