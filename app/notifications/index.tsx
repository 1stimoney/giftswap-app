import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet'
import { useRouter } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

type NotificationRow = {
  id: string
  user_id: string
  type: string | null
  title: string | null
  message: string | null
  data: any
  is_read: boolean
  created_at: string
}

type TradeRow = {
  id: string
  user_id: string
  card_name: string
  rate: number
  amount_usd: number
  total: number
  status: string
  created_at: string
  image_url?: string | null
  image_urls?: any
  proof_images?: any
  reject_reason?: string | null
}

type WithdrawalRow = {
  id: string
  user_id: string
  amount: number
  status: string
  created_at: string
  proof_images?: any
  reject_reason?: string | null
}

function parseArray(v: any): string[] {
  try {
    if (!v) return []
    if (Array.isArray(v)) return v.filter((x) => typeof x === 'string')
    if (typeof v === 'string') {
      const parsed = JSON.parse(v)
      if (Array.isArray(parsed))
        return parsed.filter((x) => typeof x === 'string')
      if (v.startsWith('http')) return [v]
    }
  } catch {}
  return []
}

function getTypeIcon(type?: string | null) {
  if (type === 'withdrawal') return 'cash-outline'
  if (type === 'trade') return 'swap-horizontal-outline'
  return 'notifications-outline'
}

function statusColor(status?: string) {
  if (status === 'approved') return '#16a34a'
  if (status === 'pending') return '#d97706'
  if (status === 'rejected') return '#dc2626'
  return '#111827'
}

export default function NotificationsScreen() {
  const router = useRouter()

  const [items, setItems] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Bottom sheet state
  const sheetRef = useRef<BottomSheet>(null)
  const snapPoints = useMemo(() => ['12%', '88%'], []) // near fullscreen but not full
  const [activeNotif, setActiveNotif] = useState<NotificationRow | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [trade, setTrade] = useState<TradeRow | null>(null)
  const [withdrawal, setWithdrawal] = useState<WithdrawalRow | null>(null)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  const unreadCount = useMemo(
    () => items.filter((n) => !n.is_read).length,
    [items]
  )

  const fetchNotifications = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setItems((data as NotificationRow[]) || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()

    // realtime (for this user only)
    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        async (payload) => {
          const {
            data: { user },
          } = await supabase.auth.getUser()
          if (!user) return

          const rowUserId =
            (payload.new as any)?.user_id ?? (payload.old as any)?.user_id
          if (rowUserId !== user.id) return

          fetchNotifications()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchNotifications])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchNotifications()
  }, [fetchNotifications])

  const markAsRead = async (id: string) => {
    // optimistic
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    )

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
    if (error) {
      console.error(error)
      // rollback
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: false } : n))
      )
    }
  }

  const openDetails = async (n: NotificationRow) => {
    setActiveNotif(n)
    setTrade(null)
    setWithdrawal(null)
    setSelectedImage(null)

    await markAsRead(n.id)

    // open sheet
    sheetRef.current?.snapToIndex(1)

    // fetch detail
    setDetailLoading(true)
    try {
      const entity = n.data?.entity
      const entityId = n.data?.id

      if (entity === 'trade' && entityId) {
        const { data, error } = await supabase
          .from('trades')
          .select(
            'id,user_id,card_name,rate,amount_usd,total,status,created_at,image_urls,proof_images,reject_reason'
          )
          .eq('id', entityId)
          .single()
        if (error) throw error
        setTrade(data as TradeRow)
      }

      if (entity === 'withdrawal' && entityId) {
        const { data, error } = await supabase
          .from('withdrawals')
          .select(
            'id,user_id,amount,status,created_at,proof_images,reject_reason'
          )
          .eq('id', entityId)
          .single()
        if (error) throw error
        setWithdrawal(data as WithdrawalRow)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setDetailLoading(false)
    }
  }

  const closeSheet = () => {
    sheetRef.current?.close()
  }

  const backdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        pressBehavior='close' // tap outside closes
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  )

  const renderItem = ({ item }: { item: NotificationRow }) => (
    <TouchableOpacity
      onPress={() => openDetails(item)}
      activeOpacity={0.9}
      style={[
        styles.card,
        !item.is_read && { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
      ]}
    >
      <View style={styles.cardTop}>
        <View style={styles.iconBubble}>
          <Ionicons
            name={getTypeIcon(item.type) as any}
            size={18}
            color='#2563eb'
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title || 'Notification'}
          </Text>
          <Text style={styles.cardMsg} numberOfLines={2}>
            {item.message || ''}
          </Text>

          <Text style={styles.cardTime}>
            {new Date(item.created_at).toLocaleString()}
          </Text>
        </View>

        {!item.is_read && <View style={styles.dot} />}
      </View>
    </TouchableOpacity>
  )

  const tradeUserImages = useMemo(() => {
    if (!trade) return []
    const list = parseArray(trade.image_urls)
    const single = trade.image_url ? [trade.image_url] : []
    return [...list, ...single].filter(Boolean) as string[]
  }, [trade])

  const tradeProofImages = useMemo(
    () => parseArray(trade?.proof_images),
    [trade]
  )
  const withdrawalProofImages = useMemo(
    () => parseArray(withdrawal?.proof_images),
    [withdrawal]
  )

  const showRejected =
    trade?.status === 'rejected' || withdrawal?.status === 'rejected'
  const rejectReason = trade?.reject_reason || withdrawal?.reject_reason || null

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size='large' color='#2563eb' />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Top header with back */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.85}
        >
          <Ionicons name='chevron-back' size={22} color='#111827' />
        </TouchableOpacity>

        <Text style={styles.screenTitle}>Notifications</Text>

        <View style={styles.unreadPill}>
          <Text style={styles.unreadText}>{unreadCount} unread</Text>
        </View>
      </View>

      {items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons
            name='notifications-off-outline'
            size={34}
            color='#9ca3af'
          />
          <Text style={{ color: '#6b7280', marginTop: 10 }}>
            No notifications yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#2563eb']}
            />
          }
        />
      )}

      {/* Bottom sheet details modal */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose // swipe down to close
        backdropComponent={backdrop}
        handleIndicatorStyle={{ backgroundColor: '#d1d5db' }}
        backgroundStyle={{ backgroundColor: '#ffffff', borderRadius: 22 }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
        >
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.sheetIconBubble}>
              <Ionicons
                name={getTypeIcon(activeNotif?.type) as any}
                size={18}
                color='#2563eb'
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>
                {activeNotif?.title || 'Notification'}
              </Text>
              <Text style={styles.sheetSub}>
                {activeNotif?.created_at
                  ? new Date(activeNotif.created_at).toLocaleString()
                  : ''}
              </Text>
            </View>

            <TouchableOpacity
              onPress={closeSheet}
              style={styles.closeBtn}
              activeOpacity={0.85}
            >
              <Ionicons name='close' size={18} color='#111827' />
            </TouchableOpacity>
          </View>

          {/* Message */}
          {activeNotif?.message ? (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Message</Text>
              <Text style={styles.blockText}>{activeNotif.message}</Text>
            </View>
          ) : null}

          {detailLoading ? (
            <View style={[styles.block, { alignItems: 'center' }]}>
              <ActivityIndicator color='#2563eb' />
              <Text style={{ color: '#6b7280', marginTop: 10 }}>
                Loading details...
              </Text>
            </View>
          ) : null}

          {/* Trade */}
          {trade && !detailLoading && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Trade Details</Text>

              <Row k='Card' v={trade.card_name} />
              <Row k='Amount' v={`$${trade.amount_usd}`} />
              <Row k='Rate' v={`₦${trade.rate}/$`} />
              <Row k='Total' v={`₦${Number(trade.total).toLocaleString()}`} />
              <Row
                k='Status'
                v={trade.status}
                valueStyle={{
                  color: statusColor(trade.status),
                  textTransform: 'capitalize',
                }}
              />

              {tradeUserImages.length > 0 && (
                <>
                  <Text style={[styles.blockTitle, { marginTop: 14 }]}>
                    Submitted Photos
                  </Text>
                  <ScrollImages
                    urls={tradeUserImages}
                    onPress={(u) => setSelectedImage(u)}
                  />
                </>
              )}

              {tradeProofImages.length > 0 && (
                <>
                  <Text style={[styles.blockTitle, { marginTop: 14 }]}>
                    Admin Proof Photos
                  </Text>
                  <ScrollImages
                    urls={tradeProofImages}
                    onPress={(u) => setSelectedImage(u)}
                  />
                </>
              )}
            </View>
          )}

          {/* Withdrawal */}
          {withdrawal && !detailLoading && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Withdrawal Details</Text>

              <Row
                k='Amount'
                v={`₦${Number(withdrawal.amount).toLocaleString()}`}
              />
              <Row
                k='Status'
                v={withdrawal.status}
                valueStyle={{
                  color: statusColor(withdrawal.status),
                  textTransform: 'capitalize',
                }}
              />

              {withdrawalProofImages.length > 0 && (
                <>
                  <Text style={[styles.blockTitle, { marginTop: 14 }]}>
                    Admin Proof Photos
                  </Text>
                  <ScrollImages
                    urls={withdrawalProofImages}
                    onPress={(u) => setSelectedImage(u)}
                  />
                </>
              )}
            </View>
          )}

          {/* Rejection reason */}
          {showRejected && !detailLoading && (
            <View
              style={[
                styles.block,
                { borderColor: '#fecaca', backgroundColor: '#fff1f2' },
              ]}
            >
              <Text style={[styles.blockTitle, { color: '#991b1b' }]}>
                Rejection Reason
              </Text>
              <Text style={[styles.blockText, { color: '#7f1d1d' }]}>
                {rejectReason || 'No reason provided.'}
              </Text>
            </View>
          )}
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Image Preview (simple overlay) */}
      <ModalImage url={selectedImage} onClose={() => setSelectedImage(null)} />
    </View>
  )
}

function Row({ k, v, valueStyle }: { k: string; v: string; valueStyle?: any }) {
  return (
    <View style={styles.row}>
      <Text style={styles.k}>{k}</Text>
      <Text style={[styles.v, valueStyle]}>{v}</Text>
    </View>
  )
}

function ScrollImages({
  urls,
  onPress,
}: {
  urls: string[]
  onPress: (u: string) => void
}) {
  return (
    <View style={styles.imagesWrap}>
      <ScrollRow urls={urls} onPress={onPress} />
    </View>
  )
}

function ScrollRow({
  urls,
  onPress,
}: {
  urls: string[]
  onPress: (u: string) => void
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingTop: 6 }}>
      {urls.map((u, i) => (
        <TouchableOpacity
          key={i}
          activeOpacity={0.9}
          onPress={() => onPress(u)}
        >
          <Image source={{ uri: u }} style={styles.img} />
        </TouchableOpacity>
      ))}
    </View>
  )
}

function ModalImage({
  url,
  onClose,
}: {
  url: string | null
  onClose: () => void
}) {
  if (!url) return null

  return (
    <View style={styles.previewOverlay}>
      <Pressable style={styles.previewBackdrop} onPress={onClose} />
      <View style={styles.previewCard}>
        <Image source={{ uri: url }} style={styles.previewImg} />
        <TouchableOpacity
          onPress={onClose}
          style={styles.previewClose}
          activeOpacity={0.85}
        >
          <Ionicons name='close' size={18} color='#fff' />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  topBar: {
    paddingTop: 16,
    paddingBottom: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  screenTitle: { flex: 1, fontSize: 18, fontWeight: '900', color: '#111827' },
  unreadPill: {
    backgroundColor: '#111827',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  unreadText: { color: '#fff', fontWeight: '800', fontSize: 12 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBubble: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '900', color: '#111827' },
  cardMsg: { fontSize: 13, color: '#374151', marginTop: 2 },
  cardTime: { fontSize: 12, color: '#9ca3af', marginTop: 10 },
  dot: { width: 10, height: 10, borderRadius: 999, backgroundColor: '#2563eb' },

  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sheetIconBubble: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetTitle: { fontSize: 16, fontWeight: '900', color: '#111827' },
  sheetSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },

  block: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
  },
  blockTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 10,
  },
  blockText: { fontSize: 14, color: '#374151', lineHeight: 20 },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 16,
  },
  k: { fontSize: 13, color: '#6b7280', fontWeight: '800' },
  v: { fontSize: 13, color: '#111827', fontWeight: '900' },

  imagesWrap: { overflow: 'hidden' },
  img: { width: 92, height: 92, borderRadius: 16, backgroundColor: '#e5e7eb' },

  // image preview overlay
  previewOverlay: {
    position: 'absolute',
    inset: 0 as any,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  previewBackdrop: {
    position: 'absolute',
    inset: 0 as any,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  previewCard: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  previewImg: { width: '100%', height: 420, resizeMode: 'contain' },
  previewClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
})
