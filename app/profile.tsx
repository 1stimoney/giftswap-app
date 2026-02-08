import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type Profile = {
  id: string
  username: string | null
  full_name: string | null
  email: string | null
  avatar_url: string | null
}

// ✅ Robust base64 -> Uint8Array (no Blob / no Buffer)
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
  // default
  return { ext: 'jpg', contentType: 'image/jpeg' }
}

export default function ProfilePage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  // ✅ Avoid “undefined” crashes by allowing null at first
  const [profile, setProfile] = useState<Profile | null>(null)

  const displayName = useMemo(() => {
    if (!profile) return 'User'
    return profile.username || profile.full_name || 'User'
  }, [profile])

  const fetchProfile = async () => {
    try {
      setLoading(true)

      const { data: userData, error: userErr } = await supabase.auth.getUser()
      if (userErr) throw userErr

      const user = userData?.user
      if (!user) {
        router.replace('/(auth)/login')
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, email, avatar_url')
        .eq('id', user.id)
        .maybeSingle()

      if (error) throw error

      // ✅ If profile row doesn’t exist yet, still show something safe
      setProfile({
        id: user.id,
        username: data?.username ?? '',
        full_name: data?.full_name ?? '',
        email: data?.email ?? user.email ?? '',
        avatar_url: data?.avatar_url ?? null,
      })
    } catch (e: any) {
      console.error(e)
      Alert.alert('Error', e?.message || 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfile()
  }, [])

  // ✅ Upload avatar WITHOUT blob()
  const uploadAvatarToSupabase = async (uri: string, userId: string) => {
    const { ext, contentType } = inferImageTypeFromUri(uri)
    const path = `avatars/${userId}/${Date.now()}.${ext}`

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    })
    const bytes = base64ToUint8Array(base64)

    const { error: uploadErr } = await supabase.storage
      // keep your bucket name (you used trade-images)
      .from('trade-images')
      .upload(path, bytes, { contentType, upsert: true })

    if (uploadErr) throw uploadErr

    const {
      data: { publicUrl },
    } = supabase.storage.from('trade-images').getPublicUrl(path)

    if (!publicUrl) throw new Error('Failed to get avatar URL')

    return publicUrl
  }

  const pickAndUploadAvatar = async () => {
    try {
      if (uploading) return
      setUploading(true)

      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert(
          'Permission needed',
          'Allow gallery access to upload avatar.'
        )
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      })

      if (result.canceled) return

      const uri = result.assets?.[0]?.uri
      if (!uri) {
        Alert.alert('Error', 'No image selected.')
        return
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser()
      if (userErr) throw userErr
      const user = userData?.user
      if (!user) {
        router.replace('/(auth)/login')
        return
      }

      const avatarUrl = await uploadAvatarToSupabase(uri, user.id)

      // ✅ Save in profiles.avatar_url
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id)

      if (updateErr) throw updateErr

      setProfile((p) =>
        p
          ? { ...p, avatar_url: avatarUrl }
          : {
              id: user.id,
              username: '',
              full_name: '',
              email: user.email ?? '',
              avatar_url: avatarUrl,
            }
      )

      Alert.alert('Success', 'Avatar updated ✅')
    } catch (e: any) {
      console.error(e)
      Alert.alert('Upload failed', e?.message || 'Could not upload avatar')
    } finally {
      setUploading(false)
    }
  }

  const handleSaveProfile = async () => {
    try {
      if (!profile) return
      setSaving(true)

      const { data: userData, error: userErr } = await supabase.auth.getUser()
      if (userErr) throw userErr
      const user = userData?.user
      if (!user) {
        router.replace('/(auth)/login')
        return
      }

      const username = (profile.username ?? '').trim()
      const full_name = (profile.full_name ?? '').trim()

      if (!full_name || !username) {
        Alert.alert('Missing info', 'Full name and username are required.')
        return
      }

      const { error } = await supabase
        .from('profiles')
        .update({ username, full_name })
        .eq('id', user.id)

      if (error) throw error

      Alert.alert('Saved', 'Profile updated successfully ✅')
    } catch (e: any) {
      console.error(e)
      Alert.alert('Error', e?.message || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size='large' color='#2563eb' />
      </View>
    )
  }

  // ✅ Extra guard (prevents “undefined” render errors)
  if (!profile) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style='dark' backgroundColor='#fff' />
        <View style={[styles.loader, { padding: 18 }]}>
          <Text style={{ color: '#64748b' }}>
            Profile not available. Pull to refresh or login again.
          </Text>
          <Pressable
            onPress={fetchProfile}
            style={{
              marginTop: 12,
              backgroundColor: '#2563eb',
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Reload</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style='dark' backgroundColor='#fff' />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps='handled'
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              style={styles.backBtn}
              onPress={() => router.replace('/(tabs)/settings')}
            >
              <Ionicons name='chevron-back' size={22} color='#0f172a' />
            </Pressable>

            <Text style={styles.headerTitle}>Edit Profile</Text>

            <View style={{ width: 44 }} />
          </View>

          {/* Card */}
          <View style={styles.card}>
            {/* Avatar */}
            <View style={styles.avatarRow}>
              <View style={styles.avatarWrap}>
                {profile.avatar_url ? (
                  <Image
                    source={{ uri: profile.avatar_url }}
                    style={styles.avatarImg}
                  />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Ionicons name='person' size={26} color='#0f172a' />
                  </View>
                )}
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.nameText}>{displayName}</Text>
                <Text style={styles.emailSmall}>{profile.email || ''}</Text>

                <Pressable
                  style={[styles.avatarBtn, uploading && { opacity: 0.7 }]}
                  onPress={pickAndUploadAvatar}
                  disabled={uploading}
                >
                  <Ionicons name='camera-outline' size={16} color='#2563eb' />
                  <Text style={styles.avatarBtnText}>
                    {uploading ? 'Uploading...' : 'Change photo'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Inputs */}
            <View style={styles.form}>
              <Text style={styles.label}>Full name</Text>
              <TextInput
                value={profile.full_name ?? ''}
                onChangeText={(t) =>
                  setProfile((p) => (p ? { ...p, full_name: t } : p))
                }
                placeholder='Full name'
                placeholderTextColor='#94a3b8'
                style={styles.input}
              />

              <Text style={styles.label}>Username</Text>
              <TextInput
                value={profile.username ?? ''}
                onChangeText={(t) =>
                  setProfile((p) => (p ? { ...p, username: t } : p))
                }
                placeholder='Username'
                placeholderTextColor='#94a3b8'
                autoCapitalize='none'
                style={styles.input}
              />

              <Text style={styles.label}>Email</Text>
              <TextInput
                value={profile.email ?? ''}
                editable={false}
                style={[styles.input, styles.inputDisabled]}
              />

              <Pressable
                style={[styles.saveBtn, saving && { opacity: 0.7 }]}
                onPress={handleSaveProfile}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? 'Saving...' : 'Save changes'}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={{ height: 28 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 18, paddingBottom: 40 },

  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eef2f7',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },

  avatarRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  avatarWrap: {
    width: 78,
    height: 78,
    borderRadius: 40,
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  nameText: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  emailSmall: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },

  avatarBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  avatarBtnText: { color: '#2563eb', fontWeight: '600' },

  form: { marginTop: 18 },
  label: { fontSize: 12, color: '#64748b', fontWeight: '600', marginBottom: 6 },

  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    marginBottom: 14,
    fontWeight: '600',
  },
  inputDisabled: {
    backgroundColor: '#f1f5f9',
    color: '#64748b',
  },

  saveBtn: {
    marginTop: 6,
    backgroundColor: '#2563eb',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
})
