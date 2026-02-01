import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
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

type Profile = {
  id: string
  username: string | null
  full_name: string | null
  email: string | null
  avatar_url: string | null
}

export default function ProfilePage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [profile, setProfile] = useState<Profile>({
    id: '',
    username: '',
    full_name: '',
    email: '',
    avatar_url: null,
  })

  const displayName = useMemo(() => {
    return profile.username || profile.full_name || 'User'
  }, [profile.username, profile.full_name])

  const fetchProfile = async () => {
    try {
      setLoading(true)
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser()

      if (userErr) throw userErr
      if (!user) {
        router.replace('/(auth)/login')
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, email, avatar_url')
        .eq('id', user.id)
        .single()

      if (error) throw error

      setProfile({
        id: data.id,
        username: data.username ?? '',
        full_name: data.full_name ?? '',
        email: data.email ?? user.email ?? '',
        avatar_url: data.avatar_url ?? null,
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

  // Convert image uri to ArrayBuffer for Supabase storage upload
  const uriToArrayBuffer = async (uri: string) => {
    const res = await fetch(uri)
    const blob = await res.blob()
    return await blob.arrayBuffer()
  }

  const pickAndUploadAvatar = async () => {
    try {
      setUploading(true)

      // Permission
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
      if (!uri) return

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `avatars/${user.id}/${Date.now()}.${fileExt}`

      const arrayBuffer = await uriToArrayBuffer(uri)

      // Upload to bucket: trade-images
      const { error: uploadErr } = await supabase.storage
        .from('trade-images')
        .upload(path, arrayBuffer, {
          contentType: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
          upsert: true,
        })

      if (uploadErr) throw uploadErr

      // Get public URL (works if bucket is public OR you have policy)
      const { data: publicUrlData } = supabase.storage
        .from('trade-images')
        .getPublicUrl(path)

      const avatarUrl = publicUrlData?.publicUrl
      if (!avatarUrl) throw new Error('Failed to get avatar URL')

      // Save in profiles.avatar_url
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id)

      if (updateErr) throw updateErr

      setProfile((p) => ({ ...p, avatar_url: avatarUrl }))
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
      setSaving(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.safe}
    >
      <ScrollView contentContainerStyle={styles.container}>
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
              onChangeText={(t) => setProfile((p) => ({ ...p, full_name: t }))}
              placeholder='Full name'
              placeholderTextColor='#94a3b8'
              style={styles.input}
            />

            <Text style={styles.label}>Username</Text>
            <TextInput
              value={profile.username ?? ''}
              onChangeText={(t) => setProfile((p) => ({ ...p, username: t }))}
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
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
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
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#0f172a' },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
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

  nameText: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  emailSmall: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
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
  avatarBtnText: { color: '#2563eb', fontWeight: '900' },

  form: { marginTop: 18 },
  label: { fontSize: 12, color: '#64748b', fontWeight: '800', marginBottom: 6 },

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
    fontWeight: '700',
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
  saveBtnText: { color: '#ffffff', fontWeight: '900', fontSize: 15 },
})
