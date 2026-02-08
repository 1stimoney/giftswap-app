import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

// -------------------- Types --------------------
type Thread = {
  id: string
  user_id: string
  subject: string
  status: 'open' | 'closed'
  created_at: string
  updated_at: string
}

type Msg = {
  id: string
  thread_id: string
  sender: 'user' | 'admin'
  message: string
  image_urls?: string[] | null
  created_at: string
}

// -------------------- Helpers (NO blob()) --------------------
function base64ToUint8Array(base64: string) {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '')
  const len = clean.length

  let padding = 0
  if (clean.endsWith('==')) padding = 2
  else if (clean.endsWith('=')) padding = 1

  const bytesLength = (len * 3) / 4 - padding
  const bytes = new Uint8Array(bytesLength)

  let p = 0
  for (let i = 0; i < len; i += 4) {
    const enc1 = chars.indexOf(clean[i])
    const enc2 = chars.indexOf(clean[i + 1])
    const enc3 = chars.indexOf(clean[i + 2])
    const enc4 = chars.indexOf(clean[i + 3])

    const chr1 = (enc1 << 2) | (enc2 >> 4)
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2)
    const chr3 = ((enc3 & 3) << 6) | enc4

    bytes[p++] = chr1
    if (clean[i + 2] !== '=') bytes[p++] = chr2
    if (clean[i + 3] !== '=') bytes[p++] = chr3
  }

  return bytes
}

function inferImageTypeFromUri(uri: string) {
  const ext = (uri.split('.').pop() || '').split('?')[0].toLowerCase()
  if (ext === 'png') return { ext: 'png', contentType: 'image/png' }
  if (ext === 'webp') return { ext: 'webp', contentType: 'image/webp' }
  if (ext === 'heic' || ext === 'heif')
    return { ext: 'heic', contentType: 'image/heic' }
  return { ext: 'jpg', contentType: 'image/jpeg' }
}

async function uploadSupportImage(uri: string, path: string) {
  // ✅ No blob(); uses base64 -> Uint8Array
  const { contentType } = inferImageTypeFromUri(uri)

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  })
  const bytes = base64ToUint8Array(base64)

  const { error } = await supabase.storage
    .from('support-images')
    .upload(path, bytes, {
      contentType,
      upsert: true,
    })
  if (error) throw error

  const {
    data: { publicUrl },
  } = supabase.storage.from('support-images').getPublicUrl(path)

  if (!publicUrl) throw new Error('Failed to get image URL')
  return publicUrl
}

// -------------------- Screen --------------------
export default function ChatThreadPage() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const threadId = String(id || '')

  const [loading, setLoading] = useState(true)
  const [thread, setThread] = useState<Thread | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  // image attachment state
  const [attachments, setAttachments] = useState<
    ImagePicker.ImagePickerAsset[]
  >([])
  const [previewOpen, setPreviewOpen] = useState(false)

  const listRef = useRef<FlatList<Msg>>(null)

  const headerTitle = useMemo(() => thread?.subject || 'Support', [thread])
  const canSend = thread?.status === 'open'

  const markThreadRead = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      await supabase.from('support_thread_reads').upsert(
        {
          thread_id: threadId,
          user_id: user.id,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: 'thread_id,user_id' }
      )
    } catch {
      // ignore
    }
  }

  const fetchThreadAndMessages = async () => {
    if (!threadId) throw new Error('Invalid thread id')

    const { data: t, error: tErr } = await supabase
      .from('support_threads')
      .select('*')
      .eq('id', threadId)
      .single()
    if (tErr) throw tErr
    setThread(t as Thread)

    const { data: msgs, error: mErr } = await supabase
      .from('support_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
    if (mErr) throw mErr

    setMessages((msgs as Msg[]) || [])

    await markThreadRead()
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50)
  }

  useEffect(() => {
    let channel: any

    const init = async () => {
      try {
        setLoading(true)
        await fetchThreadAndMessages()

        channel = supabase
          .channel(`support-messages-${threadId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'support_messages',
              filter: `thread_id=eq.${threadId}`,
            },
            async (payload) => {
              const msg = payload.new as Msg

              setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev
                return [...prev, msg]
              })

              setTimeout(
                () => listRef.current?.scrollToEnd({ animated: true }),
                70
              )

              await markThreadRead()
            }
          )
          .subscribe()
      } catch (e: any) {
        console.log(e)
        Alert.alert('Error', e?.message || 'Failed to open ticket')
        router.back()
      } finally {
        setLoading(false)
      }
    }

    init()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [router, threadId])

  const pickImages = async () => {
    if (!canSend) return

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted)
      return Alert.alert('Permission needed', 'Please allow photo access.')

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    })

    if (!result.canceled) {
      setAttachments((prev) => [...prev, ...result.assets].slice(0, 6))
      setPreviewOpen(true)
    }
  }

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx))
  }

  const closeTicket = async () => {
    if (!thread) return
    if (thread.status !== 'open') return

    Alert.alert(
      'Close ticket?',
      'You won’t be able to send new messages after closing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('support_threads')
                .update({ status: 'closed' })
                .eq('id', threadId)

              if (error) throw error
              setThread((p) => (p ? { ...p, status: 'closed' } : p))
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to close ticket')
            }
          },
        },
      ]
    )
  }

  const sendMessage = async () => {
    const msg = text.trim()
    if ((!msg && attachments.length === 0) || !thread) return
    if (!canSend)
      return Alert.alert('Ticket closed', 'This conversation is closed.')

    try {
      setSending(true)

      let urls: string[] = []
      if (attachments.length > 0) {
        urls = []
        for (const asset of attachments) {
          const { ext } = inferImageTypeFromUri(asset.uri)
          const path = `threads/${threadId}/${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}.${ext}`

          const url = await uploadSupportImage(asset.uri, path)
          urls.push(url)
        }
      }

      setText('')
      setAttachments([])
      setPreviewOpen(false)

      const { error } = await supabase.from('support_messages').insert({
        thread_id: threadId,
        sender: 'user',
        message: msg || (urls.length ? '📎 Attachment' : ''),
        image_urls: urls.length ? urls : null,
      })

      if (error) throw error

      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80)
      await markThreadRead()
    } catch (e: any) {
      console.log(e)
      Alert.alert('Error', e?.message || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const renderItem = ({ item }: { item: Msg }) => {
    const mine = item.sender === 'user'
    const imgs = item.image_urls || []

    return (
      <View
        style={[
          styles.bubbleWrap,
          mine ? styles.bubbleMineWrap : styles.bubbleTheirsWrap,
        ]}
      >
        <View
          style={[
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleTheirs,
          ]}
        >
          {imgs.length > 0 ? (
            <View style={{ marginBottom: item.message ? 10 : 0 }}>
              <FlatList
                data={imgs}
                horizontal
                keyExtractor={(u) => u}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item: url }) => (
                  <Image source={{ uri: url }} style={styles.msgImg} />
                )}
              />
            </View>
          ) : null}

          {item.message ? (
            <Text
              style={[
                styles.bubbleText,
                mine ? styles.mineText : styles.theirsText,
              ]}
            >
              {item.message}
            </Text>
          ) : null}

          <Text
            style={[
              styles.timeText,
              mine ? styles.timeMine : styles.timeTheirs,
            ]}
          >
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      </View>
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style='dark' backgroundColor='#fff' />
        <View style={styles.loader}>
          <ActivityIndicator size='large' color='#2563eb' />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style='dark' backgroundColor='#fff' />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={styles.backBtn}
            onPress={() => router.push('/(tabs)/chat')}
          >
            <Ionicons name='chevron-back' size={22} color='#0f172a' />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {headerTitle}
            </Text>
            <Text style={styles.headerSub}>
              {thread?.status === 'open' ? 'Open ticket' : 'Closed ticket'}
            </Text>
          </View>

          <Pressable
            style={styles.closeBtn}
            onPress={closeTicket}
            disabled={!canSend}
          >
            <Ionicons
              name='lock-closed-outline'
              size={18}
              color={canSend ? '#0f172a' : '#94a3b8'}
            />
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: false })
          }
          onScrollBeginDrag={markThreadRead}
        />

        {/* Composer */}
        <View
          style={[
            styles.composer,
            { paddingBottom: Math.max(10, insets.bottom) },
          ]}
        >
          <Pressable
            onPress={pickImages}
            disabled={!canSend || sending}
            style={[
              styles.attachBtn,
              (!canSend || sending) && { opacity: 0.5 },
            ]}
          >
            <Ionicons name='attach-outline' size={18} color='#0f172a' />
          </Pressable>

          <View style={[styles.inputBox, !canSend && { opacity: 0.6 }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={
                canSend ? 'Type your message…' : 'This ticket is closed'
              }
              placeholderTextColor='#94a3b8'
              style={styles.input}
              editable={!!canSend}
              multiline
            />
          </View>

          <Pressable
            onPress={sendMessage}
            disabled={
              sending || (!text.trim() && attachments.length === 0) || !canSend
            }
            style={[
              styles.sendBtn,
              (sending ||
                (!text.trim() && attachments.length === 0) ||
                !canSend) && { opacity: 0.5 },
            ]}
          >
            {sending ? (
              <ActivityIndicator color='#fff' />
            ) : (
              <Ionicons name='send' size={18} color='#fff' />
            )}
          </Pressable>
        </View>

        {/* Attachments Preview Modal */}
        <Modal
          visible={previewOpen}
          transparent
          animationType='fade'
          onRequestClose={() => setPreviewOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Attachments</Text>
              <Text style={styles.modalSub}>
                These will be sent with your next message.
              </Text>

              <View style={{ marginTop: 12 }}>
                <FlatList
                  data={attachments}
                  horizontal
                  keyExtractor={(a) => a.uri}
                  showsHorizontalScrollIndicator={false}
                  renderItem={({ item, index }) => (
                    <View style={{ marginRight: 10 }}>
                      <Image
                        source={{ uri: item.uri }}
                        style={styles.previewImg}
                      />
                      <Pressable
                        style={styles.removeImgBtn}
                        onPress={() => removeAttachment(index)}
                      >
                        <Ionicons name='close' size={14} color='#fff' />
                      </Pressable>
                    </View>
                  )}
                />
              </View>

              <View style={styles.modalRow}>
                <Pressable
                  style={[styles.modalBtn, styles.modalGhost]}
                  onPress={() => setPreviewOpen(false)}
                >
                  <Text style={styles.modalGhostText}>Done</Text>
                </Pressable>

                <Pressable
                  style={[styles.modalBtn, styles.modalPrimary]}
                  onPress={sendMessage}
                  disabled={
                    sending ||
                    (!text.trim() && attachments.length === 0) ||
                    !canSend
                  }
                >
                  <Text style={styles.modalPrimaryText}>Send</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#eef2f7',
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#eef2f7',
  },
  headerTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  headerSub: { marginTop: 2, fontSize: 12, color: '#64748b' },

  listContent: { paddingHorizontal: 14, paddingBottom: 10 },

  bubbleWrap: { marginVertical: 6, flexDirection: 'row' },
  bubbleMineWrap: { justifyContent: 'flex-end' },
  bubbleTheirsWrap: { justifyContent: 'flex-start' },

  bubble: {
    maxWidth: '86%',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bubbleMine: { backgroundColor: '#0f172a', borderTopRightRadius: 8 },
  bubbleTheirs: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderTopLeftRadius: 8,
  },

  bubbleText: { fontSize: 14, lineHeight: 20 },
  mineText: { color: '#ffffff' },
  theirsText: { color: '#0f172a' },

  timeText: { marginTop: 6, fontSize: 10 },
  timeMine: { color: 'rgba(255,255,255,0.75)' },
  timeTheirs: { color: '#94a3b8' },

  msgImg: {
    width: 110,
    height: 82,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: '#f1f5f9',
  },

  composer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
    backgroundColor: '#fff',
  },
  attachBtn: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputBox: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  input: { minHeight: 22, maxHeight: 110, fontSize: 14, color: '#0f172a' },

  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  modalSub: { marginTop: 6, fontSize: 12, color: '#64748b' },

  previewImg: {
    width: 120,
    height: 86,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
  },
  removeImgBtn: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
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
