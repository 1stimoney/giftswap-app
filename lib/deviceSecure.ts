import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

export async function getSecureItem(key: string) {
  if (Platform.OS === 'web') return null
  return SecureStore.getItemAsync(key)
}

export async function setSecureItem(key: string, value: string) {
  if (Platform.OS === 'web') return
  return SecureStore.setItemAsync(key, value)
}
