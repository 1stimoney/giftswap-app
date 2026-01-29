import { supabase } from '@/lib/supabase'
import * as Application from 'expo-application'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'

async function getDeviceId() {
  // best-effort device identifier
  if (Platform.OS === 'android')
    return Application.getAndroidId() ?? 'android-unknown'
  // iOS: identifierForVendor can be null sometimes
  return Application.getIosIdForVendorAsync
    ? (await Application.getIosIdForVendorAsync()) ?? 'ios-unknown'
    : 'ios-unknown'
}

export function useRegisterPushToken() {
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true
    ;(async () => {
      try {
        const { data: auth } = await supabase.auth.getUser()
        const user = auth.user
        if (!user) return // only register when logged in

        if (!Device.isDevice) {
          console.log('Push tokens require a physical device.')
          return
        }

        // 1) Ask permission (this shows the allow/deny popup)
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

        // 2) Get expo token
        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ||
          Constants.easConfig?.projectId

        if (!projectId) {
          console.log('Missing EAS projectId for push token.')
          return
        }

        const tokenRes = await Notifications.getExpoPushTokenAsync({
          projectId,
        })
        const expoPushToken = tokenRes.data

        // 3) Save token (multiple devices supported)
        const device_id = await getDeviceId()

        const payload = {
          user_id: user.id,
          expo_push_token: expoPushToken,
          device_id,
          platform: Platform.OS,
        }

        const { error } = await supabase
          .from('push_tokens')
          .upsert(payload, { onConflict: 'user_id,device_id' })

        if (error) {
          console.log('❌ push token save error:', error)
        } else {
          console.log('✅ push token saved:', payload)
        }
      } catch (e) {
        console.log('❌ push register failed:', e)
      }
    })()
  }, [])
}
