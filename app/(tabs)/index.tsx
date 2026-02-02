import { RefreshScrollView } from '@/component/Refreshcontext'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

const BALANCE_VIS_KEY = 'giftswap.balance.visible'

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

  // ✅ Balance hide/show
  const [balanceVisible, setBalanceVisible] = useState(true)

  const router = useRouter()
  const ITEMS_PER_PAGE = 10

  // Load saved preference
  useEffect(() => {
    ;(async () => {
      try {
        const saved = await AsyncStorage.getItem(BALANCE_VIS_KEY)
        if (saved === '0') setBalanceVisible(false)
      } catch {}
    })()
  }, [])

  const toggleBalance = async () => {
    const next = !balanceVisible
    setBalanceVisible(next)
    try {
      await AsyncStorage.setItem(BALANCE_VIS_KEY, next ? '1' : '0')
    } catch {}
  }

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

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, balance')
        .eq('id', user.id)
        .single()

      setUsername(profile?.username || 'User')
      setBalance(profile?.balance || 0)

      const from = (page - 1) * ITEMS_PER_PAGE
      const to = from + ITEMS_PER_PAGE - 1

      const { data: withdrawals } = await supabase
        .from('withdrawals')
        .select('id, amount, status, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to)

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

  const statusMeta = (status: string) => {
    const s = String(status).toLowerCase()
    if (s === 'approved' || s === 'success') {
      return { label: 'approved', bg: '#DCFCE7', fg: '#16A34A' }
    }
    if (s === 'rejected' || s === 'failed') {
      return { label: 'rejected', bg: '#FEE2E2', fg: '#DC2626' }
    }
    return { label: 'pending', bg: '#FEF9C3', fg: '#CA8A04' }
  }

  const prettyDate = useMemo(() => {
    return (d: string) => new Date(d).toLocaleString()
  }, [])

  const renderTransaction = ({ item }: { item: any }) => {
    const meta = statusMeta(item.status)
    const isTrade = item.type === 'Trade'
    return (
      <TouchableOpacity
        style={styles.txCard}
        onPress={() => setSelectedTransaction(item)}
        activeOpacity={0.85}
      >
        <View style={styles.txLeft}>
          <View
            style={[
              styles.txIcon,
              { backgroundColor: isTrade ? '#EEF2FF' : '#ECFEFF' },
            ]}
          >
            <Ionicons
              name={isTrade ? 'swap-horizontal-outline' : 'cash-outline'}
              size={18}
              color={isTrade ? '#4F46E5' : '#0891B2'}
            />
          </View>

          <View style={{ flex: 1 }}>
            <View style={styles.txTopRow}>
              <Text style={styles.txTitle}>{item.type}</Text>
              <View style={[styles.pill, { backgroundColor: meta.bg }]}>
                <Text style={[styles.pillText, { color: meta.fg }]}>
                  {meta.label}
                </Text>
              </View>
            </View>

            <Text style={styles.txSub}>
              {isTrade
                ? `${item.card_type || 'Gift card'} • $${item.amount_usd || 0}`
                : 'Withdrawal request'}
            </Text>
            <Text style={styles.txDate}>{prettyDate(item.created_at)}</Text>
          </View>
        </View>

        <View style={styles.txRight}>
          <Text style={styles.txAmount}>
            ₦{Number(item.amount || 0).toLocaleString()}
          </Text>
          <Ionicons name='chevron-forward' size={18} color='#94A3B8' />
        </View>
      </TouchableOpacity>
    )
  }

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
            <Text style={styles.welcome}>Welcome back</Text>
            <Text style={styles.username}>{username}</Text>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={() => router.push('/notifications')}
              activeOpacity={0.8}
              style={styles.iconBtn}
            >
              <Ionicons
                name='notifications-outline'
                size={22}
                color='#0f172a'
              />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/profile')}
              activeOpacity={0.8}
              style={styles.iconBtn}
            >
              <Ionicons name='person-outline' size={22} color='#0f172a' />
            </TouchableOpacity>
          </View>
        </View>

        {/* Balance Card */}
        <LinearGradient
          colors={['#0B1220', '#0F1B35', '#102A64']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <View style={styles.balanceTop}>
            <Text style={styles.balanceLabel}>Available Balance</Text>

            <TouchableOpacity onPress={toggleBalance} style={styles.eyeBtn}>
              <Ionicons
                name={balanceVisible ? 'eye-outline' : 'eye-off-outline'}
                size={18}
                color='#E2E8F0'
              />
              <Text style={styles.eyeText}>
                {balanceVisible ? 'Hide' : 'Show'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.balanceValue}>
            {balanceVisible ? `₦${balance.toLocaleString()}` : '₦••••••'}
          </Text>

          <View style={styles.balanceFooter}>
            <View style={styles.miniStat}>
              <Text style={styles.miniStatLabel}>Trades</Text>
              <Text style={styles.miniStatValue}>
                {transactions.filter((t) => t.type === 'Trade').length}
              </Text>
            </View>
            <View style={styles.miniDivider} />
            <View style={styles.miniStat}>
              <Text style={styles.miniStatLabel}>Withdrawals</Text>
              <Text style={styles.miniStatValue}>
                {transactions.filter((t) => t.type === 'Withdrawal').length}
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* Quick Actions */}
        <View style={styles.quickRow}>
          <QuickAction
            title='Trade'
            subtitle='Sell gift cards'
            icon='swap-horizontal-outline'
            colorBg='#EEF2FF'
            colorIcon='#4F46E5'
            onPress={() => router.push('/trade')}
          />
          <QuickAction
            title='Withdraw'
            subtitle='Cash out balance'
            icon='cash-outline'
            colorBg='#ECFDF5'
            colorIcon='#16A34A'
            onPress={() => router.push('/withdraw')}
          />
          <QuickAction
            title='Banks'
            subtitle='Manage accounts'
            icon='card-outline'
            colorBg='#EFF6FF'
            colorIcon='#2563EB'
            onPress={() => router.push('/linked-accounts')}
          />
        </View>

        {/* Transactions */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <TouchableOpacity onPress={onRefresh} activeOpacity={0.7}>
            <Text style={styles.sectionLink}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {transactions.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name='time-outline' size={22} color='#94A3B8' />
            <Text style={styles.emptyTitle}>No activity yet</Text>
            <Text style={styles.emptySub}>
              Your trades and withdrawals will appear here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={transactions}
            renderItem={renderTransaction}
            keyExtractor={(item) => String(item.id)}
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

        {/* Transaction Modal */}
        <Modal
          visible={!!selectedTransaction}
          transparent
          animationType='slide'
          onRequestClose={() => setSelectedTransaction(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setSelectedTransaction(null)}
            style={styles.modalOverlay}
          >
            <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Transaction details</Text>

              {selectedTransaction && (
                <View style={{ marginTop: 10, gap: 10 }}>
                  <Row label='Type' value={selectedTransaction.type} />
                  <Row
                    label='Amount'
                    value={`₦${Number(
                      selectedTransaction.amount || 0
                    ).toLocaleString()}`}
                  />
                  <Row
                    label='Status'
                    value={String(selectedTransaction.status).toLowerCase()}
                  />
                  <Row
                    label='Date'
                    value={new Date(
                      selectedTransaction.created_at
                    ).toLocaleString()}
                  />

                  {selectedTransaction.type === 'Trade' && (
                    <>
                      <Row
                        label='Card'
                        value={selectedTransaction.card_type || 'N/A'}
                      />
                      <Row
                        label='Rate'
                        value={
                          selectedTransaction.rate
                            ? `₦${selectedTransaction.rate}/$`
                            : 'N/A'
                        }
                      />
                      <Row
                        label='Card amount'
                        value={
                          selectedTransaction.amount_usd
                            ? `$${selectedTransaction.amount_usd}`
                            : 'N/A'
                        }
                      />
                    </>
                  )}
                </View>
              )}

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setSelectedTransaction(null)}
              >
                <Text style={styles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        <View style={{ height: 24 }} />
      </ScrollView>
    </RefreshScrollView>
  )
}

function QuickAction({
  title,
  subtitle,
  icon,
  colorBg,
  colorIcon,
  onPress,
}: {
  title: string
  subtitle: string
  icon: any
  colorBg: string
  colorIcon: string
  onPress: () => void
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.qa}>
      <View style={[styles.qaIcon, { backgroundColor: colorBg }]}>
        <Ionicons name={icon} size={20} color={colorIcon} />
      </View>
      <Text style={styles.qaTitle}>{title}</Text>
      <Text style={styles.qaSub}>{subtitle}</Text>
    </TouchableOpacity>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', padding: 20 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  welcome: { fontSize: 13, color: '#64748B', fontWeight: '700' },
  username: { fontSize: 22, fontWeight: '900', color: '#0F172A' },

  iconBtn: {
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
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#ef4444',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },

  balanceCard: {
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
  balanceTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: { fontSize: 13, color: '#CBD5E1', fontWeight: '800' },
  eyeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  eyeText: { color: '#E2E8F0', fontWeight: '800', fontSize: 12 },
  balanceValue: {
    marginTop: 10,
    fontSize: 30,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  balanceFooter: {
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  miniStat: { alignItems: 'center', flex: 1 },
  miniStatLabel: { color: '#CBD5E1', fontSize: 11, fontWeight: '800' },
  miniStatValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 4,
  },
  miniDivider: {
    width: 1,
    height: 26,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },

  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  qa: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  qaIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  qaTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  qaSub: { fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: '700' },

  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  sectionLink: { fontSize: 12, fontWeight: '900', color: '#2563EB' },

  emptyBox: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  emptySub: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
    textAlign: 'center',
  },

  txCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#EEF2F7',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  txLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  txTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  txSub: { fontSize: 12, color: '#64748B', fontWeight: '700', marginTop: 2 },
  txDate: { fontSize: 11, color: '#94A3B8', marginTop: 6, fontWeight: '700' },
  txRight: {
    alignItems: 'flex-end',
    gap: 6,
    marginLeft: 12,
    flexDirection: 'row',
  },
  txAmount: { fontSize: 14, fontWeight: '900', color: '#0F172A' },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginLeft: 10,
  },
  pillText: { fontSize: 11, fontWeight: '900', textTransform: 'capitalize' },

  // Modal sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
  },
  modalHandle: {
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A' },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  rowLabel: { color: '#64748B', fontWeight: '800' },
  rowValue: {
    color: '#0F172A',
    fontWeight: '900',
    maxWidth: '62%',
    textAlign: 'right',
  },

  closeBtn: {
    marginTop: 14,
    backgroundColor: '#0F172A',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  closeBtnText: { color: '#fff', fontWeight: '900' },
})
