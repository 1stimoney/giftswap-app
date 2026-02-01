import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

type BankRow = {
  id: string
  bank_name: string
  account_number: string
  account_name: string
  created_at?: string
  is_hidden?: boolean
}

export default function BanksPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [banks, setBanks] = useState<BankRow[]>([])

  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    bank_name: '',
    account_number: '',
    account_name: '',
  })

  const canSave = useMemo(() => {
    return (
      form.bank_name.trim().length >= 2 &&
      form.account_number.trim().length >= 6 &&
      form.account_name.trim().length >= 2
    )
  }, [form])

  const fetchBanks = async () => {
    try {
      setLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('user_bank_info')
        .select(
          'id, bank_name, account_number, account_name, created_at, is_hidden'
        )
        .eq('user_id', user.id)
        .eq('is_hidden', false)
        .order('created_at', { ascending: false })

      if (error) throw error
      setBanks((data as BankRow[]) || [])
    } catch (e: any) {
      console.log(e)
      Alert.alert('Error', e?.message || 'Failed to load banks')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBanks()
  }, [])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchBanks()
    setRefreshing(false)
  }

  const openAdd = () => {
    setForm({ bank_name: '', account_number: '', account_name: '' })
    setShowAddModal(true)
  }

  const handleAddBank = async () => {
    if (!canSave) return
    try {
      setSaving(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const payload = {
        user_id: user.id,
        bank_name: form.bank_name.trim(),
        account_number: form.account_number.trim(),
        account_name: form.account_name.trim(),
        is_hidden: false,
      }

      const { data, error } = await supabase
        .from('user_bank_info')
        .insert([payload])
        .select(
          'id, bank_name, account_number, account_name, created_at, is_hidden'
        )
        .single()

      if (error) throw error

      // optimistic add
      setBanks((prev) => [data as BankRow, ...prev])
      setShowAddModal(false)
    } catch (e: any) {
      console.log(e)
      Alert.alert('Error', e?.message || 'Failed to add bank')
    } finally {
      setSaving(false)
    }
  }

  const confirmHideBank = (bank: BankRow) => {
    Alert.alert(
      'Remove bank?',
      `This bank will be hidden from you (not deleted).\n\n${bank.bank_name} • ${bank.account_number}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => handleHideBank(bank.id),
        },
      ]
    )
  }

  const handleHideBank = async (bankId: string) => {
    try {
      setDeletingId(bankId)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('user_bank_info')
        .update({ is_hidden: true, hidden_at: new Date().toISOString() })
        .eq('id', bankId)
        .eq('user_id', user.id)

      if (error) throw error

      setBanks((prev) => prev.filter((b) => b.id !== bankId))
    } catch (e: any) {
      console.log(e)
      Alert.alert('Error', e?.message || 'Failed to remove bank')
    } finally {
      setDeletingId(null)
    }
  }

  const renderBank = ({ item }: { item: BankRow }) => {
    const initials = item.bank_name?.slice(0, 2)?.toUpperCase?.() ?? 'BK'

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.bankName} numberOfLines={1}>
              {item.bank_name}
            </Text>
            <Text style={styles.bankMeta}>
              {item.account_number} • {item.account_name}
            </Text>
          </View>

          <Pressable
            onPress={() => confirmHideBank(item)}
            disabled={deletingId === item.id}
            style={({ pressed }) => [
              styles.trashBtn,
              pressed && { opacity: 0.7 },
              deletingId === item.id && { opacity: 0.6 },
            ]}
          >
            {deletingId === item.id ? (
              <ActivityIndicator />
            ) : (
              <Ionicons name='trash-outline' size={18} color='#b91c1c' />
            )}
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.headerBtn}
          onPress={() => router.push('/(tabs)/settings')}
        >
          <Ionicons name='chevron-back' size={22} color='#0f172a' />
        </Pressable>

        <Text style={styles.headerTitle}>Linked Banks</Text>

        <Pressable style={styles.headerBtn} onPress={openAdd}>
          <Ionicons name='add' size={22} color='#0f172a' />
        </Pressable>
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size='large' color='#2563eb' />
          <Text style={styles.centerText}>Loading banks…</Text>
        </View>
      ) : (
        <FlatList
          data={banks}
          keyExtractor={(item) => item.id}
          renderItem={renderBank}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name='card-outline' size={22} color='#0f172a' />
              </View>
              <Text style={styles.emptyTitle}>No bank accounts yet</Text>
              <Text style={styles.emptySub}>
                Add a bank to withdraw faster.
              </Text>

              <TouchableOpacity style={styles.primaryBtn} onPress={openAdd}>
                <Text style={styles.primaryText}>+ Add Bank</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Add Modal (bottom sheet style) */}
      <Modal visible={showAddModal} transparent animationType='slide'>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowAddModal(false)}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />

            <Text style={styles.sheetTitle}>Add Bank</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Bank name</Text>
              <TextInput
                value={form.bank_name}
                onChangeText={(t) => setForm((p) => ({ ...p, bank_name: t }))}
                placeholder='e.g. GTBank'
                placeholderTextColor='#94a3b8'
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Account number</Text>
              <TextInput
                value={form.account_number}
                onChangeText={(t) =>
                  setForm((p) => ({ ...p, account_number: t }))
                }
                placeholder='e.g. 0123456789'
                placeholderTextColor='#94a3b8'
                keyboardType='number-pad'
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Account name</Text>
              <TextInput
                value={form.account_name}
                onChangeText={(t) =>
                  setForm((p) => ({ ...p, account_name: t }))
                }
                placeholder='e.g. Sheriff Dauda'
                placeholderTextColor='#94a3b8'
                style={styles.input}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                (!canSave || saving) && { opacity: 0.6 },
              ]}
              disabled={!canSave || saving}
              onPress={handleAddBank}
            >
              <Text style={styles.primaryText}>
                {saving ? 'Saving…' : 'Save Bank'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setShowAddModal(false)}
              disabled={saving}
            >
              <Text style={styles.secondaryText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },

  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#0f172a' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerText: { marginTop: 10, color: '#64748b', fontWeight: '700' },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    marginTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#eef2f7',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#e6f4fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#2563eb', fontWeight: '900' },

  bankName: { fontSize: 15, fontWeight: '900', color: '#0f172a' },
  bankMeta: { marginTop: 4, color: '#64748b', fontWeight: '700', fontSize: 12 },

  trashBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
  },

  empty: {
    marginTop: 40,
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  emptySub: {
    marginTop: 6,
    textAlign: 'center',
    color: '#64748b',
    fontWeight: '700',
  },

  primaryBtn: {
    marginTop: 16,
    backgroundColor: '#0f172a',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    width: '100%',
  },
  primaryText: { color: '#fff', fontWeight: '900' },

  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  secondaryText: { color: '#0f172a', fontWeight: '900' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
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

  field: { marginTop: 10 },
  label: { color: '#334155', fontWeight: '900', marginBottom: 6, fontSize: 12 },
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
})
