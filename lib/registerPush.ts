// lib/registerPush.ts
import { supabase } from '@/lib/supabase'
import * as Application from 'expo-application'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowAlert: true,
  }),
})

function isExpoToken(token: string) {
  return (
    token.startsWith('ExponentPushToken') || token.startsWith('ExpoPushToken')
  )
}

async function getStableDeviceId() {
  try {
    if (Platform.OS === 'android') {
      return Application.getAndroidId ?? null
    }
    if (Platform.OS === 'ios') {
      const iosId = await Application.getIosIdForVendorAsync()
      return iosId ?? null
    }
    return null
  } catch {
    return null
  }
}

export async function registerForPushAndSave() {
  try {
    // ✅ Web requires VAPID; skip so you don't crash
    if (Platform.OS === 'web') return { ok: false, skipped: 'web' }

    // ✅ Must be physical device
    if (!Device.isDevice) {
      return {
        ok: false,
        error: 'Must use a physical device for push notifications.',
      }
    }

    // ✅ Must be logged in
    const { data: auth } = await supabase.auth.getUser()
    const user = auth?.user
    if (!user) return { ok: false, error: 'No user session.' }

    // ✅ Android channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      })
    }

    // ✅ Ask permission only when needed
    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }

    if (finalStatus !== 'granted') {
      return { ok: false, denied: true }
    }

    // ✅ EAS projectId (required for getExpoPushTokenAsync)
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      // @ts-ignore
      Constants?.easConfig?.projectId

    if (!projectId) {
      return {
        ok: false,
        error: 'Missing EAS projectId in app.json extra.eas.projectId',
      }
    }

    // ✅ Get Expo push token
    const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId })
    const expoPushToken = tokenRes.data

    if (!expoPushToken || !isExpoToken(expoPushToken)) {
      return { ok: false, error: 'Invalid Expo push token.' }
    }

    // ✅ Stable device id (CRITICAL for your UNIQUE(device_id))
    const deviceId = await getStableDeviceId()
    if (!deviceId) {
      // If device_id stays null, you may create duplicates.
      // With your schema, it's best to REQUIRE device_id.
      return {
        ok: false,
        error: 'Failed to get stable device_id (expo-application).',
      }
    }

    // ✅ UPSERT by device_id so token can rotate without breaking UNIQUE(device_id)
    const payload = {
      user_id: user.id,
      expo_push_token: expoPushToken,
      device_id: deviceId,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    }

    const { error: upsertErr } = await supabase
      .from('push_tokens')
      .upsert(payload, { onConflict: 'device_id' })

    if (upsertErr) {
      console.log('❌ push token upsert error:', upsertErr)
      return { ok: false, error: upsertErr.message }
    }

    return { ok: true, token: expoPushToken, device_id: deviceId }
  } catch (e: any) {
    console.log('❌ push register failed:', e?.message || e)
    return { ok: false, error: e?.message || String(e) }
  }
}
