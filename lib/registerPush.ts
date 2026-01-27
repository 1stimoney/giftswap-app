// lib/registerForPushNotifications.ts
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

function getDeviceId() {
  // Stable per-install. If you want truly persistent across reinstalls,
  // we can store a generated UUID in SecureStore instead.
  return (
    Application.getAndroidId?.() ||
    Application.applicationId ||
    `unknown-${Math.random().toString(36).slice(2)}`
  )
}

export async function ensurePushTokenForThisDevice(userId: string) {
  const deviceId = String(getDeviceId())

  // If a row exists for THIS device, do not prompt again
  const { data: existing, error: existErr } = await supabase
    .from('push_tokens')
    .select('id, token')
    .eq('device_id', deviceId)
    .maybeSingle()

  if (existErr) throw existErr
  if (existing?.token) return { status: 'exists' as const }

  // Permission prompt (only happens when device row doesn't exist)
  const perm = await Notifications.getPermissionsAsync()
  let finalStatus = perm.status

  if (finalStatus !== 'granted') {
    const req = await Notifications.requestPermissionsAsync()
    finalStatus = req.status
  }

  if (finalStatus !== 'granted') return { status: 'denied' as const }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    })
  }

  const projectId = getProjectId()
  if (!projectId) throw new Error('Missing EAS projectId')

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data

  // Upsert by device_id (multi-device safe)
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

  return { status: 'saved' as const, token, deviceId }
}
