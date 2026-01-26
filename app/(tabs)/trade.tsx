import { supabase } from '@/lib/supabase'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImagePicker from 'expo-image-picker'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

export default function Trade() {
  const [giftCards, setGiftCards] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCard, setSelectedCard] = useState<any>(null)
  const [amountUSD, setAmountUSD] = useState('')
  const [images, setImages] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [tradeHistory, setTradeHistory] = useState<any[]>([])
  const [refreshing, setRefreshing] = useState(false)

  // ✅ Get logged-in user
  const getUser = useCallback(async () => {
    const { data } = await supabase.auth.getUser()
    if (data?.user) setUser(data.user)
  }, [])

  // ✅ Fetch gift cards
  const fetchCards = useCallback(async () => {
    const { data, error } = await supabase.from('gift_cards').select('*')
    if (!error) setGiftCards(data || [])
  }, [])

  // ✅ Fetch trade history
  const fetchTradeHistory = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
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

  // ✅ Pick multiple images
  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    })
    if (!result.canceled) setImages(result.assets)
  }

  // ✅ Calculate total
  const calculateTotal = () =>
    selectedCard && amountUSD ? Number(amountUSD) * selectedCard.rate : 0

  // ✅ Universal image upload (web + mobile)
  const uploadImageToSupabase = async (uri: string, filePath: string) => {
    try {
      let fileData: any
      let contentType = 'image/jpeg'

      if (Platform.OS === 'web') {
        const response = await fetch(uri)
        const blob = await response.blob()
        contentType = blob.type || 'image/jpeg'
        fileData = blob
      } else {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        })
        fileData = Buffer.from(base64, 'base64')
      }

      const { error } = await supabase.storage
        .from('trade-images')
        .upload(filePath, fileData, {
          contentType,
          upsert: true,
        })

      if (error) throw error

      const {
        data: { publicUrl },
      } = supabase.storage.from('trade-images').getPublicUrl(filePath)

      return publicUrl
    } catch (error) {
      console.error('❌ Upload error:', error)
      throw error
    }
  }

  // ✅ Submit trade
  const submitTrade = async () => {
    if (!selectedCard) return Alert.alert('Error', 'Select a gift card.')
    if (!amountUSD) return Alert.alert('Error', 'Enter amount in USD.')
    if (images.length === 0)
      return Alert.alert('Error', 'Upload at least one image.')
    if (!user) return Alert.alert('Error', 'Please log in again.')

    try {
      setUploading(true)

      const { data: authData } = await supabase.auth.getSession()
      if (!authData.session) {
        Alert.alert('Session expired', 'Please log in again.')
        setUploading(false)
        return
      }

      const totalNaira = calculateTotal()
      const uploadedUrls: string[] = []

      for (const image of images) {
        const uri = image.uri
        const fileExt = uri.split('.').pop()
        const fileName = `${user.id}_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2)}.${fileExt}`
        const filePath = `trades/${fileName}`

        const publicUrl = await uploadImageToSupabase(uri, filePath)
        uploadedUrls.push(publicUrl)
      }

      const { error: insertErr } = await supabase.from('trades').insert({
        user_id: user.id,
        user_email: user.email,
        user_name: user.user_metadata?.username || 'Anonymous',
        card_name: selectedCard.name,
        amount_usd: Number(amountUSD),
        rate: selectedCard.rate,
        total: totalNaira,
        image_urls: uploadedUrls,
        status: 'pending',
      })

      if (insertErr) throw insertErr

      Alert.alert('✅ Success', 'Trade submitted successfully!')
      setAmountUSD('')
      setImages([])
      setSelectedCard(null)
      fetchTradeHistory()
    } catch (err: any) {
      console.error('Trade submission failed:', err)
      Alert.alert('Error', err.message || 'Something went wrong')
    } finally {
      setUploading(false)
    }
  }

  // ✅ UI
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
      <LinearGradient
        colors={['#2563eb', '#1e40af']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.headerText}>Trade Gift Cards</Text>
      </LinearGradient>

      <Text style={styles.sectionTitle}>Available Gift Cards</Text>

      {loading ? (
        <ActivityIndicator size='large' color='#2563eb' />
      ) : (
        <FlatList
          horizontal
          data={giftCards}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setSelectedCard(item)}
              style={[
                styles.card,
                selectedCard?.id === item.id && styles.cardSelected,
              ]}
            >
              <Image
                source={{ uri: item.image_url }}
                style={styles.cardImage}
              />
              <Text
                style={[
                  styles.cardText,
                  selectedCard?.id === item.id && styles.cardTextSelected,
                ]}
              >
                {item.name}
              </Text>
              <Text
                style={[
                  styles.cardRate,
                  selectedCard?.id === item.id && styles.cardRateSelected,
                ]}
              >
                ₦{item.rate}/$
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Enter Amount (USD)</Text>
        <TextInput
          value={amountUSD}
          onChangeText={setAmountUSD}
          keyboardType='numeric'
          placeholder='Enter amount in USD'
          placeholderTextColor='#9ca3af'
          style={styles.input}
        />
      </View>

      {selectedCard && amountUSD ? (
        <View style={styles.totalBox}>
          <Text style={styles.totalText}>
            Total: ₦{calculateTotal().toLocaleString()}
          </Text>
        </View>
      ) : null}

      <TouchableOpacity onPress={pickImages} style={styles.uploadBox}>
        {images.length > 0 ? (
          <ScrollView horizontal>
            {images.map((img, i) => (
              <Image
                key={i}
                source={{ uri: img.uri }}
                style={styles.uploadImage}
              />
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.uploadText}>📷 Upload Gift Card Images</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={submitTrade}
        disabled={uploading}
        style={styles.submitButton}
      >
        <LinearGradient
          colors={['#2563eb', '#1d4ed8']}
          style={[styles.gradientButton, uploading && { opacity: 0.7 }]}
        >
          {uploading ? (
            <ActivityIndicator color='#fff' />
          ) : (
            <Text style={styles.submitText}>Submit Trade</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>

      {/* Trade History */}
      <View style={styles.historyContainer}>
        <Text style={styles.historyTitle}>📜 Trade History</Text>
        {tradeHistory.length === 0 ? (
          <Text style={styles.noHistory}>No trades yet.</Text>
        ) : (
          tradeHistory.map((trade) => (
            <View key={trade.id} style={styles.tradeCard}>
              <ScrollView horizontal>
                {trade.image_urls?.map((url: string, i: number) => (
                  <Image
                    key={i}
                    source={{ uri: url }}
                    style={styles.tradeImage}
                  />
                ))}
              </ScrollView>
              <Text style={styles.tradeName}>{trade.card_name}</Text>
              <Text style={styles.tradeDetails}>
                ${trade.amount_usd} → ₦{trade.total?.toLocaleString()}
              </Text>
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
                    fontWeight: '600',
                  }}
                >
                  {trade.status.toUpperCase()}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#f9fafb', paddingBottom: 50 },
  header: {
    borderRadius: 20,
    paddingVertical: 20,
    margin: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  headerText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginHorizontal: 20,
    marginBottom: 10,
    color: '#374151',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 10,
    width: 150,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#1e3a8a',
  },
  cardImage: { width: 80, height: 60, borderRadius: 8, marginBottom: 6 },
  cardText: { color: '#111827', fontWeight: '600' },
  cardTextSelected: { color: '#fff' },
  cardRate: { color: '#6b7280', fontSize: 12 },
  cardRateSelected: { color: '#dbeafe' },
  inputContainer: { marginTop: 20, marginHorizontal: 20 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8, color: '#374151' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    fontSize: 16,
    color: '#111827',
  },
  totalBox: {
    marginTop: 14,
    marginHorizontal: 20,
    backgroundColor: '#e0f2fe',
    padding: 12,
    borderRadius: 10,
  },
  totalText: { fontSize: 15, fontWeight: '600', color: '#0369a1' },
  uploadBox: {
    marginTop: 20,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  uploadText: { color: '#2563eb', fontWeight: '600', fontSize: 15 },
  uploadImage: {
    width: 120,
    height: 80,
    borderRadius: 8,
    marginRight: 8,
  },
  submitButton: { marginTop: 22, marginHorizontal: 20 },
  gradientButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  historyContainer: { marginTop: 32, marginHorizontal: 20 },
  historyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  noHistory: { color: '#6b7280', textAlign: 'center' },
  tradeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  tradeImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 8,
  },
  tradeName: { fontWeight: '600', marginTop: 6, color: '#111827' },
  tradeDetails: { color: '#6b7280', marginTop: 2 },
  statusBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
})
