import { supabase } from '@/lib/supabase'
import * as Application from 'expo-application'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

async function getDeviceId() {
  if (Platform.OS === 'android')
    return (await Application.getAndroidId()) ?? 'android-unknown'
  if (Platform.OS === 'ios' && Application.getIosIdForVendorAsync) {
    return (await Application.getIosIdForVendorAsync()) ?? 'ios-unknown'
  }
  return 'unknown'
}

export async function registerPushTokenIfNeeded() {
  try {
    // ✅ Skip web completely (prevents vapid error)
    if (Platform.OS === 'web') {
      console.log('Skipping push registration on web.')
      return
    }

    // ✅ Must be a real device for Expo push tokens
    if (!Device.isDevice) {
      console.log('Push tokens require a physical device.')
      return
    }

    const { data: auth } = await supabase.auth.getUser()
    const user = auth.user
    if (!user) return

    // Ask permission
    const perm = await Notifications.getPermissionsAsync()
    let status = perm.status
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync()
      status = req.status
    }
    if (status !== 'granted') {
      console.log('User denied notifications')
      return
    }

    // ✅ EAS projectId
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId

    if (!projectId) {
      console.log('Missing EAS projectId')
      return
    }

    const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId })
    const expoPushToken = tokenRes.data

    const device_id = await getDeviceId()

    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: user.id,
        expo_push_token: expoPushToken,
        device_id,
        platform: Platform.OS,
      },
      { onConflict: 'user_id,device_id' }
    )

    if (error) {
      console.log('❌ push token save error:', error)
      return
    }

    console.log('✅ push token saved:', expoPushToken)
  } catch (e) {
    console.log('❌ push register failed:', e)
  }
}
