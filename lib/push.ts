import { supabase } from '@/lib/supabase'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

function getProjectId() {
  // Works across SDKs. Prefer EAS projectId.
  const easProjectId =
    (Constants.expoConfig as any)?.extra?.eas?.projectId ||
    (Constants as any)?.easConfig?.projectId

  return easProjectId
}

export async function registerForPushAndSave() {
  if (!Device.isDevice) return // Push needs a real device

  // Android channel (important)
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    })
  }

  // Permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return

  const projectId = getProjectId()
  const tokenRes = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  )
  const expoPushToken = tokenRes.data

  // Save token in Supabase
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) return

  // Upsert token (multi-device supported)
  await supabase.from('push_tokens').upsert(
    {
      user_id: user.id,
      token: expoPushToken,
      device: Device.modelName ?? null,
      platform: Platform.OS,
    },
    { onConflict: 'token' }
  )

  return expoPushToken
}
