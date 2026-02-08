import { supabase } from '@/lib/supabase'
import { FLOATING_TAB_HEIGHT } from '@/lib/ui'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

type Thread = {
  id: string
  user_id: string
  subject: string
  status: 'open' | 'closed'
  last_message?: string | null
  last_message_at?: string | null
  last_sender?: 'user' | 'admin' | null
  created_at: string
  updated_at: string
}

type ThreadRead = {
  thread_id: string
  user_id: string
  last_read_at: string
}

type FAQ = {
  id: string
  q: string
  a: string
  tags?: string[]
}

export default function SupportHub() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const bottomSpace = FLOATING_TAB_HEIGHT + insets.bottom + 12

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  const [threads, setThreads] = useState<Thread[]>([])
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({})

  // create ticket modal
  const [newOpen, setNewOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [creating, setCreating] = useState(false)

  // faq state
  const [faqQuery, setFaqQuery] = useState('')
  const [expandedFaq, setExpandedFaq] = useState<Record<string, boolean>>({})

  const title = useMemo(() => 'Support', [])

  const faqs: FAQ[] = useMemo(
    () => [
      {
        id: 'faq1',
        q: 'How long does it take to approve a trade?',
        a: 'Most trades are reviewed within minutes to a few hours depending on volume. If your trade is pending for long, send a message with clear images or code details.',
        tags: ['trade', 'pending', 'time'],
      },
      {
        id: 'faq2',
        q: 'Why was my trade rejected?',
        a: 'Common reasons: blurry images, card already used/invalid, wrong card selected, code mismatch, or suspected fraud/chargeback risk. Check the rejection reason in your trade history (if provided).',
        tags: ['trade', 'rejected'],
      },
      {
        id: 'faq3',
        q: 'What is the difference between physical and e-code?',
        a: 'Physical cards require clear images (front/back) and optional code. E-codes require the code (compulsory). Rates may differ between physical and e-code.',
        tags: ['physical', 'ecode', 'rate'],
      },
      {
        id: 'faq4',
        q: 'How do rates work?',
        a: 'Rates are set per card and can change with market demand. Your total payout is: USD amount × rate. E-code and physical cards may have different rates.',
        tags: ['rate', 'pricing'],
      },
      {
        id: 'faq5',
        q: 'My image upload failed, what should I do?',
        a: 'Use clear images, good lighting, and try selecting fewer images. Also ensure your app has gallery permission. If it still fails, restart the app and try again.',
        tags: ['upload', 'images'],
      },
      {
        id: 'faq6',
        q: 'My withdrawal is pending — when will I get paid?',
        a: 'Withdrawals are processed in batches. If it stays pending beyond the normal time for your platform, contact support with the withdrawal amount and time.',
        tags: ['withdrawal', 'pending'],
      },
      {
        id: 'faq7',
        q: 'I added the wrong bank account, what can I do?',
        a: 'Go to Settings → Linked Bank Accounts to update your bank details. If a withdrawal is already pending, message support immediately.',
        tags: ['bank', 'account'],
      },
      {
        id: 'faq8',
        q: 'Do you have a withdrawal PIN or biometrics?',
        a: 'Yes. You can enable withdrawal confirmation using PIN or biometrics in Settings → Security/Biometrics. This helps protect your funds.',
        tags: ['pin', 'biometrics', 'security'],
      },
      {
        id: 'faq9',
        q: 'Is my data safe?',
        a: 'Your account uses secure authentication and your biometrics never leave your device. Always keep your password and PIN private.',
        tags: ['security', 'privacy'],
      },
      {
        id: 'faq10',
        q: 'Can I reopen a closed ticket?',
        a: 'Closed tickets can’t be replied to. Create a new ticket and reference the old ticket subject if needed.',
        tags: ['ticket', 'closed'],
      },
      {
        id: 'faq11',
        q: 'What is the minimum/maximum trade amount?',
        a: 'This depends on the card type and current policy. If your trade amount is rejected or not accepted, message support and we’ll guide you.',
        tags: ['minimum', 'maximum', 'trade'],
      },
      {
        id: 'faq12',
        q: 'My trade total looks wrong',
        a: 'Confirm you selected the correct card type (physical/e-code), correct card category, and entered the correct USD amount. Rates can differ per type.',
        tags: ['total', 'rate'],
      },
      {
        id: 'faq13',
        q: 'I submitted the wrong card category',
        a: 'Message support immediately with the correct category and details. If review has not finished, we may help adjust it.',
        tags: ['wrong', 'category'],
      },
      {
        id: 'faq14',
        q: 'My account got suspended, why?',
        a: 'Accounts may be suspended for unusual activity, repeated invalid submissions, or policy violations. Contact support for review.',
        tags: ['suspended', 'account'],
      },
      {
        id: 'faq15',
        q: 'How do I chat with an agent?',
        a: 'Tap “Chat with an agent”, create a ticket subject, and send your message. An agent will respond inside the ticket thread.',
        tags: ['agent', 'support'],
      },
    ],
    []
  )

  const filteredFaqs = useMemo(() => {
    const q = faqQuery.trim().toLowerCase()
    if (!q) return faqs
    return faqs.filter((f) => {
      const hay = [f.q, f.a, (f.tags || []).join(' ')].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [faqs, faqQuery])

  const fetchThreadsAndBadges = useCallback(async () => {
    if (!userId) return

    const { data: t, error: tErr } = await supabase
      .from('support_threads')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(60)

    if (tErr) throw tErr
    const list = (t as Thread[]) || []
    setThreads(list)

    if (list.length === 0) {
      setUnreadMap({})
      return
    }

    const threadIds = list.map((x) => x.id)

    const { data: reads, error: rErr } = await supabase
      .from('support_thread_reads')
      .select('thread_id, user_id, last_read_at')
      .eq('user_id', userId)
      .in('thread_id', threadIds)

    if (rErr) throw rErr

    const readList = (reads as ThreadRead[]) || []
    const readMap: Record<string, string> = {}
    for (const r of readList) readMap[r.thread_id] = r.last_read_at

    const counts: Record<string, number> = {}

    await Promise.all(
      list.map(async (thread) => {
        if (thread.last_sender !== 'admin') {
          counts[thread.id] = 0
          return
        }

        const lastReadAt = readMap[thread.id]

        let q = supabase
          .from('support_messages')
          .select('id', { count: 'exact', head: true })
          .eq('thread_id', thread.id)
          .eq('sender', 'admin')

        if (lastReadAt) q = q.gt('created_at', lastReadAt)

        const { count, error } = await q
        if (error) counts[thread.id] = 0
        else counts[thread.id] = count ?? 0
      })
    )

    setUnreadMap(counts)
  }, [userId])

  useEffect(() => {
    let channel: any

    const init = async () => {
      try {
        setLoading(true)
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          setUserId(null)
          setThreads([])
          setUnreadMap({})
          return
        }

        setUserId(user.id)
        await fetchThreadsAndBadges()

        channel = supabase
          .channel(`support-hub-${user.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'support_threads',
              filter: `user_id=eq.${user.id}`,
            },
            async () => {
              await fetchThreadsAndBadges()
            }
          )
          .subscribe()
      } catch (e: any) {
        console.log(e)
      } finally {
        setLoading(false)
      }
    }

    init()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [fetchThreadsAndBadges])

  const createTicket = async () => {
    const s = subject.trim()
    if (!s) return Alert.alert('Missing subject', 'Add a short title.')
    if (!userId) return

    try {
      setCreating(true)

      const { data, error } = await supabase
        .from('support_threads')
        .insert({
          user_id: userId,
          subject: s,
          status: 'open',
        })
        .select('*')
        .single()

      if (error) throw error

      setNewOpen(false)
      setSubject('')

      router.push(`/chat/${data.id}`)
    } catch (e: any) {
      console.log(e)
      Alert.alert('Error', e?.message || 'Failed to create ticket')
    } finally {
      setCreating(false)
    }
  }

  const openThread = (t: Thread) => router.push(`/chat/${t.id}`)

  const openChatWithAgent = () => {
    setSubject('')
    setNewOpen(true)
  }

  const ongoing = useMemo(
    () => threads.filter((t) => t.status === 'open'),
    [threads]
  )
  const closed = useMemo(
    () => threads.filter((t) => t.status === 'closed'),
    [threads]
  )

  const ThreadCard = ({ item }: { item: Thread }) => {
    const time = item.last_message_at || item.updated_at
    const preview = item.last_message?.trim() || 'Tap to open conversation'
    const unreadCount = unreadMap[item.id] || 0

    return (
      <Pressable style={styles.threadCard} onPress={() => openThread(item)}>
        <View style={styles.threadRow}>
          <View style={styles.threadIcon}>
            <Ionicons name='headset-outline' size={18} color='#0f172a' />
          </View>

          <View style={{ flex: 1 }}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Text style={styles.threadTitle} numberOfLines={1}>
                {item.subject}
              </Text>

              {unreadCount > 0 ? (
                <View style={styles.unreadPill}>
                  <Text style={styles.unreadText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.threadPreview} numberOfLines={1}>
              {preview}
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Text style={styles.threadTime}>
              {time ? new Date(time).toLocaleDateString() : ''}
            </Text>

            <View
              style={[
                styles.statusPill,
                item.status === 'open'
                  ? styles.statusOpen
                  : styles.statusClosed,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  item.status === 'open'
                    ? styles.statusTextOpen
                    : styles.statusTextClosed,
                ]}
              >
                {item.status === 'open' ? 'Ongoing' : 'Closed'}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    )
  }

  const FAQItem = ({ item }: { item: FAQ }) => {
    const open = !!expandedFaq[item.id]
    return (
      <Pressable
        style={styles.faqItem}
        onPress={() =>
          setExpandedFaq((p) => ({ ...p, [item.id]: !p[item.id] }))
        }
      >
        <View style={styles.faqTop}>
          <Text style={styles.faqQ}>{item.q}</Text>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={18}
            color='#64748b'
          />
        </View>

        {open ? <Text style={styles.faqA}>{item.a}</Text> : null}
      </Pressable>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style='dark' backgroundColor='#fff' />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{title}</Text>
            <Text style={styles.headerSub}>
              FAQs + live chat with a support agent
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable style={styles.iconBtn} onPress={fetchThreadsAndBadges}>
              <Ionicons name='refresh' size={18} color='#0f172a' />
            </Pressable>

            <Pressable style={styles.primaryBtn} onPress={openChatWithAgent}>
              <Ionicons
                name='chatbubble-ellipses-outline'
                size={16}
                color='#fff'
              />
              <Text style={styles.primaryBtnText}>Chat</Text>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size='large' color='#2563eb' />
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: bottomSpace }}
          >
            {/* FAQ */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                Frequently asked questions
              </Text>
              <Text style={styles.sectionSub}>
                Search and tap a question to expand.
              </Text>

              <View style={styles.searchWrap}>
                <Ionicons name='search' size={16} color='#94a3b8' />
                <TextInput
                  value={faqQuery}
                  onChangeText={setFaqQuery}
                  placeholder='Search FAQs (trade, withdrawal, rate...)'
                  placeholderTextColor='#94a3b8'
                  style={styles.searchInput}
                />
              </View>

              {filteredFaqs.length === 0 ? (
                <Text style={styles.emptyText}>No FAQ matches found.</Text>
              ) : (
                <View style={{ marginTop: 10 }}>
                  {filteredFaqs.map((f) => (
                    <FAQItem key={f.id} item={f} />
                  ))}
                </View>
              )}
            </View>

            {/* Ongoing */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Ongoing conversations</Text>
                <Text style={styles.countText}>{ongoing.length}</Text>
              </View>

              {ongoing.length === 0 ? (
                <Text style={styles.emptyText}>
                  No ongoing conversations. Tap “Chat” to start one.
                </Text>
              ) : (
                <View style={{ marginTop: 10 }}>
                  {ongoing.map((t) => (
                    <ThreadCard key={t.id} item={t} />
                  ))}
                </View>
              )}
            </View>

            {/* Closed */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Closed conversations</Text>
                <Text style={styles.countText}>{closed.length}</Text>
              </View>

              {closed.length === 0 ? (
                <Text style={styles.emptyText}>No closed tickets yet.</Text>
              ) : (
                <View style={{ marginTop: 10 }}>
                  {closed.map((t) => (
                    <ThreadCard key={t.id} item={t} />
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Create ticket modal */}
      <Modal visible={newOpen} transparent animationType='fade'>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Chat with an agent</Text>
            <Text style={styles.modalSub}>
              Add a short title so the agent understands quickly.
            </Text>

            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder='e.g. Withdrawal pending / Trade rejected'
              placeholderTextColor='#94a3b8'
              style={styles.modalInput}
            />

            <View style={styles.modalRow}>
              <Pressable
                style={[styles.modalBtn, styles.modalGhost]}
                onPress={() => setNewOpen(false)}
                disabled={creating}
              >
                <Text style={styles.modalGhostText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.modalBtn,
                  styles.modalPrimary,
                  creating && { opacity: 0.7 },
                ]}
                onPress={createTicket}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color='#fff' />
                ) : (
                  <Text style={styles.modalPrimaryText}>Start</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },

  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
  headerSub: { marginTop: 4, fontSize: 12, color: '#64748b' },

  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#eef2f7',
  },
  primaryBtn: {
    height: 44,
    borderRadius: 16,
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#eef2f7',
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 14.5, fontWeight: '600', color: '#0f172a' },
  sectionSub: { marginTop: 4, fontSize: 12, color: '#64748b' },

  countText: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  emptyText: { marginTop: 10, fontSize: 12, color: '#64748b' },

  searchWrap: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 44,
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 13.5, color: '#0f172a' },

  faqItem: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
  },
  faqTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  faqQ: { flex: 1, fontSize: 13.5, fontWeight: '500', color: '#0f172a' },
  faqA: { marginTop: 8, fontSize: 12.5, color: '#64748b', lineHeight: 18 },

  threadCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eef2f7',
  },
  threadRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  threadIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  threadTitle: {
    fontSize: 13.8,
    fontWeight: '600',
    color: '#0f172a',
    maxWidth: 190,
  },
  threadPreview: { marginTop: 3, fontSize: 12, color: '#64748b' },
  threadTime: { fontSize: 11, color: '#94a3b8' },

  unreadPill: {
    backgroundColor: '#2563eb',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusOpen: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  statusClosed: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  statusText: { fontSize: 11, fontWeight: '600' },
  statusTextOpen: { color: '#16a34a' },
  statusTextClosed: { color: '#64748b' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  modalSub: { marginTop: 6, fontSize: 12, color: '#64748b' },
  modalInput: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  modalBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 100,
    alignItems: 'center',
  },
  modalGhost: { backgroundColor: '#f1f5f9' },
  modalGhostText: { color: '#0f172a', fontWeight: '600' },
  modalPrimary: { backgroundColor: '#0f172a' },
  modalPrimaryText: { color: '#ffffff', fontWeight: '600' },
})
