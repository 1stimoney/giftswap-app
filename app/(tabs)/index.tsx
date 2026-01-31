import { RefreshScrollView } from '@/component/Refreshcontext'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '../../lib/supabase'

export default function Home() {
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState<any[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  // ✅ Notifications
  const [unreadCount, setUnreadCount] = useState(0)
  const userIdRef = useRef<string | null>(null)

  const router = useRouter()
  const ITEMS_PER_PAGE = 10

  useEffect(() => {
    fetchUserAndTransactions(true)
  }, [])

  const fetchUnreadCount = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      userIdRef.current = user.id

      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)

      if (error) throw error
      setUnreadCount(count ?? 0)
    } catch (e) {
      console.warn('Unread count error:', e)
    }
  }, [])

  // ✅ Subscribe to notifications realtime
  useEffect(() => {
    let channel: any

    const setup = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      userIdRef.current = user.id

      // initial count
      await fetchUnreadCount()

      channel = supabase
        .channel(`notifications-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          async () => {
            // simplest + safest: re-fetch exact count
            await fetchUnreadCount()
          }
        )
        .subscribe()
    }

    setup()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [fetchUnreadCount])

  const fetchUserAndTransactions = async (reset = false) => {
    try {
      if (reset) {
        setPage(1)
        setHasMore(true)
      }

      setLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // Fetch user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, balance')
        .eq('id', user.id)
        .single()

      setUsername(profile?.username || 'User')
      setBalance(profile?.balance || 0)

      // Pagination
      const from = (page - 1) * ITEMS_PER_PAGE
      const to = from + ITEMS_PER_PAGE - 1

      // Fetch withdrawals
      const { data: withdrawals } = await supabase
        .from('withdrawals')
        .select('id, amount, status, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to)

      // Fetch trades
      const { data: trades } = await supabase
        .from('trades')
        .select('id, total, card_name, rate, amount_usd, status, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to)

      const normalizedTrades = (trades || []).map((t) => ({
        id: t.id,
        type: 'Trade',
        amount: t.total || 0,
        card_type: t.card_name,
        rate: t.rate,
        amount_usd: t.amount_usd,
        status: t.status,
        created_at: t.created_at,
      }))

      const normalizedWithdrawals = (withdrawals || []).map((w) => ({
        id: w.id,
        type: 'Withdrawal',
        amount: w.amount || 0,
        status: w.status,
        created_at: w.created_at,
      }))

      const merged = [...normalizedTrades, ...normalizedWithdrawals].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )

      if (reset) setTransactions(merged)
      else setTransactions((prev) => [...prev, ...merged])

      if (merged.length < ITEMS_PER_PAGE) setHasMore(false)
    } catch (error) {
      console.error('Error fetching transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchUserAndTransactions(true)
    await fetchUnreadCount()
    setRefreshing(false)
  }, [fetchUnreadCount])

  const loadMore = async () => {
    if (!hasMore || loading) return
    setPage((prev) => prev + 1)
    await fetchUserAndTransactions()
  }

  const renderTransaction = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.transactionItem}
      onPress={() => setSelectedTransaction(item)}
    >
      <View>
        <Text style={styles.transactionType}>{item.type}</Text>
        <Text style={styles.transactionDate}>
          {new Date(item.created_at).toLocaleString()}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.transactionAmount}>
          ₦{item.amount.toLocaleString()}
        </Text>
        <Text
          style={[
            styles.transactionStatus,
            item.status === 'approved' || item.status === 'success'
              ? styles.success
              : item.status === 'rejected'
              ? styles.rejected
              : styles.pending,
          ]}
        >
          {String(item.status).toLowerCase()}
        </Text>
      </View>
    </TouchableOpacity>
  )

  if (loading && !transactions.length) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size='large' color='#2563eb' />
      </View>
    )
  }

  return (
    <RefreshScrollView refreshing={refreshing} onRefresh={onRefresh}>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.welcome}>Welcome,</Text>
            <Text style={styles.username}>{username}</Text>
          </View>

          <View style={styles.headerRight}>
            {/* 🔔 Notifications */}
            <TouchableOpacity
              onPress={() => router.push('/notifications')}
              activeOpacity={0.8}
              style={styles.bellWrap}
            >
              <Ionicons
                name='notifications-outline'
                size={26}
                color='#111827'
              />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* 👤 Profile */}
            <Ionicons
              name='person-circle-outline'
              size={42}
              color='#2563eb'
              onPress={() => router.push('/profile')}
            />
          </View>
        </View>

        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balance}>₦{balance.toLocaleString()}</Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: '#E6F4FE' }]}
            onPress={() => router.push('/withdraw')}
          >
            <Ionicons name='cash-outline' size={28} color='#2563eb' />
            <Text style={styles.actionText}>Withdrawal</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: '#EBF8E1' }]}
            onPress={() => router.push('/trade')}
          >
            <Ionicons
              name='swap-horizontal-outline'
              size={28}
              color='#16a34a'
            />
            <Text style={styles.actionText}>Trade</Text>
          </TouchableOpacity>
        </View>

        {/* Transactions */}
        <View style={styles.transactions}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          {transactions.length === 0 ? (
            <Text style={styles.noTransaction}>No transactions yet</Text>
          ) : (
            <FlatList
              data={transactions}
              renderItem={renderTransaction}
              keyExtractor={(item) => item.id.toString()}
              scrollEnabled={false}
              onEndReached={loadMore}
              onEndReachedThreshold={0.2}
              ListFooterComponent={
                hasMore ? (
                  <ActivityIndicator
                    style={{ marginVertical: 10 }}
                    color='#2563eb'
                  />
                ) : null
              }
            />
          )}
        </View>

        {/* Transaction Modal */}
        <Modal
          visible={!!selectedTransaction}
          transparent
          animationType='slide'
          onRequestClose={() => setSelectedTransaction(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Transaction Details</Text>
              {selectedTransaction && (
                <>
                  <Text style={styles.modalText}>
                    <Text style={styles.bold}>Type:</Text>{' '}
                    {selectedTransaction.type}
                  </Text>
                  <Text style={styles.modalText}>
                    <Text style={styles.bold}>Amount:</Text> ₦
                    {selectedTransaction.amount.toLocaleString()}
                  </Text>
                  <Text style={styles.modalText}>
                    <Text style={styles.bold}>Status:</Text>{' '}
                    {selectedTransaction.status}
                  </Text>
                  <Text style={styles.modalText}>
                    <Text style={styles.bold}>Date:</Text>{' '}
                    {new Date(selectedTransaction.created_at).toLocaleString()}
                  </Text>

                  {selectedTransaction.type === 'Trade' && (
                    <>
                      <Text style={styles.modalText}>
                        <Text style={styles.bold}>Card Type:</Text>{' '}
                        {selectedTransaction.card_type || 'N/A'}
                      </Text>
                      <Text style={styles.modalText}>
                        <Text style={styles.bold}>Rate:</Text>{' '}
                        {selectedTransaction.rate
                          ? `₦${selectedTransaction.rate}/$`
                          : 'N/A'}
                      </Text>
                      <Text style={styles.modalText}>
                        <Text style={styles.bold}>Card Amount:</Text>{' '}
                        {selectedTransaction.amount_usd
                          ? `$${selectedTransaction.amount_usd}`
                          : 'N/A'}
                      </Text>
                    </>
                  )}
                </>
              )}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setSelectedTransaction(null)}
              >
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </RefreshScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB', padding: 20 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  welcome: { fontSize: 16, color: '#6B7280' },
  username: { fontSize: 22, fontWeight: '700', color: '#111827' },

  bellWrap: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 3,
    right: 3,
    backgroundColor: '#ef4444',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  balanceCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    marginBottom: 25,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  balanceLabel: { fontSize: 14, color: '#6B7280' },
  balance: { fontSize: 30, fontWeight: '800', color: '#111827', marginTop: 6 },

  actionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 25,
  },
  actionCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 30,
    marginHorizontal: 6,
  },
  actionText: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },

  transactions: { marginTop: 10 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
    color: '#111827',
  },
  noTransaction: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 14,
    marginTop: 10,
  },
  transactionItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  transactionType: { fontSize: 14, color: '#374151', fontWeight: '600' },
  transactionAmount: { fontSize: 15, fontWeight: '700', color: '#111827' },
  transactionStatus: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  transactionDate: { fontSize: 12, color: '#9CA3AF' },
  success: { color: '#16a34a' },
  pending: { color: '#d97706' },
  rejected: { color: '#dc2626' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    width: '85%',
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 15,
    color: '#111827',
  },
  modalText: { fontSize: 16, color: '#374151', marginBottom: 8 },
  bold: { fontWeight: '700' },
  closeButton: {
    backgroundColor: '#2563eb',
    marginTop: 15,
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 10,
  },
  closeText: { color: '#fff', fontWeight: '600', fontSize: 16 },
})
