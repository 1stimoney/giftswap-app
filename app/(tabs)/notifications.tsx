import { supabase } from '@/lib/supabase'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

export default function NotificationsScreen() {
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<any[]>([])
  const router = useRouter()

  const fetchNotifications = async () => {
    setLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    setNotifications(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchNotifications()

    // 🔴 realtime updates
    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        () => fetchNotifications()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    )
  }

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size='large' color='#2563eb' />
      </View>
    )
  }

  if (!notifications.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No notifications yet</Text>
      </View>
    )
  }

  return (
    <FlatList
      contentContainerStyle={styles.container}
      data={notifications}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[styles.card, !item.is_read && styles.unreadCard]}
          onPress={() => markAsRead(item.id)}
        >
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.message}>{item.message}</Text>
          <Text style={styles.date}>
            {new Date(item.created_at).toLocaleString()}
          </Text>
        </TouchableOpacity>
      )}
    />
  )
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#6b7280' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  unreadCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  title: { fontWeight: '700', fontSize: 15, marginBottom: 4 },
  message: { color: '#374151', fontSize: 14 },
  date: { marginTop: 6, fontSize: 12, color: '#9ca3af' },
})
