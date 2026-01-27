// lib/push/registerPush.ts
import { supabase } from '@/lib/supabase'
import * as Application from 'expo-application'
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ||
    (Constants.easConfig as any)?.projectId
  )
}

function getInstallDeviceId() {
  // "device id" = this install (changes on reinstall)
  return (
    Application.getAndroidId?.() ||
    Application.applicationId ||
    'unknown-install'
  )
}

export async function ensurePushTokenRowForThisInstall(userId: string) {
  const deviceId = String(getInstallDeviceId())

  // ✅ if we already have a row for THIS install => don't ask again
  const { data: existing, error: existingErr } = await supabase
    .from('push_tokens')
    .select('id, token')
    .eq('device_id', deviceId)
    .maybeSingle()

  if (existingErr) throw existingErr
  if (existing?.token) return { status: 'exists' as const }

  // ✅ Permission prompt (only when install has no row)
  const perm = await Notifications.getPermissionsAsync()
  let status = perm.status

  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync()
    status = req.status
  }

  if (status !== 'granted') return { status: 'denied' as const }

  // Android channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    })
  }

  const projectId = getProjectId()
  if (!projectId) throw new Error('Missing EAS projectId')

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data

  // ✅ Upsert by device_id => multiple devices per user supported
  const { error: upsertErr } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      device_id: deviceId,
      token,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'device_id' }
  )

  if (upsertErr) throw upsertErr

  return { status: 'saved' as const, token }
}
