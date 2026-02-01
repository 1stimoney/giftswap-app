import { supabase } from '@/lib/supabase'
import * as ImagePicker from 'expo-image-picker'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

type TradeType = 'physical' | 'ecode'

type GiftCard = {
  id: string
  name: string
  image_url?: string | null
  physical_rate: number
  ecode_rate: number
}

export default function Trade() {
  const [giftCards, setGiftCards] = useState<GiftCard[]>([])
  const [loading, setLoading] = useState(true)

  const [user, setUser] = useState<any>(null)
  const [tradeHistory, setTradeHistory] = useState<any[]>([])
  const [refreshing, setRefreshing] = useState(false)

  // new trade state
  const [tradeType, setTradeType] = useState<TradeType | null>(null)
  const [selectedCard, setSelectedCard] = useState<GiftCard | null>(null)
  const [amountUSD, setAmountUSD] = useState('')
  const [images, setImages] = useState<ImagePicker.ImagePickerAsset[]>([])
  const [cardCode, setCardCode] = useState('')

  const [uploading, setUploading] = useState(false)

  // modal dropdown
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')

  // ✅ Get logged-in user
  const getUser = useCallback(async () => {
    const { data } = await supabase.auth.getUser()
    if (data?.user) setUser(data.user)
  }, [])

  // ✅ Fetch gift cards
  const fetchCards = useCallback(async () => {
    const { data, error } = await supabase
      .from('gift_cards')
      .select('id, name, image_url, physical_rate, ecode_rate')
      .order('name', { ascending: true })

    if (error) {
      console.error(error)
      return
    }

    setGiftCards((data || []) as GiftCard[])
  }, [])

  // ✅ Fetch trade history
  const fetchTradeHistory = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) console.error(error)
    setTradeHistory(data || [])
  }, [user])

  // ✅ Combined refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([getUser(), fetchCards(), fetchTradeHistory()])
    setRefreshing(false)
  }, [fetchCards, fetchTradeHistory, getUser])

  // ✅ Initial load
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await getUser()
      await fetchCards()
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (user) fetchTradeHistory()
  }, [user])

  // ✅ Auto refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTradeHistory()
    }, 15000)
    return () => clearInterval(interval)
  }, [fetchTradeHistory])

  const rate = useMemo(() => {
    if (!selectedCard || !tradeType) return 0
    return tradeType === 'physical'
      ? Number(selectedCard.physical_rate || 0)
      : Number(selectedCard.ecode_rate || 0)
  }, [selectedCard, tradeType])

  const totalNaira = useMemo(() => {
    const usd = Number(amountUSD || 0)
    if (!rate || !usd) return 0
    return usd * rate
  }, [amountUSD, rate])

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return giftCards
    return giftCards.filter((c) => c.name.toLowerCase().includes(q))
  }, [giftCards, search])

  // ✅ pick multiple images (Physical only)
  const pickImages = async () => {
    if (tradeType !== 'physical') return

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(
        'Permission required',
        'Allow photo library access to upload.'
      )
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    })

    if (!result.canceled) setImages(result.assets)
  }

  // ✅ Upload using Blob (fixes Android Buffer issue)
  const uploadImageToSupabase = async (uri: string, filePath: string) => {
    const res = await fetch(uri)
    const blob = await res.blob()

    const { error } = await supabase.storage
      .from('trade-images')
      .upload(filePath, blob, {
        contentType: blob.type || 'image/jpeg',
        upsert: true,
      })

    if (error) throw error

    const {
      data: { publicUrl },
    } = supabase.storage.from('trade-images').getPublicUrl(filePath)

    return publicUrl
  }

  const resetForm = () => {
    setTradeType(null)
    setSelectedCard(null)
    setAmountUSD('')
    setImages([])
    setCardCode('')
    setSearch('')
  }

  // ✅ Submit trade
  const submitTrade = async () => {
    if (!user) return Alert.alert('Error', 'Please log in again.')
    if (!tradeType)
      return Alert.alert('Error', 'Select Physical or E-code first.')
    if (!selectedCard) return Alert.alert('Error', 'Select a gift card.')
    if (!amountUSD) return Alert.alert('Error', 'Enter amount in USD.')

    const usd = Number(amountUSD)
    if (!Number.isFinite(usd) || usd <= 0) {
      return Alert.alert('Error', 'Enter a valid USD amount.')
    }

    if (!rate || rate <= 0) {
      return Alert.alert('Rate missing', 'This card has no rate set yet.')
    }

    // Physical requirements
    if (tradeType === 'physical') {
      if (images.length === 0) {
        return Alert.alert('Error', 'Upload at least one image (required).')
      }
      // code optional
    }

    // E-code requirements
    if (tradeType === 'ecode') {
      if (!cardCode.trim()) {
        return Alert.alert('Error', 'E-code is required for e-code trades.')
      }
    }

    try {
      setUploading(true)

      const { data: authData } = await supabase.auth.getSession()
      if (!authData.session) {
        Alert.alert('Session expired', 'Please log in again.')
        return
      }

      // upload images only for physical
      let uploadedUrls: string[] = []

      if (tradeType === 'physical') {
        const urls: string[] = []
        for (const img of images) {
          const uri = img.uri
          const ext = (uri.split('.').pop() || 'jpg').split('?')[0]
          const fileName = `${user.id}_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2)}.${ext}`
          const filePath = `trades/${fileName}`
          const publicUrl = await uploadImageToSupabase(uri, filePath)
          urls.push(publicUrl)
        }
        uploadedUrls = urls
      }

      const { error: insertErr } = await supabase.from('trades').insert({
        user_id: user.id,
        user_email: user.email,
        user_name: user.user_metadata?.username || 'Anonymous',

        card_id: selectedCard.id,
        card_name: selectedCard.name,

        trade_type: tradeType,
        card_code: cardCode.trim() ? cardCode.trim() : null,

        amount_usd: usd,
        rate,
        total: totalNaira,

        image_urls: tradeType === 'physical' ? uploadedUrls : [],

        status: 'pending',
      })

      if (insertErr) throw insertErr

      Alert.alert('✅ Success', 'Trade submitted successfully!')
      resetForm()
      fetchTradeHistory()
    } catch (err: any) {
      console.error('Trade submission failed:', err)
      Alert.alert('Error', err?.message || 'Something went wrong')
    } finally {
      setUploading(false)
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
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
        colors={['#0ea5e9', '#2563eb', '#1e40af']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.headerTitle}>Trade</Text>
        <Text style={styles.headerSubtitle}>
          Sell your gift cards instantly
        </Text>
      </LinearGradient>

      {/* Step 1: Trade type */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Type</Text>

        <View style={styles.typeRow}>
          <Pressable
            onPress={() => {
              setTradeType('physical')
              setCardCode('')
            }}
            style={[
              styles.typeChip,
              tradeType === 'physical' && styles.typeChipActive,
            ]}
          >
            <Text
              style={[
                styles.typeChipText,
                tradeType === 'physical' && styles.typeChipTextActive,
              ]}
            >
              Physical
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setTradeType('ecode')
              setImages([])
            }}
            style={[
              styles.typeChip,
              tradeType === 'ecode' && styles.typeChipActive,
            ]}
          >
            <Text
              style={[
                styles.typeChipText,
                tradeType === 'ecode' && styles.typeChipTextActive,
              ]}
            >
              E-code
            </Text>
          </Pressable>
        </View>

        <Text style={styles.helper}>
          {tradeType === 'physical'
            ? 'Physical requires at least 1 image. Code is optional.'
            : tradeType === 'ecode'
            ? 'E-code requires the code. No images needed.'
            : 'Choose a trade type to continue.'}
        </Text>
      </View>

      {/* Step 2: Card picker */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Gift Card</Text>

        <Pressable
          onPress={() => {
            if (!tradeType) {
              Alert.alert(
                'Select type first',
                'Choose Physical or E-code before picking a card.'
              )
              return
            }
            setPickerOpen(true)
          }}
          style={styles.pickerBtn}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.pickerLabel}>
              {selectedCard ? selectedCard.name : 'Select card category'}
            </Text>
            {selectedCard && tradeType ? (
              <Text style={styles.pickerSub}>
                Rate: ₦{rate.toLocaleString()}/$
              </Text>
            ) : (
              <Text style={styles.pickerSub}>Tap to choose</Text>
            )}
          </View>

          {selectedCard?.image_url ? (
            <Image
              source={{ uri: selectedCard.image_url }}
              style={styles.pickerThumb}
            />
          ) : (
            <View style={styles.pickerThumbPlaceholder} />
          )}
        </Pressable>
      </View>

      {/* Amount + total */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Amount</Text>

        <View style={styles.amountCard}>
          <Text style={styles.inputLabel}>Enter Amount (USD)</Text>
          <TextInput
            value={amountUSD}
            onChangeText={(t) => setAmountUSD(t.replace(/[^0-9.]/g, ''))}
            keyboardType='numeric'
            placeholder='e.g. 100'
            placeholderTextColor='#94a3b8'
            style={styles.input}
          />

          <View style={styles.totalRow}>
            <Text style={styles.totalLeft}>You’ll receive</Text>
            <Text style={styles.totalRight}>
              ₦{totalNaira.toLocaleString()}
            </Text>
          </View>
        </View>
      </View>

      {/* Physical: upload images */}
      {tradeType === 'physical' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upload Images (required)</Text>

          <Pressable onPress={pickImages} style={styles.uploadBox}>
            {images.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {images.map((img, i) => (
                  <Image
                    key={i}
                    source={{ uri: img.uri }}
                    style={styles.uploadImg}
                  />
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.uploadHint}>Tap to upload photos</Text>
            )}
          </Pressable>

          <Text style={[styles.inputLabel, { marginTop: 12 }]}>
            Card Code (optional)
          </Text>
          <TextInput
            value={cardCode}
            onChangeText={setCardCode}
            placeholder='Optional code'
            placeholderTextColor='#94a3b8'
            style={styles.input}
          />
        </View>
      )}

      {/* E-code: code required */}
      {tradeType === 'ecode' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>E-code (required)</Text>

          <Text style={styles.helper}>
            Paste your card code here. Make sure it’s correct.
          </Text>

          <TextInput
            value={cardCode}
            onChangeText={setCardCode}
            placeholder='Enter e-code'
            placeholderTextColor='#94a3b8'
            style={styles.input}
            multiline
          />
        </View>
      )}

      {/* Submit */}
      <TouchableOpacity
        onPress={submitTrade}
        disabled={uploading}
        style={styles.submitWrap}
      >
        <LinearGradient
          colors={['#0f172a', '#111827']}
          style={[styles.submitBtn, uploading && { opacity: 0.7 }]}
        >
          {uploading ? (
            <ActivityIndicator color='#fff' />
          ) : (
            <Text style={styles.submitText}>Submit Trade</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>

      {/* Trade History */}
      <View style={styles.history}>
        <Text style={styles.historyTitle}>Trade History</Text>

        {loading ? (
          <ActivityIndicator size='large' color='#2563eb' />
        ) : tradeHistory.length === 0 ? (
          <Text style={styles.noHistory}>No trades yet.</Text>
        ) : (
          tradeHistory.map((trade) => (
            <View key={trade.id} style={styles.historyCard}>
              <View style={styles.historyTop}>
                <Text style={styles.historyName}>{trade.card_name}</Text>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>
                    {(trade.trade_type || 'physical').toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={styles.historyMeta}>
                ${trade.amount_usd} → ₦
                {Number(trade.total || 0).toLocaleString()} • ₦{trade.rate}/$
              </Text>

              {/* images (physical) */}
              {Array.isArray(trade.image_urls) &&
              trade.image_urls.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 10 }}
                >
                  {trade.image_urls.map((url: string, i: number) => (
                    <Image
                      key={i}
                      source={{ uri: url }}
                      style={styles.historyImg}
                    />
                  ))}
                </ScrollView>
              ) : null}

              {/* status */}
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor:
                      trade.status === 'approved'
                        ? '#dcfce7'
                        : trade.status === 'rejected'
                        ? '#fee2e2'
                        : '#fef9c3',
                  },
                ]}
              >
                <Text
                  style={{
                    color:
                      trade.status === 'approved'
                        ? '#16a34a'
                        : trade.status === 'rejected'
                        ? '#dc2626'
                        : '#ca8a04',
                    fontWeight: '800',
                  }}
                >
                  {String(trade.status).toUpperCase()}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Card Picker Modal */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType='fade'
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setPickerOpen(false)}
        >
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Gift Card</Text>
              <Pressable
                onPress={() => setPickerOpen(false)}
                style={styles.closeBtn}
              >
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder='Search cards...'
              placeholderTextColor='#94a3b8'
              style={styles.searchInput}
            />

            <FlatList
              data={filteredCards}
              keyExtractor={(i) => i.id}
              keyboardShouldPersistTaps='handled'
              renderItem={({ item }) => {
                const itemRate =
                  tradeType === 'ecode'
                    ? Number(item.ecode_rate || 0)
                    : Number(item.physical_rate || 0)

                return (
                  <Pressable
                    onPress={() => {
                      setSelectedCard(item)
                      setPickerOpen(false)
                    }}
                    style={styles.modalItem}
                  >
                    {item.image_url ? (
                      <Image
                        source={{ uri: item.image_url }}
                        style={styles.modalItemImg}
                      />
                    ) : (
                      <View style={styles.modalItemImgPlaceholder} />
                    )}

                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalItemName}>{item.name}</Text>
                      <Text style={styles.modalItemRate}>
                        ₦{itemRate.toLocaleString()}/$
                      </Text>
                    </View>

                    <Text style={styles.modalArrow}>›</Text>
                  </Pressable>
                )
              }}
              ListEmptyComponent={
                <Text
                  style={{
                    textAlign: 'center',
                    marginTop: 18,
                    color: '#64748b',
                    fontWeight: '800',
                  }}
                >
                  No cards found.
                </Text>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#f8fafc', paddingBottom: 40 },

  header: {
    margin: 16,
    borderRadius: 24,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 4,
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '900' },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
    fontWeight: '600',
  },

  section: { marginHorizontal: 16, marginTop: 14 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  helper: { color: '#64748b', fontWeight: '600', marginTop: 6 },

  typeRow: { flexDirection: 'row', gap: 10 },
  typeChip: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  typeChipActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  typeChipText: { color: '#0f172a', fontWeight: '700' },
  typeChipTextActive: { color: '#fff' },

  pickerBtn: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pickerLabel: { fontWeight: '900', color: '#0f172a', fontSize: 15 },
  pickerSub: {
    marginTop: 4,
    color: '#64748b',
    fontWeight: '600',
    fontSize: 12,
  },
  pickerThumb: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
  },
  pickerThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
  },

  amountCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  inputLabel: { fontWeight: '700', color: '#0f172a' },
  input: {
    marginTop: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 15,
  },
  totalRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLeft: { color: '#64748b', fontWeight: '700' },
  totalRight: { color: '#16a34a', fontWeight: '700', fontSize: 16 },

  uploadBox: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minHeight: 90,
    justifyContent: 'center',
  },
  uploadHint: { textAlign: 'center', color: '#2563eb', fontWeight: '700' },
  uploadImg: { width: 92, height: 92, borderRadius: 16, marginRight: 10 },

  submitWrap: { marginHorizontal: 16, marginTop: 18 },
  submitBtn: { borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  history: { marginTop: 22, marginHorizontal: 16 },
  historyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 12,
  },
  noHistory: { textAlign: 'center', color: '#64748b', fontWeight: '800' },

  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  historyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyName: { fontWeight: '700', color: '#0f172a' },
  historyMeta: { marginTop: 6, color: '#64748b', fontWeight: '600' },

  pill: {
    backgroundColor: '#eef2ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pillText: { color: '#3730a3', fontWeight: '700', fontSize: 12 },

  historyImg: { width: 60, height: 60, borderRadius: 14, marginRight: 8 },

  statusBadge: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },

  // modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '80%',
    padding: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontWeight: '700', color: '#0f172a' },

  searchInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#0f172a',
    fontWeight: '600',
    marginBottom: 10,
  },

  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalItemImg: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
  },
  modalItemImgPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
  },
  modalItemName: { fontWeight: '700', color: '#0f172a' },
  modalItemRate: {
    marginTop: 2,
    color: '#64748b',
    fontWeight: '600',
    fontSize: 12,
  },
  modalArrow: { fontSize: 22, fontWeight: '700', color: '#94a3b8' },
})
